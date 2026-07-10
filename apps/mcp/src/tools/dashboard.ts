import { z } from 'zod';

import { ACTOR } from '../schemas.ts';
import { notifyReload } from '../reload.ts';

// ----- dashboard_reload ------------------------------------------------
// Push an SSE refresh to connected surfaces. Contract §4: the reload tool
// dispatched Claude Code sessions call after committing a widget, and that
// Hermes can call after a batch of writes. Writes that mutate data already
// notify implicitly; this is the explicit hook for callers that changed
// files/registry rather than rows.

export const dashboardReloadSchema = {
  reason: z.string().min(1).describe('Short reason, e.g. "widget:snow_forecast landed".'),
  surface: z
    .enum(['wall', 'phone', 'all'])
    .default('all')
    .describe('Which surface(s) to refresh.'),
  actor: ACTOR,
};

export async function dashboardReload(args: {
  reason: string;
  surface: 'wall' | 'phone' | 'all';
}) {
  await notifyReload(args.reason, args.surface);
  return { ok: true, reason: args.reason, surface: args.surface };
}
