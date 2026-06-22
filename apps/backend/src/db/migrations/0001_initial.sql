-- 0001_initial.sql — Haven baseline schema.
--
-- Covers Tier 1 (raw_inbox + audit_log + attachments) and Tier 2 typed
-- tables (todos, shopping_items, events + event_kinds, calendar_mirror,
-- widgets). Tier 3 (markdown notes in git) lives outside the database.
--
-- Visibility is one of 'wall', 'personal', 'household' for v1. Per-user
-- visibility lists are deferred to a later migration if needed.
--
-- pgvector and tsvector indexes are deferred — full-text search is not
-- a v1 need; add them when keyword search starts missing things.

-- Safety timeouts for this migration. Scoped to the current transaction
-- by the runner (sql.begin). Standard practice for all migrations.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

------------------------------------------------------------------------
-- Identity
------------------------------------------------------------------------

create table users (
  id            uuid primary key default gen_random_uuid(),
  handle        text not null unique,
  display_name  text not null,
  email         text,
  created_at    timestamptz not null default now()
);

create table devices (
  id            uuid primary key default gen_random_uuid(),
  handle        text not null unique,
  user_id       uuid references users (id) on delete set null,
  kind          text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

------------------------------------------------------------------------
-- Tier 1 — universal capture
------------------------------------------------------------------------

create table raw_inbox (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),
  source          text not null,
  raw_text        text not null,
  audio_url       text,
  metadata        jsonb not null default '{}'::jsonb,
  status          text not null default 'pending',
  filed_refs      jsonb not null default '[]'::jsonb,
  actor_user_id   uuid references users (id) on delete set null,
  device_id       uuid references devices (id) on delete set null
);

create index raw_inbox_status_ts_idx on raw_inbox (status, ts desc);

------------------------------------------------------------------------
-- Attachments (photos, audio) — files live under /var/haven/attachments
------------------------------------------------------------------------

create table attachments (
  id                   uuid primary key default gen_random_uuid(),
  path                 text not null,
  mime                 text not null,
  size_bytes           bigint not null,
  created_at           timestamptz not null default now(),
  source_inbox_id      uuid references raw_inbox (id) on delete set null,
  created_by_user_id   uuid references users (id) on delete set null
);

------------------------------------------------------------------------
-- Tier 2 — typed domain tables
------------------------------------------------------------------------

create table todos (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  notes              text,
  due_at             timestamptz,
  done_at            timestamptz,
  assignee_user_id   uuid references users (id) on delete set null,
  visibility         text not null default 'household',
  tags               text[] not null default '{}',
  source_inbox_id    uuid references raw_inbox (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index todos_open_due_idx on todos (due_at)
  where done_at is null;

create table shopping_items (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  qty                text,
  store              text,
  purchased_at       timestamptz,
  visibility         text not null default 'household',
  source_inbox_id    uuid references raw_inbox (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index shopping_open_idx on shopping_items (created_at desc)
  where purchased_at is null;

------------------------------------------------------------------------
-- Generic events log + kind registry
------------------------------------------------------------------------

create table event_kinds (
  kind              text primary key,
  description       text not null,
  schema_json       jsonb not null default '{}'::jsonb,
  owner_widget      text,
  first_seen_ts     timestamptz not null default now(),
  last_ts           timestamptz
);

create table events (
  id                 uuid primary key default gen_random_uuid(),
  ts                 timestamptz not null default now(),
  kind               text not null,
  actor_user_id      uuid references users (id) on delete set null,
  device_id          uuid references devices (id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  source_inbox_id    uuid references raw_inbox (id) on delete set null
);

create index events_kind_ts_idx on events (kind, ts desc);

------------------------------------------------------------------------
-- Calendar mirror (Google read-only)
------------------------------------------------------------------------

create table calendar_mirror (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text not null unique,
  calendar_id        text not null,
  title              text not null,
  description        text,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  location           text,
  attendees          jsonb not null default '[]'::jsonb,
  raw                jsonb not null default '{}'::jsonb,
  last_synced_at     timestamptz not null default now()
);

create index calendar_starts_at_idx on calendar_mirror (starts_at);

------------------------------------------------------------------------
-- Widget registry
------------------------------------------------------------------------

create table widgets (
  name              text primary key,
  manifest          jsonb not null,
  sha               text not null,
  visibility        text not null default 'household',
  surface           jsonb not null default '{"wall":true,"phone":false}'::jsonb,
  registered_at     timestamptz not null default now(),
  registered_by     text
);

------------------------------------------------------------------------
-- Audit log — every MCP call passing through HouseholdMCP lands here
------------------------------------------------------------------------

create table audit_log (
  id                uuid primary key default gen_random_uuid(),
  ts                timestamptz not null default now(),
  agent_id          text not null,
  actor             text,
  tool              text not null,
  args_sha256       text,
  result_status     text not null,
  details           jsonb
);

create index audit_log_ts_idx on audit_log (ts desc);
create index audit_log_agent_tool_idx on audit_log (agent_id, tool);
