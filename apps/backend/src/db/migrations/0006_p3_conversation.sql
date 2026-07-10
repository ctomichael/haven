-- 0006_p3_conversation.sql — Agent maturity Phase 3 (conversation surfaces).
--
-- Two tables that hold the agent's *outbound* conversation state in Postgres
-- (Hermes cron/gateway agents are fresh per run, so continuity must live in
-- the DB, never in agent memory):
--   briefings       — things the review job decided are worth surfacing
--   agent_questions — clarifications/approvals the agent needs a human to answer
--
-- Brand-new tables: full constraints + indexes inline are squawk-safe.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table briefings (
  id             uuid primary key default gen_random_uuid(),
  -- Idempotency key so a repeated review run updates rather than duplicates,
  -- e.g. 'todo-due:<uuid>', 'question-stale:<uuid>'.
  dedupe_key     text not null unique,
  severity       text not null default 'info' check (severity in ('info', 'attention', 'urgent')),
  title          text not null,
  body           text,
  surface        text not null default 'all' check (surface in ('wall', 'phone', 'all')),
  source_refs    jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  expires_at     timestamptz,
  acknowledged_at timestamptz,
  resolved_at    timestamptz
);

-- The wall reads "active" briefings: not resolved, not expired. Partial index
-- keeps that query cheap as resolved ones accumulate.
create index briefings_active_idx on briefings (severity, created_at desc)
  where resolved_at is null;

create table agent_questions (
  id             uuid primary key default gen_random_uuid(),
  question       text not null,
  -- Optional preset answers; null/empty → free-text answer.
  options        jsonb not null default '[]'::jsonb,
  -- Everything a fresh agent run needs to resume the pending work once
  -- answered, e.g. { "resume": "household-intake", "inbox_id": "..." }.
  context        jsonb not null default '{}'::jsonb,
  target_surface text not null default 'all' check (target_surface in ('wall', 'phone', 'all')),
  target_user    text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz,
  answer         text,
  answered_by    text,
  answered_at    timestamptz
);

-- Open questions the modal polls / SSE surfaces.
create index agent_questions_open_idx on agent_questions (created_at desc)
  where answered_at is null;
