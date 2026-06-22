import { sql } from './client.ts';

/**
 * Wrap a value for insertion into a jsonb column via tagged-template SQL.
 *
 * The postgres library's `sql.json()` types its parameter as a strict
 * recursive `JSONValue`, which `Record<string, unknown>` and zod's inferred
 * `z.record(z.unknown())` types don't satisfy without a cast. Tool args
 * come from MCP clients (validated by zod, so safe to treat as JSON), so
 * we pass them through unchanged with a single cast at this boundary.
 *
 * Do NOT JSON.stringify first — that would result in a doubly-encoded
 * jsonb string. Pass the JS value; sql.json serializes correctly.
 */
export function asJson(value: Record<string, unknown> | unknown[]) {
  return sql.json(value as Parameters<typeof sql.json>[0]);
}
