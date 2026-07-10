-- 0008_p5_dispatch.sql — Agent maturity Phase 5 (widget dispatch).
--
-- agent_tasks — one row per dispatched Claude Code job. The `id` is the
-- task_id that appears in the commit message (`widget: <slug> — <task_id>`),
-- so a widget can be traced to its dispatch and rolled back individually.
--
-- Brand-new table: squawk-safe.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table agent_tasks (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('widget', 'automation', 'fix', 'feature')),
  slug          text,
  plan          jsonb not null,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'succeeded', 'failed', 'rolled_back')),
  branch        text,
  commit_sha    text,
  error         jsonb,
  log_path      text,
  requested_by  text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index agent_tasks_status_idx on agent_tasks (status, created_at desc);
