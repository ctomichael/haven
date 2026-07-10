import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';

// Cross-tier recall: "have we talked about X before?" Searches notes (FTS),
// todos, and raw_inbox (keyword), returning typed refs so the caller can
// follow up. Notes use the tsvector index; the others use ILIKE (small
// household tables — a scan is fine). Briefings join here in Phase 3.

export type SearchHit = {
  tier: 'note' | 'todo' | 'inbox';
  ref_id: string;
  ref: string; // typed ref, e.g. 'note:<uuid>'
  snippet: string;
  ts: string;
};

export const searchAllSchema = {
  query: z.string().min(1).describe('Search text (natural phrase ok).'),
  kinds: z
    .array(z.enum(['note', 'todo', 'inbox']))
    .optional()
    .describe('Restrict to these tiers; omit for all.'),
  limit: z.number().int().min(1).max(100).default(20),
  actor: ACTOR,
};

function want(kinds: string[] | undefined, k: string): boolean {
  return !kinds || kinds.includes(k);
}

function snippet(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function searchAll(args: {
  query: string;
  kinds?: ('note' | 'todo' | 'inbox')[];
  limit: number;
}) {
  const like = `%${args.query}%`;
  const hits: SearchHit[] = [];

  if (want(args.kinds, 'note')) {
    const rows = await sql<{ id: string; title: string | null; body: string; created_at: string }[]>`
      select id, title, body, created_at
      from notes
      where search @@ websearch_to_tsquery('english', ${args.query})
      order by ts_rank(search, websearch_to_tsquery('english', ${args.query})) desc
      limit ${args.limit}
    `;
    for (const r of rows) {
      hits.push({
        tier: 'note',
        ref_id: r.id,
        ref: `note:${r.id}`,
        snippet: snippet([r.title, r.body].filter(Boolean).join(' — ')),
        ts: r.created_at,
      });
    }
  }

  if (want(args.kinds, 'todo')) {
    const rows = await sql<{ id: string; title: string; notes: string | null; created_at: string }[]>`
      select id, title, notes, created_at
      from todos
      where title ilike ${like} or notes ilike ${like}
      order by created_at desc
      limit ${args.limit}
    `;
    for (const r of rows) {
      hits.push({
        tier: 'todo',
        ref_id: r.id,
        ref: `todo:${r.id}`,
        snippet: snippet([r.title, r.notes].filter(Boolean).join(' — ')),
        ts: r.created_at,
      });
    }
  }

  if (want(args.kinds, 'inbox')) {
    const rows = await sql<{ id: string; raw_text: string; ts: string }[]>`
      select id, raw_text, ts
      from raw_inbox
      where raw_text ilike ${like}
      order by ts desc
      limit ${args.limit}
    `;
    for (const r of rows) {
      hits.push({
        tier: 'inbox',
        ref_id: r.id,
        ref: `inbox:${r.id}`,
        snippet: snippet(r.raw_text),
        ts: r.ts,
      });
    }
  }

  hits.sort((a, b) => b.ts.localeCompare(a.ts));
  return { hits: hits.slice(0, args.limit) };
}
