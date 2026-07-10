// Google Calendar write-back. The dashboard still *reads* the calendar from
// the ICS feed (routes/calendar.ts); this service is the write path, so
// agent-created appointments land on the shared family Google Calendar and
// alert on everyone's phones. One shared calendar, one refresh token.
//
// Uses the Calendar API v3 over raw fetch (no googleapis dep — matches how
// the HA/weather/ICS integrations already work). An OAuth refresh token
// (obtained once via a manual consent flow) is exchanged for short-lived
// access tokens, cached until just before expiry.
//
// Config (in /etc/haven/.env; unset on the laptop → not_configured):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN     scope: https://www.googleapis.com/auth/calendar.events
//   HAVEN_GCAL_CALENDAR_ID         the shared family calendar id (…@group.calendar.google.com)

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
const CALENDAR_ID = process.env.HAVEN_GCAL_CALENDAR_ID;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEOUT_MS = 10_000;

export function gcalConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && CALENDAR_ID);
}

class NotConfiguredError extends Error {
  code = 'not_configured' as const;
  constructor() {
    super(
      'Google Calendar write-back is not configured — set GOOGLE_OAUTH_* and HAVEN_GCAL_CALENDAR_ID',
    );
  }
}

// --- Access-token cache -------------------------------------------------

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (!gcalConfigured()) throw new NotConfiguredError();
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        refresh_token: REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`token refresh → HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return token.value;
  } finally {
    clearTimeout(timer);
  }
}

async function api(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const at = await accessToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${at}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Calendar API ${init.method} ${path} → HTTP ${res.status}: ${text}`);
      (err as { code?: string }).code = res.status === 404 ? 'not_found' : 'gcal_error';
      throw err;
    }
    if (res.status === 204) return {};
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

// --- Event shape --------------------------------------------------------

export type CreateEventInput = {
  summary: string;
  // Timed events: ISO-8601 datetime with offset. All-day: 'YYYY-MM-DD'.
  start: string;
  end?: string;
  all_day?: boolean;
  description?: string;
  location?: string;
  time_zone?: string; // IANA, e.g. 'Pacific/Auckland'
  source_inbox_id?: string;
};

// Provenance footer so a human scanning the calendar can see what Haven made,
// and so events are bulk-identifiable/cleanable later.
const HAVEN_MARKER = '— added by Haven';

function buildEventBody(input: CreateEventInput): Record<string, unknown> {
  const tz = input.time_zone ?? process.env.HAVEN_TZ ?? 'Pacific/Auckland';
  const allDay = input.all_day ?? /^\d{4}-\d{2}-\d{2}$/.test(input.start);

  const start = allDay ? { date: input.start } : { dateTime: input.start, timeZone: tz };
  // Default duration: +1 day for all-day (exclusive end), +1h for timed.
  const end = input.end
    ? allDay
      ? { date: input.end }
      : { dateTime: input.end, timeZone: tz }
    : allDay
      ? { date: addDaysISO(input.start, 1) }
      : { dateTime: addHoursISO(input.start, 1), timeZone: tz };

  const description = [input.description?.trim(), HAVEN_MARKER].filter(Boolean).join('\n\n');

  return {
    summary: input.summary,
    start,
    end,
    ...(input.location ? { location: input.location } : {}),
    description,
    ...(input.source_inbox_id
      ? { extendedProperties: { private: { haven_inbox_id: input.source_inbox_id } } }
      : {}),
  };
}

function addHoursISO(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

export type EventResult = {
  id: string;
  htmlLink: string;
  summary: string;
  start: unknown;
  end: unknown;
};

function present(e: Record<string, unknown>): EventResult {
  return {
    id: String(e.id),
    htmlLink: String(e.htmlLink ?? ''),
    summary: String(e.summary ?? ''),
    start: e.start,
    end: e.end,
  };
}

export async function createEvent(input: CreateEventInput): Promise<EventResult> {
  const body = buildEventBody(input);
  const res = await api(`/calendars/${encodeURIComponent(CALENDAR_ID!)}/events`, {
    method: 'POST',
    body,
  });
  return present(res);
}

export async function updateEvent(
  eventId: string,
  patch: Partial<CreateEventInput>,
): Promise<EventResult> {
  // PATCH semantics: only send the fields the caller changed. Reuse the body
  // builder only for the parts present.
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) body.summary = patch.summary;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.description !== undefined) {
    body.description = [patch.description.trim(), HAVEN_MARKER].filter(Boolean).join('\n\n');
  }
  if (patch.start !== undefined || patch.end !== undefined || patch.all_day !== undefined) {
    const full = buildEventBody({
      summary: patch.summary ?? '',
      start: patch.start ?? '',
      end: patch.end,
      all_day: patch.all_day,
      time_zone: patch.time_zone,
    });
    if (patch.start !== undefined) body.start = full.start;
    if (patch.end !== undefined || patch.start !== undefined) body.end = full.end;
  }
  const res = await api(
    `/calendars/${encodeURIComponent(CALENDAR_ID!)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body },
  );
  return present(res);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await api(
    `/calendars/${encodeURIComponent(CALENDAR_ID!)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
}
