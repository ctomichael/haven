import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';

// raw_inbox.status lifecycle. 'processing' is a transient claim the intake
// pipeline sets so a concurrent sweeper run skips an item already being
// worked. The column is free text in the DB, so no migration is needed to
// add a value — keep this enum the single source of truth.
export const INBOX_STATUSES = ['pending', 'processing', 'filed', 'ignored'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

async function resolveUserId(handle: string | undefined): Promise<string | null> {
  if (!handle) return null;
  const [u] = await sql<{ id: string }[]>`
    select id from users where handle = ${handle}
  `;
  return u?.id ?? null;
}

async function resolveDeviceId(handle: string | undefined): Promise<string | null> {
  if (!handle) return null;
  const [d] = await sql<{ id: string }[]>`
    select id from devices where handle = ${handle}
  `;
  return d?.id ?? null;
}

export { resolveUserId, resolveDeviceId };

export const inboxAppendSchema = {
  source: z
    .string()
    .describe(
      "Where the capture came from — e.g. 'phone', 'wall', 'ha_voice', 'share_target'.",
    ),
  raw_text: z.string().describe('The captured text (transcript for voice).'),
  audio_url: z
    .string()
    .optional()
    .describe('URL to the original audio attachment, if any.'),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe('Arbitrary structured context. Attachments, ts hints, lang, etc.'),
  device: z
    .string()
    .optional()
    .describe("Device handle (e.g. 'wall_boox', 'phone_michael')."),
  actor: ACTOR,
};

export async function inboxAppend(args: {
  source: string;
  raw_text: string;
  audio_url?: string;
  metadata?: Record<string, unknown>;
  device?: string;
  actor?: string;
}) {
  const [actor_user_id, device_id] = await Promise.all([
    resolveUserId(args.actor),
    resolveDeviceId(args.device),
  ]);
  const [row] = await sql<{ id: string; ts: string }[]>`
    insert into raw_inbox (source, raw_text, audio_url, metadata, actor_user_id, device_id)
    values (
      ${args.source},
      ${args.raw_text},
      ${args.audio_url ?? null},
      ${asJson(args.metadata ?? {})},
      ${actor_user_id},
      ${device_id}
    )
    returning id, ts
  `;
  return row;
}

export const inboxListSchema = {
  status: z
    .enum(INBOX_STATUSES)
    .optional()
    .describe('Filter to one status; omit for all.'),
  since: z
    .string()
    .datetime()
    .optional()
    .describe('Only rows with ts >= since (ISO-8601).'),
  older_than: z
    .string()
    .describe("Only rows with ts <= now() - interval (e.g. '10m', '1h'). For the sweeper.")
    .optional(),
  limit: z.number().int().min(1).max(500).default(50),
  actor: ACTOR,
};

export async function inboxList(args: {
  status?: InboxStatus;
  since?: string;
  older_than?: string;
  limit: number;
}) {
  const rows = await sql`
    select
      id, ts, source, raw_text, audio_url,
      metadata, status, filed_refs, actor_user_id, device_id
    from raw_inbox
    where (${args.status ?? null}::text is null or status = ${args.status ?? null})
      and (${args.since ?? null}::timestamptz is null or ts >= ${args.since ?? null}::timestamptz)
      and (${args.older_than ?? null}::text is null or ts <= now() - ${args.older_than ?? null}::interval)
    order by ts desc
    limit ${args.limit}
  `;
  return { rows };
}

export const inboxGetSchema = {
  id: z.string().uuid().describe('raw_inbox row id'),
  actor: ACTOR,
};

export async function inboxGet(args: { id: string }) {
  const [row] = await sql`
    select id, ts, source, raw_text, audio_url, metadata, status, filed_refs,
           actor_user_id, device_id
    from raw_inbox
    where id = ${args.id}
  `;
  if (!row) {
    const err = new Error(`raw_inbox row ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return row;
}

// ----- inbox_set_status ------------------------------------------------
// Move an item through the lifecycle. The intake pipeline claims an item
// with `processing` (so a concurrent sweeper skips it), then finishes with
// `filed`/`ignored`. `expect` guards against a race: if given, the update
// only applies when the current status matches — a lost race returns
// { updated: false } rather than clobbering another run's claim.

export const inboxSetStatusSchema = {
  id: z.string().uuid().describe('raw_inbox row id'),
  status: z.enum(INBOX_STATUSES).describe('New status.'),
  expect: z
    .enum(INBOX_STATUSES)
    .optional()
    .describe('Only update if the current status equals this (optimistic claim).'),
  actor: ACTOR,
};

export async function inboxSetStatus(args: {
  id: string;
  status: InboxStatus;
  expect?: InboxStatus;
}) {
  const rows = await sql<{ id: string; status: string }[]>`
    update raw_inbox
    set status = ${args.status}
    where id = ${args.id}
      and (${args.expect ?? null}::text is null or status = ${args.expect ?? null})
    returning id, status
  `;
  if (rows.length === 0) {
    // Distinguish "not found" from "lost the claim race".
    const [exists] = await sql<{ id: string }[]>`select id from raw_inbox where id = ${args.id}`;
    if (!exists) {
      const err = new Error(`raw_inbox row ${args.id} not found`);
      (err as { code?: string }).code = 'not_found';
      throw err;
    }
    return { updated: false, id: args.id };
  }
  return { updated: true, id: rows[0]!.id, status: rows[0]!.status };
}

// ----- inbox_file ------------------------------------------------------
// Close out an item: record the typed entity refs it produced and mark it
// filed (or another terminal status). `refs` are opaque strings like
// 'todo:<uuid>', 'shopping:<uuid>', 'gcal:<event_id>', 'note:<uuid>' — the
// provenance trail linking a capture to what the agent did with it. Refs
// are appended to any already present (multi-intent captures file in parts).

export const inboxFileSchema = {
  id: z.string().uuid().describe('raw_inbox row id'),
  refs: z
    .array(z.string())
    .default([])
    .describe("Typed entity refs produced, e.g. ['todo:<uuid>', 'gcal:<id>']."),
  status: z
    .enum(['filed', 'ignored'])
    .default('filed')
    .describe("Terminal status. 'ignored' for captures that needed no action."),
  actor: ACTOR,
};

export async function inboxFile(args: {
  id: string;
  refs: string[];
  status: 'filed' | 'ignored';
}) {
  const rows = await sql<{ id: string; status: string; filed_refs: unknown }[]>`
    update raw_inbox
    set status = ${args.status},
        filed_refs = filed_refs || ${asJson(args.refs)}
    where id = ${args.id}
    returning id, status, filed_refs
  `;
  if (rows.length === 0) {
    const err = new Error(`raw_inbox row ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return rows[0];
}
