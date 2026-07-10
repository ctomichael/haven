import { sql } from './client.ts';

// The backend LISTENs on this one Postgres channel and fans every payload out
// over SSE, using the payload's `type` as the SSE event name — see
// apps/backend/src/events.ts. All pushes are best-effort: a missed event must
// never fail the write that triggered it.
const CHANNEL = 'haven_reload';

async function notify(payload: Record<string, unknown>): Promise<void> {
  try {
    await sql.notify(CHANNEL, JSON.stringify(payload));
  } catch {
    /* swallow — the write already succeeded */
  }
}

// Push a data refresh (SSE 'dashboard:reload' → invalidateAll()).
export async function notifyReload(
  reason: string,
  surface: 'wall' | 'phone' | 'all' = 'all',
): Promise<void> {
  await notify({ type: 'dashboard:reload', reason, surface });
}

// Push an arbitrary typed event (e.g. 'agent:question') to the surfaces.
export async function notifyEvent(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await notify({ type, ...payload });
}
