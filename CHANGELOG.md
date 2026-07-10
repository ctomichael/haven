# Changelog

Every commit adds an entry at the **top** of this file — enforced by
[`.githooks/pre-commit`](.githooks/pre-commit). Each entry says *what changed*
and *how Hermes should interpret it*, so the household agent can adapt its
behaviour without reading the diff.

**Hermes reads this on every git update.** After a pull, `infra/autopull.sh`
sends the new entries (the `OLD..NEW` delta of this file) to the Hermes webhook
as a `changelog.updated` event — the `changelog-interpret` skill acts on them
(update `MEMORY.md`/`USER.md`, adopt new tools, warn on removed ones).

Entry format (newest first):

```
## <YYYY-MM-DD> — <short title>
**What:** <what changed, plainly>
**Hermes:** <how to adapt — new/changed/removed tools, behaviour, or "no action">
```

Exceptional or programmatic commits (agent-generated data, mechanical fixups)
may bypass the hook with `git commit --no-verify` and need no entry.

---

## 2026-07-11 — Changelog + Hermes read-on-update
**What:** Added this changelog, a `pre-commit` hook enforcing it, an
`autopull.sh` step that pushes new entries to Hermes after each pull, and the
`changelog-interpret` skill.
**Hermes:** From now on, on every `changelog.updated` event, read the entries
and adapt — pull new tool names into working memory, stop using anything marked
removed, and note behaviour changes. This is your standing channel for "what
changed in Haven".

## 2026-07-11 — P6 HA automations
**What:** HA entity read tools, gated `ha_entity_call_service`, and
`ha_automation_write` / `ha_automation_remove` (own only `ha/automations/haven/`).
Backend `/api/ha/search` + `/api/ha/service`.
**Hermes:** New tools: `ha_entity_state`, `ha_entity_history`, `ha_entity_search`,
`ha_entity_call_service` (gated), `ha_automation_write` (gated),
`ha_automation_remove` (gated, floor). Use the `automation-authoring` skill for
"make the <device> do X" requests. Never touch non-Haven automations.

## 2026-07-11 — P5 widget pipeline
**What:** Widget registry (`widgets.json` + `src/lib/widgets/`), dispatch runner
(`claude -p` in a git worktree), and `widget_propose`/`widget_dispatch`/
`widget_dispatch_status`/`widget_remove`. Runbook at `docs/agent-dispatch.md`.
**Hermes:** New tools for "put X on the wall" requests — use `widget-planning`
then `haven-dispatch`. `widget_dispatch`/`widget_remove` are gated (approval
token). Dispatches take a minute or two; poll `widget_dispatch_status`.

## 2026-07-11 — P4 approvals + earned autonomy
**What:** Single-use approval tokens gate write_med/destructive tools;
`autonomy_policy` (auto|ask per action_kind) with earned graduation; `todo_delete`.
**Hermes:** New tools: `approval_issue`, `approval_reject`, `autonomy_policy_list`,
`autonomy_policy_set`. For gated actions: ask approve/reject → `approval_issue`
→ pass the token. Once/day check `autonomy_policy_list` for `graduatable` kinds
and propose making them automatic. Floor kinds never graduate.

## 2026-07-11 — P3 conversation surfaces
**What:** `briefings` + `agent_questions` tables/tools; wall Briefing widget +
question modal; answer → `question.answered` webhook resume.
**Hermes:** New tools: `briefing_publish`/`resolve`/`list`, `question_ask`/`get`.
Use `household-review` (every ~3h + morning) to surface things via briefings
(dedupe against `briefing_list`, not memory). Ask clarifications via
`question_ask` with `context` to resume.

## 2026-07-11 — P2 calendar write-back + second brain
**What:** Google Calendar write-back to the shared family calendar; Postgres
notes with full-text search; nightly markdown export.
**Hermes:** New tools: `calendar_list_events`, `calendar_event_create`/`update`,
`note_append`/`list`/`search`, `search_all`. File dated appointments to the
calendar (not as todos); file action-less facts as notes.

## 2026-07-11 — P1 intake plumbing
**What:** Inbox filing lifecycle, shopping/todo MCP tools, Hermes inbox webhook,
`telegram_user_id` + guest user.
**Hermes:** New tools: `inbox_set_status`, `inbox_file`, `shopping_list`/`add`/
`update`, `todo_update`, `dashboard_reload`. Process captures with the
`household-intake` skill: claim (`inbox_set_status processing expect=pending`),
act, then `inbox_file` with provenance refs.
