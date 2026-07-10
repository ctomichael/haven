import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import ical from 'node-ical';

import { audit } from '../audit.ts';
import { createEvent, updateEvent, deleteEvent, gcalConfigured } from '../services/gcal.ts';

// Read-only calendar, sourced from an ICS URL (HAVEN_CALENDAR_ICS_URL).
// The backend fetches + parses the feed (recurrences expanded) and serves
// normalised occurrences in a requested [from, to) window. Kept server-side
// so the ICS URL (often a secret Google address) never reaches the browser.

const ICS_URL = normaliseUrl(process.env.HAVEN_CALENDAR_ICS_URL ?? '');
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RANGE_DAYS = 62; // guard against pathological expansions
const DAY_MS = 24 * 60 * 60 * 1000;

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
};

function normaliseUrl(u: string): string {
  return u.replace(/^webcal:\/\//i, 'https://');
}

function eventDuration(ev: { start: Date; end?: Date }): number {
  return (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime();
}

function isAllDay(ev: { datetype?: string }): boolean {
  return ev.datetype === 'date';
}

function toEvent(
  ev: { summary?: string; location?: string; datetype?: string },
  start: Date,
  end: Date,
  id: string,
): CalEvent {
  return {
    id,
    title: ev.summary?.trim() || '(no title)',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: isAllDay(ev),
    location: ev.location?.trim() || null,
  };
}

/**
 * Parse an ICS document and return every occurrence overlapping [from, to),
 * expanding RRULE recurrences and honouring EXDATE exclusions and
 * RECURRENCE-ID overrides. Pure — no network — so it's unit-testable.
 *
 * Known limitation: recurring events crossing a DST boundary can be off by
 * the offset delta for occurrences on the far side of the change. Acceptable
 * for a household wall; revisit if it bites.
 */
export function expandIcs(icsText: string, from: Date, to: Date): CalEvent[] {
  const data = ical.sync.parseICS(icsText);
  const out: CalEvent[] = [];

  for (const key of Object.keys(data)) {
    const ev = data[key] as unknown as {
      type?: string;
      uid?: string;
      summary?: string;
      location?: string;
      datetype?: string;
      start: Date;
      end?: Date;
      rrule?: { between: (a: Date, b: Date, inc: boolean) => Date[] };
      exdate?: Record<string, Date>;
      recurrences?: Record<string, { start: Date; end?: Date; summary?: string; location?: string; datetype?: string }>;
    };
    if (ev.type !== 'VEVENT' || !ev.start) continue;

    if (!ev.rrule) {
      const end = ev.end ?? ev.start;
      if (end > from && ev.start < to) {
        out.push(toEvent(ev, ev.start, end, ev.uid ?? key));
      }
      continue;
    }

    // Recurring: expand across the window (widened by the event's duration so
    // an occurrence that began just before `from` but still overlaps counts).
    const dur = eventDuration(ev);
    const occurrences = ev.rrule.between(new Date(from.getTime() - dur), to, true);
    for (const date of occurrences) {
      const lookup = date.toISOString().substring(0, 10);

      const override = ev.recurrences?.[lookup];
      if (override) {
        const oEnd = override.end ?? override.start;
        if (oEnd > from && override.start < to) {
          out.push(toEvent(override, override.start, oEnd, `${ev.uid ?? key}_${override.start.toISOString()}`));
        }
        continue;
      }
      if (ev.exdate?.[lookup]) continue;

      const end = new Date(date.getTime() + dur);
      if (end > from && date < to) {
        out.push(toEvent(ev, date, end, `${ev.uid ?? key}_${date.toISOString()}`));
      }
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

// --- ICS text cache (single feed) --------------------------------------

let cache: { at: number; text: string } | null = null;
let inflight: Promise<string> | null = null;

async function fetchIcs(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ICS_URL, {
      headers: { accept: 'text/calendar, text/plain, */*' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ICS fetch → HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getIcsText(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.text;
  if (inflight) return inflight;
  inflight = fetchIcs()
    .then((text) => {
      cache = { at: Date.now(), text };
      return text;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function parseRange(fromParam?: string, toParam?: string): { from: Date; to: Date } {
  const now = Date.now();
  let from = fromParam ? new Date(fromParam) : new Date(now);
  let to = toParam ? new Date(toParam) : new Date(now + 7 * DAY_MS);
  if (Number.isNaN(from.getTime())) from = new Date(now);
  if (Number.isNaN(to.getTime())) to = new Date(now + 7 * DAY_MS);
  if (to <= from) to = new Date(from.getTime() + DAY_MS);
  // Clamp the window so a bad request can't force a huge expansion.
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    to = new Date(from.getTime() + MAX_RANGE_DAYS * DAY_MS);
  }
  return { from, to };
}

const calendar = new Hono();

// GET /api/calendar/events?from=ISO&to=ISO
calendar.get('/events', async (c) => {
  if (!ICS_URL) return c.json({ error: 'calendar_not_configured' }, 503);
  const { from, to } = parseRange(c.req.query('from'), c.req.query('to'));
  try {
    const text = await getIcsText();
    const events = expandIcs(text, from, to);
    c.header('cache-control', 'public, max-age=300');
    return c.json({ events, from: from.toISOString(), to: to.toISOString() });
  } catch (e) {
    if (cache) {
      c.header('x-haven-calendar-stale', '1');
      return c.json({ events: expandIcs(cache.text, from, to), from: from.toISOString(), to: to.toISOString() });
    }
    return c.json(
      { error: 'calendar_unavailable', detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

// --- Write-back (Google Calendar API) ----------------------------------
// Reads stay on the ICS feed above; these create/update/delete on the shared
// family calendar. The MCP calendar_event_* tools call these over localhost
// rather than duplicating Google auth in the MCP process.

const isoOrDate = z
  .string()
  .describe('ISO-8601 datetime with offset, or YYYY-MM-DD for all-day.');

const CreateBody = z.object({
  summary: z.string().min(1),
  start: isoOrDate,
  end: isoOrDate.optional(),
  all_day: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  time_zone: z.string().optional(),
  source_inbox_id: z.string().uuid().optional(),
});

function errStatus(e: unknown): 503 | 404 | 502 {
  const code = (e as { code?: string }).code;
  if (code === 'not_configured') return 503;
  if (code === 'not_found') return 404;
  return 502;
}

calendar.post('/events', zValidator('json', CreateBody), async (c) => {
  const args = c.req.valid('json');
  let status: 'ok' | 'error' = 'ok';
  let detail: unknown = null;
  try {
    const event = await createEvent(args);
    return c.json(event, 201);
  } catch (e) {
    status = 'error';
    detail = { error: (e as { code?: string }).code ?? 'gcal_error', message: String(e) };
    return c.json(detail, errStatus(e));
  } finally {
    void audit({ tool: 'calendar_event_create', args, actor: undefined, resultStatus: status, details: status === 'error' ? detail : null });
  }
});

const EventIdParam = z.object({ id: z.string().min(1) });
const UpdateBody = CreateBody.partial().omit({ source_inbox_id: true });

calendar.patch('/events/:id', zValidator('param', EventIdParam), zValidator('json', UpdateBody), async (c) => {
  const { id } = c.req.valid('param');
  const args = c.req.valid('json');
  let status: 'ok' | 'error' = 'ok';
  let detail: unknown = null;
  try {
    const event = await updateEvent(id, args);
    return c.json(event);
  } catch (e) {
    status = 'error';
    detail = { error: (e as { code?: string }).code ?? 'gcal_error', message: String(e) };
    return c.json(detail, errStatus(e));
  } finally {
    void audit({ tool: 'calendar_event_update', args: { id, ...args }, actor: undefined, resultStatus: status, details: status === 'error' ? detail : null });
  }
});

calendar.delete('/events/:id', zValidator('param', EventIdParam), async (c) => {
  const { id } = c.req.valid('param');
  let status: 'ok' | 'error' = 'ok';
  let detail: unknown = null;
  try {
    await deleteEvent(id);
    return c.json({ ok: true });
  } catch (e) {
    status = 'error';
    detail = { error: (e as { code?: string }).code ?? 'gcal_error', message: String(e) };
    return c.json(detail, errStatus(e));
  } finally {
    void audit({ tool: 'calendar_event_delete', args: { id }, actor: undefined, resultStatus: status, details: status === 'error' ? detail : null });
  }
});

// GET /api/calendar/config — is write-back available? (for the dashboard/debug)
calendar.get('/config', (c) => c.json({ write_enabled: gcalConfigured() }));

export default calendar;
