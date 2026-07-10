import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';
import { FLOOR, mintToken, requireApproval, PermissionDenied } from '../approvals.ts';

// The approval/autonomy tool surface (MCP contract §7). Hermes drives these
// after the household answers an approval question (options=[approve, reject]).

// ----- approval_issue --------------------------------------------------
// The approve path: records the decision and mints a single-use token the
// gated tool then redeems. Bumps the streak the review job uses to propose
// graduating a kind to automatic.

export const approvalIssueSchema = {
  action_kind: z.string().min(1).describe("The gated tool being approved, e.g. 'todo_delete'."),
  summary: z.string().optional().describe('Human-readable summary of what was approved.'),
  requested_via: z.enum(['telegram', 'wall', 'phone']).optional(),
  decided_by: z.string().optional().describe('User handle who approved.'),
  actor: ACTOR,
};

export async function approvalIssue(args: {
  action_kind: string;
  summary?: string;
  requested_via?: 'telegram' | 'wall' | 'phone';
  decided_by?: string;
}) {
  const { token, token_id, exp } = mintToken(args.action_kind);
  await sql.begin(async (tx) => {
    await tx`
      insert into approvals (action_kind, summary, outcome, token_id, requested_via, decided_by)
      values (${args.action_kind}, ${args.summary ?? null}, 'approved', ${token_id},
              ${args.requested_via ?? null}, ${args.decided_by ?? null})
    `;
    await tx`
      insert into autonomy_policy (action_kind, mode, consecutive_approvals, total_approvals)
      values (${args.action_kind}, 'ask', 1, 1)
      on conflict (action_kind) do update set
        consecutive_approvals = autonomy_policy.consecutive_approvals + 1,
        total_approvals = autonomy_policy.total_approvals + 1,
        updated_at = now()
    `;
  });
  return { token, action_kind: args.action_kind, expires_at: new Date(exp).toISOString() };
}

// ----- approval_reject -------------------------------------------------
// The reject path: records it and resets the streak so a graduation proposal
// won't fire off a run of approvals that the household actually pushed back on.

export const approvalRejectSchema = {
  action_kind: z.string().min(1),
  summary: z.string().optional(),
  requested_via: z.enum(['telegram', 'wall', 'phone']).optional(),
  decided_by: z.string().optional(),
  actor: ACTOR,
};

export async function approvalReject(args: {
  action_kind: string;
  summary?: string;
  requested_via?: 'telegram' | 'wall' | 'phone';
  decided_by?: string;
}) {
  await sql.begin(async (tx) => {
    await tx`
      insert into approvals (action_kind, summary, outcome, requested_via, decided_by)
      values (${args.action_kind}, ${args.summary ?? null}, 'rejected',
              ${args.requested_via ?? null}, ${args.decided_by ?? null})
    `;
    await tx`
      insert into autonomy_policy (action_kind, mode, total_rejections)
      values (${args.action_kind}, 'ask', 1)
      on conflict (action_kind) do update set
        consecutive_approvals = 0,
        total_rejections = autonomy_policy.total_rejections + 1,
        updated_at = now()
    `;
  });
  return { ok: true, action_kind: args.action_kind };
}

// ----- autonomy_policy_list --------------------------------------------
// What the review job reads to decide whether to propose graduation. Adds a
// `floor` flag (from code) and a `graduatable` hint (streak ≥ 5, not floor,
// currently ask).

export const autonomyPolicyListSchema = { actor: ACTOR };

export async function autonomyPolicyList() {
  const rows = await sql<
    {
      action_kind: string;
      mode: 'auto' | 'ask';
      consecutive_approvals: number;
      total_approvals: number;
      total_rejections: number;
      graduated_at: string | null;
      notes: string | null;
    }[]
  >`
    select action_kind, mode, consecutive_approvals, total_approvals,
           total_rejections, graduated_at, notes
    from autonomy_policy
    order by action_kind
  `;
  return {
    policies: rows.map((r) => ({
      ...r,
      floor: FLOOR.has(r.action_kind),
      graduatable:
        r.mode === 'ask' && !FLOOR.has(r.action_kind) && r.consecutive_approvals >= 5,
    })),
  };
}

// ----- autonomy_policy_set ---------------------------------------------
// Change a kind's mode. Itself gated (needs an approval token — the household
// must approve making something automatic). Floor kinds refuse 'auto'.

export const autonomyPolicySetSchema = {
  action_kind: z.string().min(1),
  mode: z.enum(['auto', 'ask']),
  approval_token: z.string().describe('Approval token for action_kind=autonomy_policy_set.'),
  actor: ACTOR,
};

export async function autonomyPolicySet(args: {
  action_kind: string;
  mode: 'auto' | 'ask';
  approval_token: string;
}) {
  if (args.mode === 'auto' && FLOOR.has(args.action_kind)) {
    const err = new PermissionDenied(
      `'${args.action_kind}' is a floor action and can never be made automatic`,
    );
    throw err;
  }
  await requireApproval('autonomy_policy_set', args.approval_token);

  const [row] = await sql<{ action_kind: string; mode: string }[]>`
    insert into autonomy_policy (action_kind, mode, graduated_at)
    values (${args.action_kind}, ${args.mode}, ${args.mode === 'auto' ? sql`now()` : null})
    on conflict (action_kind) do update set
      mode = excluded.mode,
      graduated_at = case when excluded.mode = 'auto' then now() else null end,
      updated_at = now()
    returning action_kind, mode
  `;
  return { ok: true, ...row };
}
