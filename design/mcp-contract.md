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

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `inbox_append` | `source, raw_text, audio_url?, metadata?, actor?` | `{id, ts}` | Hermes, dashboard | `write_low` |
| `inbox_get` | `id` | `{id, ts, source, raw_text, audio_url, metadata, status, filed_refs}` | Any | `read` |
| `inbox_list` | `status?, since?, limit=50` | `[row]` | Any | `read` |
| `inbox_classify_and_file` | `id, classification` | `{filed_refs: [{kind, ref_id}]}` | Hermes | `write_low` |
| `inbox_replay` | `id, force=false` | `{filed_refs}` | Admin | `write_low` |

`classification` object:
```json
{
  "kind": "todo" | "shopping" | "calendar" | "event" | "note" | "ignore",
  "payload": { ... },           // shape depends on kind
  "confidence": 0.0–1.0,
  "reasoning": "string"
}
```

`inbox_classify_and_file` writes the new row(s) to the appropriate table/file AND updates the `raw_inbox` row's `status → filed` and `filed_refs` to point at what got created. One inbox row can produce multiple filed refs (a voice memo could split into one todo + one note append).

### Todos

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `todo_create` | `title, due_at?, assignee_user_id?, visibility?, source_inbox_id?, tags?` | `{id}` | Hermes | `write_low` |
| `todo_list` | `filter?, limit=100` | `[todo]` | Any | `read` |
| `todo_complete` | `id, done_at?` | `{ok}` | Hermes, dashboard | `write_low` |
| `todo_update` | `id, patch` | `{ok}` | Hermes | `write_low` |
| `todo_delete` | `id, reason` | `{ok}` | Hermes | `destructive` |

`filter` accepts `{assignee, visibility, done, due_before, due_after, tag, q}`.

### Notes (markdown files in git repo)

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `note_append` | `path, content, mode='append'\|'replace_section', section?` | `{ok, line_range}` | Hermes | `write_low` |
| `note_read` | `path` | `{content, frontmatter}` | Any | `read` |
| `note_list` | `glob?` | `[paths]` | Any | `read` |
| `note_search` | `query, semantic=true, limit=20` | `[{path, snippet, score}]` | Hermes | `read` |

Notes live at `<repo>/notes/`. Append-mode adds a timestamped bullet under the appropriate section; replace_section overwrites a named section heading. Frontmatter is YAML.

### Events (generic log table)

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `event_log` | `kind, ts?, actor?, metadata?, source_inbox_id?` | `{id}` | Hermes, HA, dashboard | `write_low` |
| `event_query` | `kind?, since?, until?, actor?, limit=100` | `[event]` | Any | `read` |
| `event_kinds_list` | — | `[{kind, schema_json, first_seen_ts, last_ts, count, owner_widget?}]` | Any | `read` |
| `event_kind_register` | `kind, schema_json, description, owner_widget?` | `{ok}` | Claude Code | `write_low` |

`event_kinds_list` is the canonical answer to "what data shapes do we have?" — Hermes consults it before logging unfamiliar kinds; Claude Code consults it before proposing a new one. Each kind has an optional schema for `metadata`, validated on write.

### Calendar (read-only mirror of Google)

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `calendar_today` | `tz?` | `[event]` | Any | `read` |
| `calendar_upcoming` | `days=7` | `[event]` | Any | `read` |
| `calendar_search` | `query, since?, until?, limit=50` | `[event]` | Hermes | `read` |
| `calendar_sync_now` | — | `{events_added, events_updated, events_removed}` | Admin, scheduler | `write_low` |

Calendar mirror updates on a 5-min schedule plus push subscriptions; `calendar_sync_now` forces a refresh.

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

| Tool | Args | Returns | Caller | Risk |
|---|---|---|---|---|
| `dashboard_reload` | `reason?, surface?` | `{notified: [device_id]}` | Claude Code, admin | `write_low` |
| `dashboard_status` | — | `{surfaces: [{device_id, last_seen, build_sha, online}]}` | Any | `read` |
| `dashboard_screenshot` | `device_id` | `{png_url}` | Admin | `read` |

`dashboard_reload` triggers an SSE `dashboard:reload` event to all matching surfaces; they refresh on next idle tick. `dashboard_screenshot` uses adbd to capture the Boox — useful for remote debugging.

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

### Calendar — read-only mirror only
`calendar_*` tools are read-only against Google Calendar in v1. OAuth scope is `calendar.readonly`. The mirror table is the single source for dashboard reads. No write-back tools (`calendar_create_event`, etc.) ship in v1 — revisit when a concrete dashboard write-flow appears.

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
