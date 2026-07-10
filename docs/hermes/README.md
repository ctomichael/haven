# Hermes ↔ Haven integration

Hermes (the Nous Research `hermes-agent` running on the Beelink) is Haven's
household brain. It classifies and files what the family says, runs the
routine review job, holds the two-way conversation (Telegram + Haven modal),
and dispatches coding work to Claude Code. **Hermes never edits the Haven
repo directly** — code changes go through `widget_dispatch` → `claude -p`.

This directory holds the **seed** copies of everything Hermes-side, checked
in for review and versioning:

- [`setup.md`](setup.md) — one-time wiring: MCP server entry, webhook channel,
  env vars, cron jobs, `USER.md` seed.
- `skills/*/SKILL.md` — the seed skills. Copied to `~/.hermes/skills/` on the
  Beelink. Hermes may evolve its own copies from there; **drift is expected
  and fine** — these are the starting point, not a synced source of truth
  (per the "Hermes owns its own behaviour" rule in
  [`../../design/agent-maturity-plan.md`](../../design/agent-maturity-plan.md) §2).

The division of responsibility (do not blur it):

| Lives in Hermes (`~/.hermes/`) | Lives in Haven (Postgres / repo) |
|---|---|
| Agent behaviour: how it learned to file messy captures, terminology, scheduling habits | Household **data**: inbox, todos, shopping, notes, events, calendar, briefings, questions |
| Skills, cron definitions, `MEMORY.md`, `USER.md` | The autonomy policy, approvals ledger, audit log |
| Session history (SQLite) | Widget registry + widget code |

Everything Hermes does to household state goes through **HouseholdMCP** —
the single audited surface. Never give Hermes a second path to the DB.
