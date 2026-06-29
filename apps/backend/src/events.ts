// In-process pub/sub for dashboard push events, bridged to a Postgres
// LISTEN/NOTIFY channel so *other* processes — chiefly the MCP server,
// which writes straight to Postgres and never goes through this HTTP
// server — can fan a reload out to every connected surface.
//
// Flow:  MCP/REST write → NOTIFY haven_reload → this LISTEN bridge →
//        publish() → each /api/events SSE stream → browser invalidateAll().

import { sql } from './db/client.ts';

export type DashboardEvent = {
  type: string; // e.g. 'dashboard:reload'
  reason?: string; // 'todo', 'shopping', …
  surface?: 'wall' | 'phone' | 'all';
  [k: string]: unknown;
};

export const RELOAD_CHANNEL = 'haven_reload';

type Listener = (e: DashboardEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publish(e: DashboardEvent): void {
  for (const fn of listeners) {
    try {
      fn(e);
    } catch {
      /* a slow/broken subscriber must not break the others */
    }
  }
}

/**
 * Convenience for in-process callers (the backend's own REST routes) to
 * reach every surface. Uses NOTIFY rather than publish() directly so the
 * event also reaches any other backend instance sharing the database.
 */
export async function notifyReload(
  e: Omit<DashboardEvent, 'type'> & { type?: string } = {},
): Promise<void> {
  const payload: DashboardEvent = { type: 'dashboard:reload', ...e };
  try {
    await sql.notify(RELOAD_CHANNEL, JSON.stringify(payload));
  } catch {
    /* best-effort — a missed reload is not worth failing the write over */
  }
}

/**
 * Start listening on the Postgres reload channel and republish onto the
 * in-process bus. Best-effort: if the DB is unreachable at boot the SSE
 * stream still works (heartbeat + started_at), we just won't get pushes.
 */
export async function startReloadBridge(): Promise<void> {
  try {
    await sql.listen(RELOAD_CHANNEL, (payload) => {
      let e: DashboardEvent = { type: 'dashboard:reload' };
      if (payload) {
        try {
          e = { type: 'dashboard:reload', ...JSON.parse(payload) };
        } catch {
          /* non-JSON payload — fall back to a bare reload */
        }
      }
      publish(e);
    });
    console.log(`[haven-backend] listening on pg channel '${RELOAD_CHANNEL}'`);
  } catch (err) {
    console.warn(
      `[haven-backend] pg LISTEN '${RELOAD_CHANNEL}' failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
