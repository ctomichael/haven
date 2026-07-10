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

// Entities the control (write) endpoint is allowed to command. The read API is
// tunnel-exposed, so writes are locked to an explicit allowlist — a leaked URL
// still can't drive arbitrary devices. Default: the living-room heat pump.
const CONTROLLABLE = new Set(
  (process.env.HAVEN_HA_CLIMATE_ENTITIES ?? 'climate.mitsubishi_heatpump')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

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

// Domains the general service-call endpoint (ha_entity_call_service) may drive.
// Narrower than reads — physical-state changes. `automation` is here for
// automation.reload after ha_automation_write. Widen deliberately via env.
const SERVICE_DOMAINS = new Set(
  (process.env.HAVEN_HA_SERVICE_DOMAINS ?? 'climate,light,switch,fan,cover,automation')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

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

// GET /api/ha/search?q=heat&domain=climate — entities matching q, allowlisted.
ha.get('/search', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const q = (c.req.query('q') ?? '').toLowerCase();
  const domain = c.req.query('domain') ?? '';
  try {
    const byId = await getStates();
    const out: HaEntity[] = [];
    for (const raw of byId.values()) {
      const d = domainOf(raw.entity_id);
      if (!ALLOWED_DOMAINS.has(d)) continue;
      if (domain && d !== domain) continue;
      const name = String(raw.attributes?.friendly_name ?? '').toLowerCase();
      if (q && !raw.entity_id.toLowerCase().includes(q) && !name.includes(q)) continue;
      out.push(trim(raw));
      if (out.length >= 50) break;
    }
    return c.json({ entities: out });
  } catch (e) {
    return c.json({ error: 'ha_unavailable', detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// POST /api/ha/service  { domain, service, entity_id?, data? }
// General guarded service call for ha_entity_call_service and automation.reload.
ha.post('/service', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const body = (await c.req.json().catch(() => null)) as
    | { domain?: string; service?: string; entity_id?: string; data?: Record<string, unknown> }
    | null;
  const domain = body?.domain ?? '';
  const service = body?.service ?? '';
  if (!domain || !service) return c.json({ error: 'bad_request' }, 400);
  if (!SERVICE_DOMAINS.has(domain)) return c.json({ error: 'forbidden_domain' }, 403);
  // If the call targets a specific entity, it must be in a readable domain too.
  if (body?.entity_id && !ALLOWED_DOMAINS.has(domainOf(body.entity_id))) {
    return c.json({ error: 'forbidden_entity' }, 403);
  }
  const data: Record<string, unknown> = {
    ...(body?.data ?? {}),
    ...(body?.entity_id ? { entity_id: body.entity_id } : {}),
  };
  try {
    await callService(domain, service, data);
    cache = null; // reflect any state change on the next read
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: 'ha_command_failed', detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// --- Climate: read + guarded control --------------------------------------

export type ClimateState = {
  entity_id: string;
  available: boolean;
  hvac_mode: string; // 'off' | 'heat' | 'cool' | …
  on: boolean;
  hvac_action: string | null; // 'heating' | 'idle' | 'off' | …
  current_temperature: number | null;
  target_temperature: number | null;
  fan_mode: string | null;
  fan_modes: string[];
  hvac_modes: string[];
  min_temp: number;
  max_temp: number;
  step: number;
  friendly_name: string | null;
};

function normalizeClimate(raw: HaRawState): ClimateState {
  const a = raw.attributes as Record<string, unknown>;
  const num = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    entity_id: raw.entity_id,
    available: raw.state !== 'unavailable',
    hvac_mode: raw.state,
    on: raw.state !== 'off' && raw.state !== 'unavailable',
    hvac_action: (a.hvac_action as string) ?? null,
    current_temperature: num(a.current_temperature),
    target_temperature: num(a.temperature),
    fan_mode: (a.fan_mode as string) ?? null,
    fan_modes: (a.fan_modes as string[]) ?? [],
    hvac_modes: (a.hvac_modes as string[]) ?? [],
    min_temp: num(a.min_temp) ?? 16,
    max_temp: num(a.max_temp) ?? 30,
    step: num(a.target_temp_step) ?? 1,
    friendly_name: (a.friendly_name as string) ?? null,
  };
}

async function callService(
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${HA_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HA ${domain}.${service} → HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/ha/climate?entity=climate.x
ha.get('/climate', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const entity = c.req.query('entity') ?? '';
  if (domainOf(entity) !== 'climate') return c.json({ error: 'bad_entity' }, 400);
  try {
    const byId = await getStates();
    const raw = byId.get(entity);
    if (!raw) return c.json({ error: 'not_found' }, 404);
    return c.json(normalizeClimate(raw));
  } catch (e) {
    const raw = cache?.byId.get(entity);
    if (raw) return c.json(normalizeClimate(raw));
    return c.json({ error: 'ha_unavailable', detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// POST /api/ha/climate  { entity, command, value? }
ha.post('/climate', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const body = (await c.req.json().catch(() => null)) as
    | { entity?: string; command?: string; value?: unknown }
    | null;
  const entity = body?.entity ?? '';
  if (!CONTROLLABLE.has(entity)) return c.json({ error: 'forbidden_entity' }, 403);

  let service: string;
  let data: Record<string, unknown>;
  switch (body?.command) {
    case 'turn_on':
      service = 'turn_on';
      data = { entity_id: entity };
      break;
    case 'turn_off':
      service = 'turn_off';
      data = { entity_id: entity };
      break;
    case 'set_temperature':
      if (typeof body.value !== 'number') return c.json({ error: 'bad_value' }, 400);
      service = 'set_temperature';
      data = { entity_id: entity, temperature: body.value };
      break;
    case 'set_fan_mode':
      if (typeof body.value !== 'string') return c.json({ error: 'bad_value' }, 400);
      service = 'set_fan_mode';
      data = { entity_id: entity, fan_mode: body.value };
      break;
    case 'set_hvac_mode':
      if (typeof body.value !== 'string') return c.json({ error: 'bad_value' }, 400);
      service = 'set_hvac_mode';
      data = { entity_id: entity, hvac_mode: body.value };
      break;
    default:
      return c.json({ error: 'bad_command' }, 400);
  }

  try {
    await callService('climate', service, data);
    cache = null; // bust the states snapshot so the read reflects the change
    const byId = await getStates();
    const raw = byId.get(entity);
    return c.json(raw ? normalizeClimate(raw) : { ok: true });
  } catch (e) {
    return c.json(
      { error: 'ha_command_failed', detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

// --- Daily energy (heat-pump "runtime" proxy) ------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// Cumulative value as of ts (last sample at or before ts). Points sorted asc.
function valueAt(points: HaHistoryPoint[], tsMs: number): number | null {
  let val: number | null = null;
  for (const p of points) {
    if (new Date(p.t).getTime() <= tsMs) val = p.v;
    else break;
  }
  return val;
}

// GET /api/ha/energy-daily?entity=sensor.x&days=7
// Derives per-local-day kWh from a monotonic cumulative energy counter.
ha.get('/energy-daily', async (c) => {
  if (!HA_URL || !HA_TOKEN) return c.json({ error: 'ha_not_configured' }, 503);
  const entity = c.req.query('entity') ?? '';
  if (!entity || !ALLOWED_DOMAINS.has(domainOf(entity))) return c.json({ error: 'bad_entity' }, 400);
  const days = Math.min(Math.max(Number(c.req.query('days')) || 7, 1), 31);

  try {
    // Fetch an extra day so the oldest bucket has a start reading.
    const hist = await fetchHistory(entity, (days + 1) * 24);
    const pts = hist.points;
    const now = Date.now();
    const midnightToday = new Date();
    midnightToday.setHours(0, 0, 0, 0);

    const out: { day: string; label: string; kwh: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(midnightToday.getTime() - i * DAY_MS);
      const dayEndMs = Math.min(dayStart.getTime() + DAY_MS, now);
      const vStart = valueAt(pts, dayStart.getTime());
      const vEnd = valueAt(pts, dayEndMs);
      const kwh = vStart != null && vEnd != null ? Math.max(0, vEnd - vStart) : 0;
      const y = dayStart.getFullYear();
      const m = String(dayStart.getMonth() + 1).padStart(2, '0');
      const dd = String(dayStart.getDate()).padStart(2, '0');
      out.push({
        day: `${y}-${m}-${dd}`, // local calendar date, matching the bucket
        label: dayStart.toLocaleDateString('en-GB', { weekday: 'narrow' }).toUpperCase(),
        kwh: Math.round(kwh * 100) / 100,
      });
    }
    c.header('cache-control', 'public, max-age=300');
    return c.json({ unit: hist.unit ?? 'kWh', days: out });
  } catch (e) {
    return c.json({ error: 'ha_unavailable', detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});

export default ha;
