-- 0005_p2_notes.sql — Agent maturity Phase 2 (second brain).
--
-- Tier 0 notes: freeform household knowledge with no action attached
-- ("Fiona likes daffodils"). Postgres-first (revising the contract's
-- "markdown in git" note) so the same store is searchable via SQL FTS and
-- symmetric with the rest of the MCP surface; a nightly job exports to
-- /var/haven/notes/*.md to keep the greppable/backup-friendly property.
--
-- pgvector embeddings are deferred until a local embedding runtime exists
-- on the Beelink — the `search` tsvector column + GIN index below cover
-- keyword recall in the meantime, and the embedding column is a safe
-- additive migration later.
--
-- Brand-new table: no lock/backfill concerns, so full constraints + indexes
-- inline are safe for squawk auto-apply.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table notes (
  id                uuid primary key default gen_random_uuid(),
  title             text,
  body              text not null,
  tags              text[] not null default '{}',
  -- Optional subject tag for grouping, e.g. 'person:fiona', 'topic:house'.
  subject           text,
  source_inbox_id   uuid references raw_inbox (id) on delete set null,
  created_by        uuid references users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Generated full-text vector over title + body + subject.
  search            tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(subject, '')
    )
  ) stored
);

create index notes_search_idx on notes using gin (search);
create index notes_subject_idx on notes (subject) where subject is not null;
create index notes_created_at_idx on notes (created_at desc);
