# HouseholdMCP — Contract

> The MCP tool surface that Hermes and Claude Code both speak to. Single source of truth for "what can act on the household."

## 1. What this is

`HouseholdMCP` is a single MCP server running on the Beelink Ubuntu VM. Two principal callers connect to it:

- **Hermes** (Nous Research agent) — primary caller. Most household intent (file this note, add a todo, propose a widget, search second-brain) goes through MCP tools.
- **Claude Code** — secondary caller. Mostly read-only introspection (what event kinds exist, what widgets are registered) plus dashboard reload triggers. Its primary interface remains the file system (Read/Write/Edit/Bash on the Haven repo).

A third notional caller is **admin/CLI** for manual ops (apply destructive migrations, replay inbox classifications).

Why a shared MCP server: Hermes and Claude Code need to agree on a vocabulary of household operations. Reimplementing each operation in each agent (or coordinating via DB conventions alone) gets messy fast. The MCP server is the contract.

---

## 2. Connection and identity

- **Transport**: stdio for local agents (Hermes, Claude Code) running on Beelink. HTTPS via Caddy for the dashboard backend's own internal calls and for any future remote callers.
- **Service token**: each caller is provisioned a long-lived bearer token (`agent_id`) — `hermes`, `claude-code`, `dashboard-backend`, `admin-cli`. Stored in the server's config; rotated rarely.
- **Per-call `actor`**: each tool call accepts an optional `actor` field naming the user being represented (`michael`, `fiona`, `wall`, `system`). When unset, defaults to the device-token's bound user; when set by Hermes, indicates which household member triggered the action.

```
Caller (agent_id)  +  actor (user_id)
   hermes              michael          → "Hermes is acting on Michael's behalf"
   claude-code         system           → "Claude Code is doing code-driven work"
   dashboard-backend   wall             → "Wall UI is requesting a read for the kiosk"
```

Audit log records `(ts, agent_id, actor, tool, args_sha256, result_status)` for every call.

---

## 3. Conventions

- **Naming**: flat snake_case (`inbox_append`, `event_query`). Domain grouping is documentation-only.
- **Schemas**: JSON. All args validated by JSON Schema. Returns documented per tool.
- **Time**: all timestamps are ISO-8601 with timezone, stored as UTC, displayed in the household's local TZ (Europe/London assumed; configurable).
- **IDs**: UUIDv7 for DB rows; string slugs for widget/event-kind registrations.

### Risk levels

Every tool declares a risk level. This drives Hermes's approval-gate behaviour and the audit-log retention.

| Level | Meaning | Default behaviour |
|---|---|---|
| `read` | No side effects | Auto-execute |
| `write_low` | Additive write to DB or git; reversible | Auto-execute |
| `write_med` | Additive but harder to reverse (HA automation, widget add) | Single-tap approval |
| `destructive` | Removes or alters existing data, or changes physical-world state | Explicit confirm with diff |

Hermes is responsible for surfacing the approval UI; the MCP server itself doesn't gate — it logs and obeys. Approval is a Hermes-side policy, not a server-side lockout. This keeps the contract uniform; safety lives in the orchestrator.

### Error format

Every error returns `{error: {code, message, details?}}`. Codes:
- `not_found` — referenced resource missing
- `invalid_args` — schema mismatch
- `permission_denied` — agent_id lacks scope (rare in v1, reserved)
- `conflict` — concurrent write / version mismatch
- `unsafe_migration` — migration tool refused to apply
- `upstream` — HA / Google / external system failed; `details.upstream_code` set

---

## 4. Tool catalogue

### Inbox — universal capture and filing

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `inbox_append` | `source, raw_text, audio_url?, metadata?, device?, actor?` | `{id, ts}` | Hermes, dashboard | `write_low` | **live** |
| `inbox_get` | `id` | `{id, ts, source, raw_text, audio_url, metadata, status, filed_refs}` | Any | `read` | **live** |
| `inbox_list` | `status?, since?, older_than?, limit=50` | `{rows}` | Any | `read` | **live** |
| `inbox_set_status` | `id, status, expect?` | `{updated, id, status}` | Hermes | `write_low` | **live** |
| `inbox_file` | `id, refs[], status='filed'\|'ignored'` | `{id, status, filed_refs}` | Hermes | `write_low` | **live** |

Filing is **decomposed**, not a single `classify_and_file` tool: classification
lives in the `household-intake` Hermes skill (see
[`../docs/hermes/skills/household-intake/`](../docs/hermes/skills/household-intake/SKILL.md)),
which creates the typed records (`todo_create`, `shopping_add`, …) and then
records provenance with `inbox_file`. This keeps judgment in the skill (tunable
without a code deploy) and the tools mechanical.

Lifecycle: `pending → processing → filed | ignored`. The intake pipeline
**claims** an item with `inbox_set_status status=processing expect=pending`
(an optimistic compare-and-set: `{updated:false}` means another run won the
race, so stop) so the push webhook and the sweeper cron can both fire safely.
`older_than` (e.g. `'10m'`) is the sweeper's filter for stragglers. `inbox_file`
**appends** to `filed_refs`, so a multi-intent capture can file in parts;
refs are opaque typed strings (`todo:<uuid>`, `shopping:<uuid>`, `gcal:<id>`,
`note:<uuid>`).

### Todos

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `todo_list` | `done?, limit=200` | `{todos:[todo]}` | Any | `read` | **live** |
| `todo_create` | `title, due_at?, tags?, visibility?, assignee?, source_inbox_id?` | `todo` | Hermes, dashboard | `write_low` | **live** |
| `todo_set_done` | `id, done` | `todo` | Hermes, dashboard | `write_low` | **live** |
| `todo_update` | `id, title?, notes?, due_at?, tags?, visibility?, assignee?` | `todo` | Hermes | `write_low` | **live** |
| `todo_delete` | `id, reason, approval_token` | `{ok}` | Hermes | `destructive` | planned (P4) |

`assignee` is a user handle (`michael`, `fiona`), resolved to `assignee_user_id`
server-side — the same convention as the `/api/todos` REST route. Each todo is
returned with a derived `done` boolean alongside the raw `done_at` timestamp.
`todo_update` takes explicit named fields (only those present change; pass
`null` to clear a nullable one) rather than an opaque `patch`. `todo_delete`
is `destructive` and lands with the Phase 4 approval-token flow.

### Shopping

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `shopping_list` | `bought?, limit=200` | `{items}` | Any | `read` | **live** |
| `shopping_add` | `name, qty?, store?, aisle?, visibility?, source_inbox_id?` | `item` | Hermes, dashboard | `write_low` | **live** |
| `shopping_update` | `id, bought?, name?, qty?, store?, aisle?` | `item` | Hermes, dashboard | `write_low` | **live** |
| `shopping_remove` | `id, approval_token` | `{ok}` | Hermes | `write_med` | planned (P4) |

Mirrors the `/api/shopping` REST route (same `bought` derived boolean). Marking
an item **bought** is `shopping_update bought=true` — it sets `purchased_at` and
keeps the row, so history and provenance survive. `shopping_remove` (genuine
deletion, rarely needed) is `write_med` and gated behind an approval token.
`aisle` is one of `produce | bakery | dairy | pantry | other`.

### Notes (Tier 0 second brain)

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `note_append` | `body, title?, subject?, tags?, source_inbox_id?` | `note` | Hermes | `write_low` | **live** |
| `note_list` | `subject?, limit=50` | `{notes}` | Any | `read` | **live** |
| `note_search` | `query, limit=20` | `{notes}` | Hermes | `read` | **live** |

**Revised from the original "markdown in git" design.** Notes are now a
Postgres table (`notes`, migration 0005) with SQL full-text search — this keeps
the second brain searchable via `search_all` and symmetric with the rest of the
MCP surface. A nightly script-mode cron (`export-notes.ts`) writes them to
`/var/haven/notes/*.md` (one file per `subject`) so the greppable/backup-
friendly property survives. `subject` is a grouping tag like `person:fiona`.
pgvector semantic search is deferred until a local embedding runtime exists on
the Beelink (the `search` tsvector column covers keyword recall meanwhile; the
embedding column is a safe additive migration later).

### Events (generic log table)

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `event_log` | `kind, ts?, actor?, metadata?, source_inbox_id?` | `{id}` | Hermes, HA, dashboard | `write_low` |
| `event_query` | `kind?, since?, until?, actor?, limit=100` | `[event]` | Any | `read` |
| `event_kinds_list` | — | `[{kind, schema_json, first_seen_ts, last_ts, count, owner_widget?}]` | Any | `read` |
| `event_kind_register` | `kind, schema_json, description, owner_widget?` | `{ok}` | Claude Code | `write_low` |

`event_kinds_list` is the canonical answer to "what data shapes do we have?" — Hermes consults it before logging unfamiliar kinds; Claude Code consults it before proposing a new one. Each kind has an optional schema for `metadata`, validated on write.

### Calendar (read via ICS mirror, write via Google API)

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `calendar_list_events` | `from?, to?` | `{events, from, to}` | Any | `read` | **live** |
| `calendar_event_create` | `summary, start, end?, all_day?, description?, location?, time_zone?, source_inbox_id?` | `{id, htmlLink, …}` | Hermes | `write_med` (auto by default policy) | **live** |
| `calendar_event_update` | `id, summary?, start?, end?, …` | `{id, htmlLink, …}` | Hermes | `write_med` (auto by default policy) | **live** |
| `calendar_event_delete` | `id, approval_token` | `{ok}` | Hermes | `destructive` | planned (P4) |

**Revised from the original read-only design (see §9).** Reads still come from
the ICS feed (secret URL stays server-side; recurrences expanded). Writes go to
the **shared family Google Calendar** via the Calendar API write-back service
(`apps/backend/src/services/gcal.ts`, OAuth refresh-token, scope
`calendar.events`) so agent-created appointments alert on phones. The MCP tools
proxy the backend rather than duplicating Google auth. Created events carry a
`haven_inbox_id` extended property + a provenance footer for auditability.
`start` is an ISO datetime with offset (timed) or `YYYY-MM-DD` (all-day).

### Home Assistant

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `ha_entity_state` | `entity_id` | `{state, attributes, last_changed}` | Any | `read` |
| `ha_entity_history` | `entity_id, since, until?, limit=1000` | `[{ts, state, attributes}]` | Any | `read` |
| `ha_entity_search` | `query, domain?` | `[entity]` | Any | `read` |
| `ha_entity_call_service` | `domain, service, entity_id, data?` | `{ok}` | Hermes, dashboard | `destructive` |
| `ha_automation_write` | `name, yaml_content` | `{path, sha}` | Claude Code | `write_med` |
| `ha_automation_remove` | `name, reason` | `{ok}` | Claude Code | `destructive` |

`ha_entity_call_service` is marked destructive because it changes physical-world state (turning a heater on, unlocking a door). Hermes should approval-gate on at least the first call from a session for any given entity, then remember the trust within session memory.

### Widgets and dispatch

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `widget_list` | `visibility?, surface?` | `[{name, visibility, sha, registered_at}]` | Any | `read` |
| `widget_get` | `name` | `{name, manifest, content_paths}` | Any | `read` |
| `widget_propose` | `intent, surface_hint?, constraints?` | `{plan_envelope}` | Hermes | `read` |
| `widget_dispatch` | `plan_envelope, approval_token?` | `{task_id}` | Hermes | `write_med` or `destructive` (per plan.risk) |
| `widget_dispatch_status` | `task_id` | `{state, log_url, commit_sha?, error?}` | Hermes, dashboard | `read` |
| `widget_remove` | `name, reason` | `{ok}` | Hermes | `destructive` |

`widget_propose` returns a structured plan (see § 5) without executing. `widget_dispatch` is what actually launches Claude Code with the plan. If `plan.risk` is anything above `write_low`, the call requires an `approval_token` previously issued (see § 6).

### Dashboard

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `dashboard_reload` | `reason, surface='all'` | `{ok, reason, surface}` | Claude Code, Hermes, admin | `write_low` | **live** |
| `dashboard_status` | — | `{surfaces: [{device_id, last_seen, build_sha, online}]}` | Any | `read` | planned |
| `dashboard_screenshot` | `device_id` | `{png_url}` | Admin | `read` | planned |

`dashboard_reload` emits a Postgres `NOTIFY haven_reload`, which the backend
bridges to an SSE `dashboard:reload` event for all matching surfaces; they
`invalidateAll()` on next idle tick. `dashboard_screenshot` uses adbd to
capture the Boox — useful for remote debugging.

### Conversation — briefings & questions (agent → household)

| Tool | Args | Returns | Caller | Risk | Status |
|---|---|---|---|---|---|
| `briefing_publish` | `dedupe_key, title, body?, severity, surface, source_refs, expires_at?` | `briefing` | Hermes | `write_low` | **live** |
| `briefing_resolve` | `dedupe_key` | `{resolved}` | Hermes | `write_low` | **live** |
| `briefing_list` | `include_resolved=false, limit=50` | `{briefings}` | Any | `read` | **live** |
| `question_ask` | `question, options?, context?, target_surface, target_user?, expires_at?` | `question` | Hermes | `write_low` | **live** |
| `question_get` | `id` | `question` | Any | `read` | **live** |

The two-way surface (P3). **Briefings** are what the review job decides is worth
surfacing — idempotent on `dedupe_key` so repeated runs refresh rather than
duplicate; re-surfaces only on severity escalation; `severity` is
`info|attention|urgent`. The wall reads active ones (`GET /api/briefings`) and
taps to acknowledge (`PATCH /api/briefings/:id/ack`). **Questions** show a modal
on the wall/phone (SSE `agent:question`) and mirror to Telegram; the answer
(`POST /api/questions/:id/answer`) records it and fires the Hermes webhook
(`question.answered`) so a fresh run resumes the pending work using the
question's `context`. Approvals (P4) ride these same rails with
`options=[approve, reject]`. Continuity lives entirely in these tables — Hermes
cron/gateway agents are fresh per run and must not rely on session memory.

### Users and devices

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `user_list` | — | `[{id, name, ...}]` | Any | `read` |
| `user_get` | `id` | `user` | Any | `read` |
| `user_resolve_actor` | `device_id, hint?` | `{user_id?, confidence}` | Hermes | `read` |
| `device_list` | — | `[device]` | Any | `read` |

`user_resolve_actor` is the helper Hermes calls when filing inbound items to decide the `actor` field — usually returns the device's owner, but may use a voice-print hint or recent-actor signal.

### Search (cross-tier)

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `search_all` | `query, semantic=true, kinds?, since?, until?, limit=20` | `[{tier, kind, ref_id, snippet, score, ts}]` | Any | `read` |

`kinds` filters across tiers: `["raw_inbox", "todo", "note", "event:dishwasher_run"]`. Hermes uses this for "have we talked about X before?" recall.

### Migrations

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `migration_list_pending` | — | `[{name, safe, sql_preview, created_by_task_id?}]` | Any | `read` |
| `migration_apply_safe` | — | `{applied: [name], skipped_unsafe: [name]}` | Backend startup, admin | `write_low` |
| `migration_apply_named` | `name, confirm_token` | `{ok}` | Admin | `destructive` |

Safe = additive (CREATE TABLE, ADD COLUMN NULL, CREATE INDEX CONCURRENTLY, new enum values). Anything else is unsafe and blocked from auto-apply.

---

## 5. The widget plan envelope

The structured object Hermes produces (via `widget_propose`) and consumes (via `widget_dispatch`). Designed to be both a contract for Claude Code and a human-reviewable plan in the approval UI.

```json
{
  "name": "dishwasher_weekly",
  "intent": "Show how often we run the dishwasher this week",
  "requested_by": { "user_id": "michael", "via": "hermes" },
  "created_ts": "2026-06-22T20:55:00+01:00",

  "surface": { "wall": true, "phone": false },
  "visibility": "household",
  "schedule": { "always": true },

  "data_strategy": {
    "level": 1,
    "table": "events",
    "new_kind": "dishwasher_run",
    "kind_schema": {
      "type": "object",
      "properties": {
        "duration_min": { "type": "number" },
        "cycle": { "type": "string" }
      }
    }
  },

  "capture": [
    {
      "type": "ha_automation",
      "trigger": { "entity_id": "switch.dishwasher", "to_state": "on" },
      "action": "event_log",
      "kind": "dishwasher_run"
    }
  ],

  "ui": {
    "component_template": "metric_with_chart",
    "size": { "cols": 4, "rows": 2 },
    "title": "Dishwasher runs (7d)",
    "accents": ["accent-sky"]
  },

  "files_to_create": [
    "apps/dashboard/src/widgets/dishwasher_weekly.svelte",
    "apps/dashboard/src/repos/events/dishwasher.ts",
    "ha/automations/log_dishwasher.yaml"
  ],
  "files_to_modify": [
    "apps/dashboard/widgets.json"
  ],

  "migrations": [],
  "backfill": { "available": true, "source": "ha_history", "days": 30, "consent": "pending" },

  "risk": "write_med",
  "needs_approval": true,

  "rollback": {
    "files": "delete created files",
    "registry": "remove widget entry",
    "data": "leave events; user can delete via inbox_replay or migration_apply_named"
  }
}
```

Fields and rules:

- **`data_strategy.level`** — 0 (notes only) | 1 (events.kind) | 2 (column add) | 3 (new table). Lowest viable rung.
- **`migrations[]`** — present only when `level >= 2`. Each migration carries `{name, safe, sql, description}`. Claude Code writes the file but doesn't apply.
- **`capture[]`** — how new data flows in. Types: `ha_automation`, `dashboard_button`, `voice_command`, `scheduled_pull`, `manual_only`.
- **`ui.component_template`** — a registered widget template (`metric_with_chart`, `single_value`, `list_summary`, `toggle_grid`, `freeform`). Templates exist so most widget bodies are configuration, not bespoke Svelte.
- **`rollback`** — every plan ships with a removal story, so `widget_remove` is always one-shot.

---

## 6. Dispatch flow end-to-end

```
1. User → Hermes: "show how often we run the dishwasher"
                  │
                  ▼
2. Hermes calls   widget_propose(intent="...", surface_hint="wall")
                  → returns plan_envelope (read-only, no side effects)
                  │
                  ▼
3. Hermes evaluates plan.risk and plan.needs_approval:
   - write_low  → skip approval, go to step 5
   - write_med  → show one-tap approval card to user (Boox or phone)
   - destructive→ show full plan with diff; require typed confirm
                  │
                  ▼
4. User taps "Approve" — Hermes calls  approval_issue(plan_envelope)
                                       → returns approval_token (one-time)
                  │
                  ▼
5. Hermes calls   widget_dispatch(plan_envelope, approval_token)
                  → server spawns Claude Code subprocess with plan as input
                  → returns task_id
                  │
                  ▼
6. Claude Code in its own process:
   - reads widget template registry
   - writes files_to_create, modifies files_to_modify
   - writes migration files (if any) — does NOT apply
   - writes HA automation YAML (if any)
   - git commit with message "widget: dishwasher_weekly — <task_id>"
   - calls  event_kind_register(kind="dishwasher_run", schema=..., owner_widget="dishwasher_weekly")
   - calls  dashboard_reload(reason="widget dispatch", surface="wall")
   - exits 0
                  │
                  ▼
7. Backend file-watcher sees the commit:
   - runs migration_apply_safe() (no-op here; no migrations in this plan)
   - rebuilds dashboard bundle
   - SSE → "dashboard:reload" → connected surfaces refresh
                  │
                  ▼
8. Hermes polls   widget_dispatch_status(task_id) until state=done
                  → confirms back to user with the widget name + offer to backfill
                  │
                  ▼
9. User: "yes, backfill"
   → Hermes calls  ha_entity_history(entity_id, since=now-30d)
   → bulk event_log() inserts
```

Failure handling: if step 6 fails partway, Claude Code's commit (if any) is reverted by the file watcher's post-task hook; if no commit exists, nothing to undo. `task_id` carries error state visible via `widget_dispatch_status`.

---

## 7. Approval tokens

To keep the contract uniform, approval lives outside the MCP tools but is referenced by them.

- `approval_issue(plan_envelope_hash, user_id)` → `{token, expires_at}` — issued by Hermes after the user approves; signed; valid for 10 minutes; single-use.
- The server's `widget_dispatch`, `ha_automation_remove`, `widget_remove`, `todo_delete`, `migration_apply_named` accept an `approval_token` arg and reject if missing/expired/used.
- For `write_med` and `destructive` calls without an approval token, the server returns `permission_denied` with `details.required_approval: true`.

This makes the contract testable: a misbehaving Hermes that tries to dispatch without an approval cannot, because the server rejects.

---

## 8. Versioning

- The contract document is the source of truth. Bump `version` on breaking changes; agents read the version on connect.
- Tools added later are not breaking. Tools removed or whose arg shape changes are.
- Plan envelope schema versioned separately (`plan_envelope.version`) — bumped when adding a new `data_strategy.level` value, a new `capture.type`, etc.

Current version: `2026.06.22-0.1.0` (first locked draft).

---

## 9. Settled conventions

These decisions are folded into the contract; tools above operate under these assumptions. Treat as binding for v1.

### Calendar — read via ICS, write via Google API (revised)
Original v1 decision was read-only. **Superseded in the agent-maturity plan
(P2):** the concrete write-flow appeared — Hermes creating appointments from
plain-language captures ("Nico has a doctor's appointment Tuesday 2pm"). Reads
stay on the server-side ICS mirror; writes go to **one shared family calendar**
via `calendar_event_create/update` (OAuth scope `calendar.events`). Delete is
`destructive` and gated behind the P4 approval-token flow. Route agent-created
events to the shared calendar only — never to a personal calendar without
explicit per-event intent.

### Voice memo transcription — Whisper.cpp on Beelink
Audio captures are transcribed locally by a Whisper.cpp service running on the Beelink Ubuntu VM. The dashboard backend invokes it when an audio attachment hits `inbox_append`; it writes the transcript into the same `raw_inbox` row (`raw_text`) and retains the original audio at `audio_url` for replay and debugging. No household voice data leaves the home. Start with `medium.en` (~1.5 GB); upgrade to `large-v3` if accuracy demands it.

### Photos & attachments — local disk served by Caddy
Attachments live at `/var/haven/attachments/YYYY/MM/<uuid>.<ext>` on the Beelink. Served by Caddy with the same auth as the dashboard. Inbox payload shape: `metadata.attachments: [{url, mime, size}]`. Backup via rsync alongside the rest of household-state backups. Migrate to MinIO or off-site object storage only if volume or redundancy demands appear.

### `wall` identity — synthetic device-bound actor
`actor: wall` is not a `users` row. It resolves to "the household" for visibility and filing purposes. Inputs from the Boox that lack a more specific user attribution are attributed to `wall`. Hermes may later upgrade attribution via voice-print or recent-activity hints, but never silently — surfacing the inferred actor to the user when it does.

### Haven-owned HA automations — own folder
Automations Haven creates live in `ha/automations/haven/<widget_name>.yaml`. The `ha_automation_write` and `ha_automation_remove` tools operate only within this folder. Hand-authored automations elsewhere in the HA config are never touched. This lets `widget_remove` cleanly drop the automation file with zero risk of breaking unrelated automations.

### Backfill — follow-up turn, separate consent
`widget_dispatch` never backfills as part of the initial action. After the widget is live, Hermes offers backfill in a follow-up turn: *"Widget added. I can backfill 30 days from HA history — want me to?"* This keeps the first approval card focused on *"do I want this widget"* without conflating with *"do I want my historical data filled in."*

### Migration safety — `squawk` lint, fail-closed
[squawk](https://github.com/sbdchd/squawk) runs against every migration file Claude Code produces. Migrations that pass squawk's safety rules are marked `safe: true` and auto-applied by the backend on rebuild. Anything squawk flags — or anything squawk doesn't recognise — is marked `safe: false` and held for manual `migration_apply_named` with typed confirmation. Fail-closed: unknown patterns are treated as unsafe.
