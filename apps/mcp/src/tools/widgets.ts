import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';
import { REPO_DIR } from '../config.ts';
import { requireApproval } from '../approvals.ts';
import { planEnvelopeSchema, computeRisk, type PlanEnvelope } from '../plan-schema.ts';

export const widgetListSchema = {
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  actor: ACTOR,
};

export async function widgetList(args: {
  visibility?: 'wall' | 'personal' | 'household';
}) {
  const rows = await sql`
    select name, visibility, sha, surface, registered_at, registered_by
    from widgets
    where (${args.visibility ?? null}::text is null or visibility = ${args.visibility ?? null})
    order by name
  `;
  return { widgets: rows };
}

export const widgetGetSchema = {
  name: z.string().describe('Widget slug — primary key on widgets table.'),
  actor: ACTOR,
};

export async function widgetGet(args: { name: string }) {
  const [row] = await sql`
    select name, manifest, sha, visibility, surface, registered_at, registered_by
    from widgets
    where name = ${args.name}
  `;
  if (!row) {
    const err = new Error(`widget ${args.name} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return row;
}

// ----- widget_propose --------------------------------------------------
// Validate a plan envelope (contract §5) drafted by Hermes' widget-planning
// skill and return it normalised with the computed risk. Pure — nothing is
// executed here (that's widget_dispatch).

export const widgetProposeSchema = {
  plan: z.record(z.unknown()).describe('The plan envelope to validate (contract §5 shape).'),
  actor: ACTOR,
};

export async function widgetPropose(args: { plan: Record<string, unknown> }) {
  const parsed = planEnvelopeSchema.safeParse(args.plan);
  if (!parsed.success) {
    const err = new Error(`invalid plan: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    (err as { code?: string }).code = 'invalid_args';
    throw err;
  }
  const risk = computeRisk(parsed.data);
  return { plan: parsed.data, risk, needs_approval: true };
}

// ----- widget_dispatch -------------------------------------------------
// Gated (approval token). Records an agent_tasks row and spawns the detached
// dispatch-runner (worktree → claude -p → verify → push). Returns immediately;
// poll widget_dispatch_status.

const RUNNER = fileURLToPath(new URL('../dispatch-runner.ts', import.meta.url));

async function launch(plan: PlanEnvelope, requestedBy?: string): Promise<{ task_id: string; status: string }> {
  const [task] = await sql<{ id: string }[]>`
    insert into agent_tasks (kind, slug, plan, status, requested_by)
    values (${plan.kind}, ${plan.name}, ${asJson(plan as unknown as Record<string, unknown>)}, 'queued', ${requestedBy ?? null})
    returning id
  `;
  const taskId = task!.id;
  // Detached so the runner outlives this MCP call (and the MCP process itself).
  const child = spawn('bun', ['run', RUNNER, taskId], {
    cwd: REPO_DIR,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return { task_id: taskId, status: 'queued' };
}

export const widgetDispatchSchema = {
  plan: z.record(z.unknown()).describe('The validated plan envelope (from widget_propose).'),
  approval_token: z.string().describe('Approval token for action_kind=widget_dispatch.'),
  requested_by: z.string().optional(),
  actor: ACTOR,
};

export async function widgetDispatch(args: {
  plan: Record<string, unknown>;
  approval_token: string;
  requested_by?: string;
}) {
  const parsed = planEnvelopeSchema.safeParse(args.plan);
  if (!parsed.success) {
    const err = new Error(`invalid plan: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    (err as { code?: string }).code = 'invalid_args';
    throw err;
  }
  await requireApproval('widget_dispatch', args.approval_token);
  return launch(parsed.data, args.requested_by);
}

// ----- widget_dispatch_status ------------------------------------------

export const widgetDispatchStatusSchema = {
  task_id: z.string().uuid(),
  actor: ACTOR,
};

export async function widgetDispatchStatus(args: { task_id: string }) {
  const [row] = await sql`
    select id, kind, slug, status, branch, commit_sha, error, log_path,
           requested_by, started_at, finished_at, created_at
    from agent_tasks where id = ${args.task_id}
  `;
  if (!row) {
    const err = new Error(`task ${args.task_id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return row;
}

// ----- widget_remove ---------------------------------------------------
// Destructive floor kind. Dispatches a removal plan through the same pipeline
// (claude -p removes the widget folder + registry entry), so removal is a
// reviewable, revertable commit like any other.

export const widgetRemoveSchema = {
  name: z.string().min(1).describe('Widget slug to remove.'),
  reason: z.string().min(1),
  approval_token: z.string().describe('Approval token for action_kind=widget_remove.'),
  requested_by: z.string().optional(),
  actor: ACTOR,
};

export async function widgetRemove(args: {
  name: string;
  reason: string;
  approval_token: string;
  requested_by?: string;
}) {
  await requireApproval('widget_remove', args.approval_token);
  const plan: PlanEnvelope = {
    name: args.name,
    kind: 'fix',
    intent: `Remove the "${args.name}" widget: delete its folder under apps/dashboard/src/lib/widgets/${args.name}/ and its entry in apps/dashboard/widgets.json. Reason: ${args.reason}`,
    surface: { wall: true, phone: false },
    visibility: 'household',
    data_strategy: { level: 0 },
    capture: [],
    files_to_create: [],
    files_to_modify: ['apps/dashboard/widgets.json'],
    migrations: [],
    rollback: `git revert the removal commit to restore the ${args.name} widget`,
  };
  return launch(plan, args.requested_by);
}
