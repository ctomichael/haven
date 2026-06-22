import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';

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
