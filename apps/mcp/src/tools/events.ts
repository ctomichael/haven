import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';
import { resolveDeviceId, resolveUserId } from './inbox.ts';

export const eventKindsListSchema = {
  actor: ACTOR,
};

export async function eventKindsList() {
  const rows = await sql`
    with counts as (
      select kind, count(*)::int as count, max(ts) as last_ts
      from events
      group by kind
    )
    select
      k.kind,
      k.description,
      k.schema_json,
      k.owner_widget,
      k.first_seen_ts,
      coalesce(c.count, 0) as count,
      coalesce(c.last_ts, k.last_ts) as last_ts
    from event_kinds k
    left join counts c on c.kind = k.kind
    order by k.kind
  `;
  return { kinds: rows };
}

export const eventLogSchema = {
  kind: z.string().describe("Event kind slug (e.g. 'dishwasher_run'). Register via event_kind_register before first use."),
  ts: z
    .string()
    .datetime()
    .optional()
    .describe('Event timestamp (ISO-8601). Defaults to now().'),
  metadata: z.record(z.unknown()).optional(),
  source_inbox_id: z
    .string()
    .uuid()
    .optional()
    .describe('Optional raw_inbox row this event was derived from.'),
  device: z.string().optional(),
  actor: ACTOR,
};

export async function eventLog(args: {
  kind: string;
  ts?: string;
  metadata?: Record<string, unknown>;
  source_inbox_id?: string;
  device?: string;
  actor?: string;
}) {
  const [actor_user_id, device_id] = await Promise.all([
    resolveUserId(args.actor),
    resolveDeviceId(args.device),
  ]);
  const [row] = await sql<{ id: string; ts: string }[]>`
    insert into events (kind, ts, actor_user_id, device_id, metadata, source_inbox_id)
    values (
      ${args.kind},
      coalesce(${args.ts ?? null}::timestamptz, now()),
      ${actor_user_id},
      ${device_id},
      ${asJson(args.metadata ?? {})},
      ${args.source_inbox_id ?? null}
    )
    returning id, ts
  `;
  // Best-effort: bump last_ts on the registry if the kind is registered.
  await sql`
    update event_kinds set last_ts = now() where kind = ${args.kind}
  `;
  return row;
}

export const eventKindRegisterSchema = {
  kind: z.string().describe('Unique event kind slug.'),
  description: z.string(),
  schema_json: z
    .record(z.unknown())
    .optional()
    .describe('JSON Schema for the metadata field on events of this kind.'),
  owner_widget: z
    .string()
    .optional()
    .describe('Widget that owns this kind (set when the kind is created as part of a widget dispatch).'),
  actor: ACTOR,
};

export async function eventKindRegister(args: {
  kind: string;
  description: string;
  schema_json?: Record<string, unknown>;
  owner_widget?: string;
}) {
  const [row] = await sql<{ kind: string; first_seen_ts: string }[]>`
    insert into event_kinds (kind, description, schema_json, owner_widget)
    values (
      ${args.kind},
      ${args.description},
      ${asJson(args.schema_json ?? {})},
      ${args.owner_widget ?? null}
    )
    on conflict (kind) do update set
      description = excluded.description,
      schema_json = excluded.schema_json,
      owner_widget = coalesce(excluded.owner_widget, event_kinds.owner_widget)
    returning kind, first_seen_ts
  `;
  return { ok: true, ...row };
}
