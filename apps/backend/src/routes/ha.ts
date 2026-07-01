import { Hono } from 'hono';

// Home Assistant read proxy. Widgets ask for specific entity ids; the backend
// fetches /api/states from HA (bearer token kept server-side), trims each
// entity to what the UI needs, and returns only the requested ones.
//
// Security: the backend's read API is reachable through the Cloudflare tunnel,
// so we never expose the whole HA state. Requests are filtered to an allowlist
// of safe, state-only domains — no device_tracker / person / camera / image,
// which would leak presence and video.

const HA_URL = (process.env.HAVEN_HA_URL ?? '').replace(/\/$/, '');
const HA_TOKEN = process.env.HAVEN_HA_TOKEN ?? '';
const CACHE_TTL_MS = 10_000;
const FETCH_TIMEOUT_MS = 8_000;

// Read-only domains the dashboard is allowed to surface. Widen as widgets
// need more; deliberately excludes presence/camera/media domains.
const ALLOWED_DOMAINS = new Set([
  'sensor',
  'binary_sensor',
  'weather',
  'climate',
  'sun',
  'light',
  'switch',
  'fan',
  'cover',
  'lock',
  'number',
  'select',
  'todo',
]);

type HaRawState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
};

export type HaEntity = {
  entity_id: string;
  state: string;
  unit: string | null;
  device_class: string | null;
  friendly_name: string | null;
  last_changed: string;
};

function trim(s: HaRawState): HaEntity {
  const a = s.attributes ?? {};
  return {
    entity_id: s.entity_id,
    state: s.state,
    unit: (a.unit_of_measurement as string) ?? null,
    device_class: (a.device_class as string) ?? null,
    friendly_name: (a.friendly_name as string) ?? null,
    last_changed: s.last_changed,
  };
}

function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? '';
}

// --- 10s snapshot cache so multiple widgets / page loads hit HA once --------

let cache: { at: number; byId: Map<string, HaRawState> } | null = null;
let inflight: Promise<Map<string, HaRawState>> | null = null;

async function fetchAllStates(): Promise<Map<string, HaRawState>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HA_URL}/api/states`, {
      headers: { authorization: `Bearer ${HA_TOKEN}`, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HA /api/states → HTTP ${res.status}`);
    const states = (await res.json()) as HaRawState[];
    return new Map(states.map((s) => [s.entity_id, s]));
  } finally {
    clearTimeout(timer);
  }
}

async function getStates(): Promise<Map<string, HaRawState>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.byId;
  if (inflight) return inflight;
  inflight = fetchAllStates()
    .then((byId) => {
      cache = { at: Date.now(), byId };
      return byId;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// --- History (for the temperature-history modal) ---------------------------

export type HaHistoryPoint = { t: string; v: number };

type HistoryResult = {
  entity_id: string;
  unit: string | null;
  points: HaHistoryPoint[];
  min: number | null;
  max: number | null;
};

const HISTORY_TTL_MS = 60_000;
const historyCache = new Map<string, { at: number; result: HistoryResult }>();

async function fetchHistory(entityId: string, hours: number): Promise<HistoryResult> {
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const url =
    `${HA_URL}/api/history/period/${start.toISOString()}` +
    `?filter_entity_id=${encodeURIComponent(entityId)}` +
    // end_time is REQUIRED — without it HA returns only ~one day from `start`,
    // not start→now, so longer ranges silently miss all recent data.
    `&end_time=${encodeURIComponent(now.toISOString())}` +
    // minimal_response keeps the first + last samples full (so we get the unit
    // from attributes) and trims the rest to {state, last_changed}.
    `&minimal_response`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let series: Array<{ state?: string; last_changed?: string; last_updated?: string; attributes?: Record<string, unknown> }>;
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${HA_TOKEN}`, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HA history → HTTP ${res.status}`);
    const body = (await res.json()) as unknown[][];
    series = (body[0] ?? []) as typeof series;
  } finally {
    clearTimeout(timer);
  }

  const points: HaHistoryPoint[] = [];
  for (const s of series) {
    const v = Number(s.state);
    const t = s.last_changed ?? s.last_updated;
    if (Number.isFinite(v) && t) points.push({ t, v });
  }
  // The unit lives on the first (full) sample's attributes when present.
  const first = series[0];
  const unit = (first?.attributes?.unit_of_measurement as string) ?? null;
  const values = points.map((p) => p.v);
  return {
    entity_id: entityId,
    unit,
    points,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

const ha = new Hono();

// GET /api/ha/history?entity=sensor.x&hours=24
ha.get('/history', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const entity = c.req.query('entity') ?? '';
  if (!entity) return c.json({ error: 'no_entity' }, 400);
  if (!ALLOWED_DOMAINS.has(domainOf(entity))) return c.json({ error: 'forbidden_domain' }, 403);

  const hours = Math.min(Math.max(Number(c.req.query('hours')) || 24, 1), 168);
  const key = `${entity}:${hours}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < HISTORY_TTL_MS) {
    c.header('cache-control', 'public, max-age=60');
    return c.json(cached.result);
  }
  try {
    const result = await fetchHistory(entity, hours);
    historyCache.set(key, { at: Date.now(), result });
    c.header('cache-control', 'public, max-age=60');
    return c.json(result);
  } catch (e) {
    if (cached) return c.json(cached.result);
    return c.json(
      { error: 'ha_unavailable', detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

// GET /api/ha/entities?ids=sensor.a,sensor.b
ha.get('/entities', async (c) => {
  if (!HA_URL || !HA_TOKEN) {
    return c.json({ error: 'ha_not_configured' }, 503);
  }
  const idsParam = c.req.query('ids') ?? '';
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return c.json({ error: 'no_ids' }, 400);

  // Drop anything outside the allowlist before we even look it up.
  const allowed = ids.filter((id) => ALLOWED_DOMAINS.has(domainOf(id)));

  try {
    const byId = await getStates();
    const entities: HaEntity[] = [];
    for (const id of allowed) {
      const raw = byId.get(id);
      if (raw) entities.push(trim(raw));
    }
    c.header('cache-control', 'public, max-age=10');
    return c.json({ entities });
  } catch (e) {
    if (cache) {
      // Serve from the last good snapshot rather than failing the widget.
      const entities = allowed
        .map((id) => cache!.byId.get(id))
        .filter((r): r is HaRawState => r !== undefined)
        .map(trim);
      c.header('x-haven-ha-stale', '1');
      return c.json({ entities });
    }
    return c.json(
      { error: 'ha_unavailable', detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

export default ha;
