import { z } from 'zod';

// The widget plan envelope (MCP contract §5) — the structured object Hermes'
// widget-planning skill drafts and widget_propose validates before dispatch.
// Kept deliberately lenient on the descriptive fields (Hermes fills them in
// prose) and strict on the ones the pipeline acts on (kind, data_strategy,
// files, migrations, rollback).

export const dataStrategySchema = z.object({
  // "lowest viable rung": 0 markdown/notes, 1 events.kind, 2 column add, 3 new table.
  level: z.number().int().min(0).max(3),
  table: z.string().optional(),
  kind: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
});

export const captureSchema = z.object({
  method: z.enum([
    'ha_automation',
    'dashboard_button',
    'voice_command',
    'scheduled_pull',
    'manual_only',
  ]),
  detail: z.string().optional(),
});

export const planEnvelopeSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, 'slug: lowercase, digits, underscores')
    .describe('Widget slug, e.g. "snow_watch".'),
  kind: z.enum(['widget', 'automation', 'fix', 'feature']).default('widget'),
  intent: z.string().min(1).describe('Plain-language description of what the household asked for.'),
  surface: z.object({ wall: z.boolean().default(true), phone: z.boolean().default(false) }).default({
    wall: true,
    phone: false,
  }),
  visibility: z.enum(['wall', 'personal', 'household']).default('household'),
  schedule: z
    .object({ show_between: z.tuple([z.string(), z.string()]).optional(), refresh_cron: z.string().optional() })
    .optional(),
  data_strategy: dataStrategySchema,
  capture: z.array(captureSchema).default([]),
  ui: z.object({ component_template: z.string().optional() }).optional(),
  files_to_create: z.array(z.string()).default([]),
  files_to_modify: z.array(z.string()).default([]),
  migrations: z.array(z.string()).default([]),
  backfill: z.object({ needed: z.boolean(), detail: z.string().optional() }).optional(),
  // A mandatory rollback story — every dispatched change must be undoable.
  rollback: z.string().min(1).describe('How this change is rolled back (e.g. git revert of the widget commit).'),
});

export type PlanEnvelope = z.infer<typeof planEnvelopeSchema>;

// Compute the risk level from the plan: a migration or a data-model change
// raises it; a pure widget-file addition (level 0/1, no migration) is write_med
// because it still runs claude -p against the repo. Nothing here is auto by
// default — widget_dispatch's autonomy policy seed is 'ask'.
export function computeRisk(plan: PlanEnvelope): 'write_med' | 'destructive' {
  const touchesData = plan.data_strategy.level >= 2 || plan.migrations.length > 0;
  // Deleting/replacing existing files or a level-3 new table is the higher tier.
  return touchesData ? 'destructive' : 'write_med';
}
