import { createHash } from 'node:crypto';

import { AGENT_ID } from './config.ts';
import { sql } from './client.ts';
import { asJson } from './jsonb.ts';

type ResultStatus = 'ok' | 'error' | 'deferred';

type AuditArgs = {
  tool: string;
  args: unknown;
  actor: string | undefined;
  resultStatus: ResultStatus;
  details?: unknown;
};

/**
 * Write an audit_log row for an MCP tool call. Failures are swallowed
 * (logged to stderr) so audit problems never break user-facing calls.
 */
export async function audit({
  tool,
  args,
  actor,
  resultStatus,
  details,
}: AuditArgs): Promise<void> {
  try {
    const argsSha = createHash('sha256')
      .update(JSON.stringify(args ?? null))
      .digest('hex');
    await sql`
      insert into audit_log (agent_id, actor, tool, args_sha256, result_status, details)
      values (
        ${AGENT_ID},
        ${actor ?? null},
        ${tool},
        ${argsSha},
        ${resultStatus},
        ${details === undefined || details === null ? null : asJson(details as Record<string, unknown>)}
      )
    `;
  } catch (e) {
    console.error(
      `[audit] write failed for tool=${tool}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
