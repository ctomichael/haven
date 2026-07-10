import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { sql } from './client.ts';

// Approval tokens + autonomy policy — the gate in front of write_med and
// destructive tools (MCP contract §7). A gated tool calls requireApproval()
// first: if the action_kind is `auto` in autonomy_policy it proceeds; else it
// needs a valid, unexpired, single-use approval token that Hermes minted via
// approval_issue after the household approved.
//
// Tokens are HMAC-signed (stateless verification, so a freshly-spawned MCP
// process can verify one another spawn issued) and single-use (redemption is
// recorded in `approvals.used_at`). The signing secret comes from
// HAVEN_APPROVAL_SECRET; a dev default keeps the laptop frictionless but is
// warned about so it never silently ships to prod.

const SECRET = (() => {
  const s = process.env.HAVEN_APPROVAL_SECRET;
  if (s) return s;
  console.error(
    '[approvals] HAVEN_APPROVAL_SECRET unset — using an insecure dev default. Set it in /etc/haven/.env for production.',
  );
  return 'haven-dev-approval-secret-do-not-use-in-prod';
})();

const TTL_MS = 10 * 60 * 1000; // 10 minutes

// Kinds that may NEVER be made auto, enforced here in code so a bug or a stray
// autonomy_policy_set can't disable the gate on something destructive.
export const FLOOR = new Set([
  'calendar_event_delete',
  'todo_delete',
  'ha_automation_remove',
  'widget_remove',
  'autonomy_policy_set',
]);

export class PermissionDenied extends Error {
  code = 'permission_denied' as const;
  required_approval = true;
  constructor(msg: string) {
    super(msg);
  }
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// token = base64url(JSON{tid, ak, exp}).<hmac>
export function mintToken(actionKind: string): { token: string; token_id: string; exp: number } {
  const token_id = randomUUID();
  const exp = Date.now() + TTL_MS;
  const body = Buffer.from(JSON.stringify({ tid: token_id, ak: actionKind, exp })).toString(
    'base64url',
  );
  const token = `${body}.${sign(body)}`;
  return { token, token_id, exp };
}

function parseToken(token: string): { tid: string; ak: string; exp: number } | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, sign(body))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export async function policyMode(actionKind: string): Promise<'auto' | 'ask'> {
  // Floor kinds are always 'ask' regardless of what the table says.
  if (FLOOR.has(actionKind)) return 'ask';
  const [row] = await sql<{ mode: 'auto' | 'ask' }[]>`
    select mode from autonomy_policy where action_kind = ${actionKind}
  `;
  return row?.mode ?? 'ask';
}

// Verify + redeem a token for a given action_kind. Single-use: the redeeming
// UPDATE only succeeds if the ledger row exists, matches the kind, and hasn't
// been used — so a replay finds used_at already set and fails.
async function redeemToken(token: string, actionKind: string): Promise<void> {
  const parsed = parseToken(token);
  if (!parsed) throw new PermissionDenied('invalid approval token (bad signature)');
  if (parsed.ak !== actionKind) {
    throw new PermissionDenied(`approval token is for '${parsed.ak}', not '${actionKind}'`);
  }
  if (Date.now() > parsed.exp) throw new PermissionDenied('approval token expired');

  const rows = await sql<{ id: string }[]>`
    update approvals
    set used_at = now()
    where token_id = ${parsed.tid}
      and action_kind = ${actionKind}
      and outcome = 'approved'
      and used_at is null
    returning id
  `;
  if (rows.length === 0) {
    throw new PermissionDenied('approval token already used, revoked, or unknown');
  }
}

/**
 * Gate a write_med/destructive action. Returns the effective mode used
 * ('auto' or 'approved') for the caller to include in its audit/notify.
 * Throws PermissionDenied if approval is required and no valid token is given.
 */
export async function requireApproval(
  actionKind: string,
  token: string | undefined,
): Promise<'auto' | 'approved'> {
  const mode = await policyMode(actionKind);
  if (mode === 'auto') return 'auto';
  if (!token) {
    throw new PermissionDenied(
      `'${actionKind}' requires approval — obtain a token via approval_issue after the household approves`,
    );
  }
  await redeemToken(token, actionKind);
  return 'approved';
}
