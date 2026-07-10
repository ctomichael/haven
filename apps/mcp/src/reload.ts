import { sql } from './client.ts';

// Push a reload to every connected surface. The backend LISTENs on this
// Postgres channel and fans it out over SSE — see apps/backend/src/events.ts.
// Best-effort: a missed reload must never fail the write that triggered it.
export async function notifyReload(
  reason: string,
  surface: 'wall' | 'phone' | 'all' = 'all',
): Promise<void> {
  try {
    await sql.notify(
      'haven_reload',
      JSON.stringify({ type: 'dashboard:reload', reason, surface }),
    );
  } catch {
    /* swallow — the write already succeeded */
  }
}
