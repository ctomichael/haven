-- 0007_p4_autonomy.sql — Agent maturity Phase 4 (approvals + earned autonomy).
--
-- autonomy_policy — per action_kind: is it auto (no approval) or ask (needs a
--   one-tap approval)? Plus the streak counters the review job reads to propose
--   graduating a repeatedly-approved kind to automatic.
-- approvals — the ledger: every approve/reject decision + the single-use token
--   minted on approve. `used_at` enforces single-use for gated tool calls.
--
-- The *floor* (kinds that may never be auto) is enforced in code
-- (apps/mcp/src/approvals.ts FLOOR), not by data, so it can't be edited away.
--
-- Brand-new tables + a seed insert: squawk-safe.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table autonomy_policy (
  action_kind          text primary key,
  mode                 text not null default 'ask' check (mode in ('auto', 'ask')),
  consecutive_approvals integer not null default 0,
  total_approvals      integer not null default 0,
  total_rejections     integer not null default 0,
  graduated_at         timestamptz,
  notes                text,
  updated_at           timestamptz not null default now()
);

create table approvals (
  id            uuid primary key default gen_random_uuid(),
  action_kind   text not null,
  summary       text,
  outcome       text not null check (outcome in ('approved', 'rejected')),
  token_id      uuid,           -- set when outcome=approved
  used_at       timestamptz,    -- set when the token is redeemed by a gated tool
  requested_via text,           -- 'telegram', 'wall', 'phone'
  decided_by    text,
  decided_at    timestamptz not null default now()
);

create index approvals_kind_idx on approvals (action_kind, decided_at desc);
create unique index approvals_token_idx on approvals (token_id) where token_id is not null;

-- Seed the known action kinds with their default modes. calendar writes are
-- additive/easily-deleted → auto by default; everything else asks until earned.
insert into autonomy_policy (action_kind, mode, notes) values
  ('calendar_event_create', 'auto', 'additive; default auto'),
  ('calendar_event_update',  'auto', 'reversible; default auto'),
  ('calendar_event_delete',  'ask',  'floor: never auto'),
  ('todo_delete',            'ask',  'floor: never auto'),
  ('shopping_remove',        'ask',  'prefer marking bought over removing'),
  ('ha_entity_call_service', 'ask',  'changes physical state'),
  ('ha_automation_write',    'ask',  'edits home automation'),
  ('ha_automation_remove',   'ask',  'floor: never auto'),
  ('widget_dispatch',        'ask',  'runs claude -p against the repo'),
  ('widget_remove',          'ask',  'floor: never auto'),
  ('autonomy_policy_set',    'ask',  'floor: never auto (meta)')
on conflict (action_kind) do nothing;
