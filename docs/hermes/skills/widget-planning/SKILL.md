---
name: widget-planning
description: >
  Turn a household "show me / put X on the wall" request into a validated widget
  plan envelope, choosing the lowest viable data tier, then hand it to
  haven-dispatch. Also decides when a request needs code at all vs. a plain
  data write or a cron script.
when_to_use: >
  When intake classifies a capture as a widget/feature request, or someone asks
  for something on the wall/phone that doesn't exist yet.
---

# Widget planning

You translate "I want to see X" into a plan Claude Code can build. Think first
about whether code is even needed.

## Decide: does this need a dispatch?

- **No code** — if it's a data write (todo, note, event, shopping) → use the
  intake tools. If it's a recurring *fetch → transform → write* with no new UI →
  write a Hermes **script** cron (see the scripts-over-agents skill), not a widget.
- **Automation** — "make the heat pump/lights…" → the automation-authoring skill
  (single-file HA YAML may go via `ha_automation_write`; multi-file → dispatch).
- **Dispatch** — anything that adds/edits files under `apps/` or a widget. That's
  this skill → haven-dispatch.

## Draft the plan envelope (contract §5)

Fill these fields (the schema is enforced by `widget_propose`):

- `name` — a slug (`snow_watch`). `kind` — usually `widget`.
- `intent` — the household's words + what "done" looks like.
- `surface` (wall/phone), `visibility`, optional `schedule`
  (`show_between: ["06:00","12:00"]` for a morning-only widget; `refresh_cron`).
- `data_strategy.level` — **lowest viable rung**: 0 note, 1 `events.kind`
  (no schema change), 2 column add, 3 new table. Most display widgets that read
  existing data (weather, calendar, HA) are level 0 — no new storage.
- `capture[]` — how data gets in (`scheduled_pull`, `ha_automation`,
  `dashboard_button`, `voice_command`, `manual_only`). Omit for read-only widgets.
- `files_to_create` / `files_to_modify` — the widget folder + `widgets.json`.
- `migrations[]` — only if level ≥ 2.
- `rollback` — **required.** Usually "git revert the widget commit".

## Validate, then dispatch

1. `widget_propose plan=<envelope>` — returns the normalised plan + computed
   `risk`. If it returns `invalid_args`, fix the named fields and retry.
2. Hand the validated plan to the **haven-dispatch** skill (it does the
   approval + `widget_dispatch` + status polling).

## Pitfalls

- **Don't over-store.** A widget that just displays existing data is level 0 —
  no table, no migration. Reach for level 2/3 only when genuinely new data must
  persist.
- **Always give a rollback.** No plan ships without one.
- **Keep intent concrete.** "Snow over the next fortnight, mornings" beats "a
  weather thing" — the dispatched session only has your plan to work from.
- **One widget per plan.** Bundling several makes the commit unreviewable and
  un-rollback-able.
