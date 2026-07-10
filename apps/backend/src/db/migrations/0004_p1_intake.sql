-- 0004_p1_intake.sql — Agent maturity Phase 1 (intake plumbing).
--
-- Maps Telegram senders to household users so Hermes can attribute
-- gateway messages, and adds a synthetic `guest` user that unknown
-- senders (and un-attributed captures) resolve to.
--
-- Additive only: one nullable column + one partial-unique index +
-- one idempotent seed row. Safe for squawk auto-apply.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Telegram sender id → household user. Nullable; most users may never
-- link Telegram. Partial-unique so at most one user owns a given id
-- while allowing many NULLs.
alter table users add column telegram_user_id text;

create unique index users_telegram_user_id_idx
  on users (telegram_user_id)
  where telegram_user_id is not null;

-- Synthetic actor for messages from unknown Telegram senders or captures
-- with no resolvable actor. Not a real person; never linked to a device.
insert into users (handle, display_name) values
  ('guest', 'Guest')
on conflict (handle) do nothing;
