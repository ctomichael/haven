import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';
import { notifyReload } from '../reload.ts';

// Briefings are what the review job decides is worth surfacing. Written by
// Hermes (household-review skill), read by the wall Briefing widget. Idempotent
// on dedupe_key so a repeated review run refreshes rather than duplicates.

type BriefingRow = {
  id: string;
  dedupe_key: string;
  severity: string;
  title: string;
  body: string | null;
  surface: string;
  source_refs: unknown;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

// ----- briefing_publish ------------------------------------------------
// Upsert on dedupe_key. Re-publishing an existing key updates its fields and
// clears resolution (it's true again) but preserves acknowledgement unless
// severity escalated — the review skill relies on this to avoid re-nagging.

export const briefingPublishSchema = {
  dedupe_key: z.string().min(1).describe("Idempotency key, e.g. 'todo-due:<uuid>'."),
  title: z.string().min(1),
  body: z.string().optional(),
  severity: z.enum(['info', 'attention', 'urgent']).default('info'),
  surface: z.enum(['wall', 'phone', 'all']).default('all'),
  source_refs: z.array(z.string()).default([]).describe("Typed refs this is about, e.g. ['todo:<uuid>']."),
  expires_at: z.string().datetime().optional(),
  actor: ACTOR,
};

// Map severity → rank for escalation comparisons, reused in publish + list.
const SEVERITY_RANK = sql`case severity when 'urgent' then 2 when 'attention' then 1 else 0 end`;

export async function briefingPublish(args: {
  dedupe_key: string;
  title: string;
  body?: string;
  severity: 'info' | 'attention' | 'urgent';
  surface: 'wall' | 'phone' | 'all';
  source_refs: string[];
  expires_at?: string;
}) {
  const rows = await sql<BriefingRow[]>`
    insert into briefings
      (dedupe_key, title, body, severity, surface, source_refs, expires_at)
    values (
      ${args.dedupe_key}, ${args.title}, ${args.body ?? null}, ${args.severity},
      ${args.surface}, ${asJson(args.source_refs)}, ${args.expires_at ?? null}
    )
    on conflict (dedupe_key) do update set
      title = excluded.title,
      body = excluded.body,
      severity = excluded.severity,
      surface = excluded.surface,
      source_refs = excluded.source_refs,
      expires_at = excluded.expires_at,
      updated_at = now(),
      resolved_at = null,
      -- Preserve the ack unless severity just escalated; then clear it so the
      -- item re-surfaces at its higher urgency.
      acknowledged_at = case
        when (case excluded.severity when 'urgent' then 2 when 'attention' then 1 else 0 end)
           > (case briefings.severity when 'urgent' then 2 when 'attention' then 1 else 0 end)
        then null else briefings.acknowledged_at
      end
    returning *
  `;
  await notifyReload('briefing_publish');
  return rows[0];
}

// ----- briefing_resolve ------------------------------------------------

export const briefingResolveSchema = {
  dedupe_key: z.string().min(1).describe('The key of the briefing that is no longer true.'),
  actor: ACTOR,
};

export async function briefingResolve(args: { dedupe_key: string }) {
  const rows = await sql<{ id: string; dedupe_key: string }[]>`
    update briefings set resolved_at = now(), updated_at = now()
    where dedupe_key = ${args.dedupe_key} and resolved_at is null
    returning id, dedupe_key
  `;
  await notifyReload('briefing_resolve');
  return { resolved: rows.length > 0, dedupe_key: args.dedupe_key };
}

// ----- briefing_list ---------------------------------------------------

export const briefingListSchema = {
  include_resolved: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(50),
  actor: ACTOR,
};

export async function briefingList(args: { include_resolved: boolean; limit: number }) {
  const rows = await sql<BriefingRow[]>`
    select * from briefings
    where (${args.include_resolved}::boolean or resolved_at is null)
      and (expires_at is null or expires_at > now())
    order by ${SEVERITY_RANK} desc, created_at desc
    limit ${args.limit}
  `;
  return { briefings: rows };
}
