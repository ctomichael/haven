// Export the notes table to markdown files under HAVEN_NOTES_DIR
// (default /var/haven/notes), one file per subject. Keeps the second brain
// greppable and included in the nightly backup, while Postgres stays the
// source of truth for search.
//
// Run by Hermes as a script-mode cron (no LLM) — see docs/hermes/setup.md.
//   bun run apps/backend/src/scripts/export-notes.ts
// or `bun run --filter @haven/backend notes:export` from the repo root.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sql } from '../db/client.ts';

const NOTES_DIR = process.env.HAVEN_NOTES_DIR ?? '/var/haven/notes';

type NoteRow = {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  subject: string | null;
  created_at: string;
};

// 'person:fiona' → 'person-fiona'; null → 'general'. Filesystem-safe.
function subjectFile(subject: string | null): string {
  const base = (subject ?? 'general').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${base || 'general'}.md`;
}

function renderNote(n: NoteRow): string {
  const lines: string[] = [];
  const date = n.created_at.substring(0, 10);
  lines.push(`## ${n.title ?? n.body.split('\n')[0]!.slice(0, 60)}`);
  lines.push('');
  lines.push(n.body.trim());
  const meta = [`_${date}_`];
  if (n.tags.length) meta.push(n.tags.map((t) => `#${t}`).join(' '));
  lines.push('');
  lines.push(meta.join(' · '));
  return lines.join('\n');
}

async function main(): Promise<void> {
  const rows = await sql<NoteRow[]>`
    select id, title, body, tags, subject, created_at
    from notes
    order by subject nulls first, created_at asc
  `;

  const bySubject = new Map<string, NoteRow[]>();
  for (const r of rows) {
    const file = subjectFile(r.subject);
    (bySubject.get(file) ?? bySubject.set(file, []).get(file)!).push(r);
  }

  await mkdir(NOTES_DIR, { recursive: true });
  let written = 0;
  for (const [file, notes] of bySubject) {
    const subject = notes[0]!.subject ?? 'General';
    const doc = [
      `# ${subject}`,
      '',
      `_${notes.length} note(s) — exported ${new Date().toISOString().substring(0, 10)}_`,
      '',
      notes.map(renderNote).join('\n\n---\n\n'),
      '',
    ].join('\n');
    await writeFile(join(NOTES_DIR, file), doc, 'utf8');
    written++;
  }

  console.log(`[export-notes] wrote ${written} file(s) (${rows.length} notes) to ${NOTES_DIR}`);
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(`[export-notes] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
