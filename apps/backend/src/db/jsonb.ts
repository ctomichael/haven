import { sql } from './client.ts';

/**
 * Wrap a value for insertion into a jsonb column via tagged-template SQL.
 * See apps/mcp/src/jsonb.ts for the longer explanation; this is the
 * backend's copy. TODO: extract to packages/db once a third caller appears.
 */
export function asJson(value: Record<string, unknown> | unknown[]) {
  return sql.json(value as Parameters<typeof sql.json>[0]);
}
