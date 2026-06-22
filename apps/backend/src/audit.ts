import { createHash } from 'node:crypto';

import { sql } from './db/client.ts';
import { asJson } from './db/jsonb.ts';

/**
 * Write an audit_log row for a REST-side action. Failures are swallowed
 * so audit problems never break user-facing calls. Mirrors the MCP audit
 * writer but with agent_id pinned to 'dashboard-backend'.
 */
const AGENT_ID = 'dashboard-backend';

type ResultStatus = 'ok' | 'error' | 'deferred';

type AuditArgs = {
  tool: string;
  args: unknown;
  actor: string | undefined;
  resultStatus: ResultStatus;
  details?: unknown;
};

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
        ${
          details === undefined || details === null
            ? null
            : asJson(details as Record<string, unknown>)
        }
      )
    `;
  } catch (e) {
    console.error(
      `[audit] write failed for tool=${tool}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
