import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';
import { resolveUserId } from './inbox.ts';

// Tier 0 second brain: freeform household knowledge with no action attached.
// Postgres-backed (see migration 0005) with SQL full-text search; a nightly
// export writes these to /var/haven/notes/*.md for greppability/backups.

type NoteRow = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  subject: string | null;
  source_inbox_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const RETURNING = sql`
  returning id, title, body, tags, subject, source_inbox_id, created_by,
            created_at, updated_at
`;

// ----- note_append -----------------------------------------------------
// Store a fact. Despite the name it inserts a new note row (append to the
// second brain), mirroring the contract's note_append verb.

export const noteAppendSchema = {
  body: z.string().min(1).describe('The fact/observation, e.g. "Fiona really likes daffodils".'),
  title: z.string().optional().describe('Optional short title.'),
  subject: z
    .string()
    .optional()
    .describe("Grouping tag, e.g. 'person:fiona', 'topic:house', 'pet:nico'."),
  tags: z.array(z.string()).optional().describe('Freeform tags.'),
  source_inbox_id: z.string().uuid().optional().describe('raw_inbox row this was filed from.'),
  actor: ACTOR,
};

export async function noteAppend(args: {
  body: string;
  title?: string;
  subject?: string;
  tags?: string[];
  source_inbox_id?: string;
  actor?: string;
}) {
  const createdBy = await resolveUserId(args.actor);
  const rows = await sql<NoteRow[]>`
    insert into notes (title, body, subject, tags, source_inbox_id, created_by)
    values (
      ${args.title ?? null},
      ${args.body},
      ${args.subject ?? null},
      ${(args.tags ?? []) as unknown as string[]},
      ${args.source_inbox_id ?? null},
      ${createdBy}
    )
    ${RETURNING}
  `;
  return rows[0];
}

// ----- note_list -------------------------------------------------------

export const noteListSchema = {
  subject: z.string().optional().describe('Filter to one subject tag.'),
  limit: z.number().int().min(1).max(200).default(50),
  actor: ACTOR,
};

export async function noteList(args: { subject?: string; limit: number }) {
  const rows = await sql<NoteRow[]>`
    select id, title, body, tags, subject, source_inbox_id, created_by,
           created_at, updated_at
    from notes
    where (${args.subject ?? null}::text is null or subject = ${args.subject ?? null})
    order by created_at desc
    limit ${args.limit}
  `;
  return { notes: rows };
}

// ----- note_search -----------------------------------------------------
// Full-text search over title + body + subject. Uses websearch_to_tsquery
// so callers can pass natural phrases ("daffodils", "carpet house").

export const noteSearchSchema = {
  query: z.string().min(1).describe('Search text (natural phrase ok).'),
  limit: z.number().int().min(1).max(100).default(20),
  actor: ACTOR,
};

export async function noteSearch(args: { query: string; limit: number }) {
  const rows = await sql<(NoteRow & { rank: number })[]>`
    select id, title, body, tags, subject, source_inbox_id, created_by,
           created_at, updated_at,
           ts_rank(search, websearch_to_tsquery('english', ${args.query})) as rank
    from notes
    where search @@ websearch_to_tsquery('english', ${args.query})
    order by rank desc, created_at desc
    limit ${args.limit}
  `;
  return { notes: rows };
}
