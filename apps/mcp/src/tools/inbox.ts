import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';

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
    .enum(['pending', 'filed', 'ignored'])
    .optional()
    .describe('Filter to one status; omit for all.'),
  since: z
    .string()
    .datetime()
    .optional()
    .describe('Only rows with ts >= since (ISO-8601).'),
  limit: z.number().int().min(1).max(500).default(50),
  actor: ACTOR,
};

export async function inboxList(args: {
  status?: 'pending' | 'filed' | 'ignored';
  since?: string;
  limit: number;
}) {
  const rows = await sql`
    select
      id, ts, source, raw_text, audio_url,
      metadata, status, filed_refs, actor_user_id, device_id
    from raw_inbox
    where (${args.status ?? null}::text is null or status = ${args.status ?? null})
      and (${args.since ?? null}::timestamptz is null or ts >= ${args.since ?? null}::timestamptz)
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
