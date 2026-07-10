import { z } from 'zod';

import { ACTOR } from '../schemas.ts';
import { BACKEND_URL } from '../config.ts';
import { notifyReload } from '../reload.ts';

// Calendar tools proxy to the backend (which owns Google auth + the ICS
// reader) rather than re-implementing either in the MCP process. Reads come
// from the ICS mirror; writes hit the Google Calendar API write-back.

async function backend(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = new Error(
      `backend ${init?.method ?? 'GET'} ${path} → HTTP ${res.status}: ${text}`,
    );
    (err as { code?: string }).code =
      (data.error as string) ?? (res.status === 503 ? 'not_configured' : 'backend_error');
    throw err;
  }
  return data;
}

// ----- calendar_list_events --------------------------------------------

export const calendarListEventsSchema = {
  from: z.string().datetime().optional().describe('Window start (ISO); default now.'),
  to: z.string().datetime().optional().describe('Window end (ISO); default +7 days.'),
  actor: ACTOR,
};

export async function calendarListEvents(args: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (args.from) qs.set('from', args.from);
  if (args.to) qs.set('to', args.to);
  const q = qs.toString();
  return backend(`/api/calendar/events${q ? `?${q}` : ''}`);
}

// ----- calendar_event_create -------------------------------------------
// write_med per contract, but the default autonomy policy runs it as `auto`
// (additive, easy to delete). Creates on the shared family calendar.

export const calendarEventCreateSchema = {
  summary: z.string().min(1).describe('Event title, e.g. "Nico — doctor".'),
  start: z
    .string()
    .describe("ISO-8601 datetime with offset (timed) or 'YYYY-MM-DD' (all-day)."),
  end: z.string().optional().describe('End; defaults to +1h (timed) / +1 day (all-day).'),
  all_day: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  time_zone: z.string().optional().describe("IANA tz; defaults to Pacific/Auckland."),
  source_inbox_id: z.string().uuid().optional(),
  actor: ACTOR,
};

export async function calendarEventCreate(args: Record<string, unknown>) {
  const { actor: _actor, ...body } = args;
  const event = await backend('/api/calendar/events', { method: 'POST', body });
  await notifyReload('calendar_event_create');
  return event;
}

// ----- calendar_event_update -------------------------------------------

export const calendarEventUpdateSchema = {
  id: z.string().min(1).describe('Google event id.'),
  summary: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  all_day: z.boolean().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  time_zone: z.string().optional(),
  actor: ACTOR,
};

export async function calendarEventUpdate(args: Record<string, unknown>) {
  const { id, actor: _actor, ...body } = args as { id: string; actor?: string };
  const event = await backend(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  });
  await notifyReload('calendar_event_update');
  return event;
}
