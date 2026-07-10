# Haven agent maturity plan

**Status:** approved design, ready to build. **Audience:** the Claude Code (Opus) session(s) implementing it, and future maintainers.
**Prerequisite reading:** [`mcp-contract.md`](mcp-contract.md) (tool conventions, risk levels, plan envelope), [`claude-design-brief.md`](claude-design-brief.md) (e-ink rules), [`../CLAUDE.md`](../CLAUDE.md).

This plan turns Haven from a hand-built dashboard with a read-mostly MCP server into a mature agent-operated household system. It was designed interactively with Michael on 2026-07-11; the decisions in §2 are settled — do not re-litigate them.

---

## 1. Goal and acceptance utterances

Anyone in the household should be able to say things to Hermes — by voice memo on the wall/phone, by Telegram, by pen note — without thinking about the data model. These six utterances are the acceptance tests; each phase in §16 lands one or more of them end-to-end:

| # | Utterance | What must happen |
|---|-----------|------------------|
| U1 | "I need to buy milk, and Nico is out of food" | Two shopping items appear (multi-intent split; "Nico's food" resolved via household context) |
| U2 | "Nico has a doctors appointment on Tuesday at 2pm" | Event created in the shared family Google Calendar; visible on wall calendar |
| U3 | "We need to pick our new house's carpet by the 23rd of July" | Todo with `due_at = 2026-07-23`; review job starts surfacing it as the date nears |
| U4 | "Show me the forecast snow dumps over the next 2 weeks every morning at 8am" | New widget lands via the full plan-envelope → `claude -p` dispatch pipeline |
| U5 | "Update the heat pump automation to turn off at 9pm every night" | HA automation YAML written to `ha/automations/haven/`, synced to HAOS, after one-tap approval |
| U6 | "Fiona really likes daffodils" | Fact stored in the second brain (notes tier), retrievable by `search_all` and the review job |

Beyond one-shot intake, the system behaves like an intelligent house assistant:

- **Push:** new inbox items are processed within seconds, not on a poll.
- **Routine:** a review job every ~3 hours (plus a fuller 7:30am morning pass) looks across all household data and surfaces what matters.
- **Scripts over agents:** recurring deterministic work becomes a scheduled script (no LLM); agentic runs are reserved for judgment.
- **Coding is delegated:** anything requiring Haven code changes goes to Claude Code via `claude -p` with a plan envelope and a stateless runbook.

## 2. Settled decisions

| Decision | Choice |
|---|---|
| Calendar writes | **Google Calendar write-back** to **one shared family calendar**. Haven keeps its read mirror for display. |
| Two-way channel | Hermes' existing **Telegram** gateway, **plus** a new Haven **modal popover** surface for agent questions on wall/phone. |
| Brain | **Nous Hermes running locally on the Beelink**, already connected to HouseholdMCP. No cloud LLM in the always-on loop; Claude (API-billed) only via `claude -p` dispatch. |
| Autonomy | **Trusting**: everything additive/reversible auto-executes. Approval required for: code changes, HA automation changes, deletions, migrations. Plus **earned autonomy** (§11): repeatedly-approved action kinds are proposed for graduation to automatic. |
| Surfacing | **Wall + Telegram by urgency**: ambient items → wall Briefing area; time-sensitive/personal → Telegram too. |
| Recurring scripts | Live in **Hermes' skills/scripts workspace** (`~/.hermes/`), its native scheduler. The Haven repo only changes via Claude Code dispatch. |
| State | Hermes' memory holds *agent behaviour*; **all household state lives in Haven's Postgres** (briefings, tasks, policies, questions). Hermes gateway/cron agents are fresh per invocation, so nothing may depend on Hermes conversational continuity. |

## 3. Architecture

```
 family ──voice/pen/text──► Haven capture (wall/phone PWA) ──► raw_inbox ─┐
 family ──Telegram────────► Hermes gateway ─────────────────► raw_inbox ─┤ (Hermes appends via MCP)
                                                                          │
                                    ┌── webhook push (new inbox item) ◄───┘
                                    ▼
   Hermes (Beelink)  ── HouseholdMCP (stdio) ──► Postgres / backend actions
   • gateway (persistent)          │
   • cron scheduler                ├─► calendar_event_create ─► Google Calendar API
   • skills + scripts              ├─► briefing_publish ─► wall Briefing widget (SSE)
   • fresh agent per run           ├─► question_ask ─► modal popover on wall/phone (SSE)
                                   └─► widget_dispatch ─► spawns `claude -p` in /opt/haven
                                                             │  reads plan + docs/agent-dispatch.md
                                                             │  edits, verifies, commits, pushes
                                                             └─► watcher rebuild + dashboard_reload
```

Roles:

- **Hermes** — orchestration, classification, review, conversation, scheduling. Never edits the Haven repo.
- **HouseholdMCP** — the *only* way agents act on household data. Every tool audited. Risk-gated per contract §3, consulting the autonomy policy (§11).
- **Backend** — REST + SSE for the surfaces; new services for Google Calendar, briefings, questions, dispatch task records.
- **Claude Code (`claude -p`)** — stateless coding contractor. Only actor that commits to the repo.

## 4. Intake pipeline (push)

**Trigger.** On `raw_inbox` insert, the backend POSTs to a Hermes gateway **webhook channel** (hermes-agent supports webhook ingestion): payload = inbox id, kind, transcript/text, actor, device. Add `HERMES_WEBHOOK_URL` + shared secret to `/etc/haven/.env`. Telegram-originated messages skip this hop — the gateway already has them; the intake skill has Hermes append them to `raw_inbox` first (via `inbox_append`) so *everything* has a provenance row, then continue processing in the same run.

**Sweeper.** A Hermes cron (every 15 min, agent mode, cheap prompt) lists `inbox_list status=pending older_than=10m` and processes anything the push path missed. Idempotency comes from inbox status: only `pending` items are processed; the first action is to mark the item `processing` (via `inbox_set_status`) so concurrent runs skip it.

**Classification.** The `household-intake` Hermes skill (§15) defines the taxonomy. One utterance → one or more typed actions:

| Intent | Action via MCP | Example |
|---|---|---|
| shopping | `shopping_add` | U1 |
| todo | `todo_create` (with `due_at` when a date is stated) | U3 |
| calendar event | `calendar_event_create` | U2 |
| fact / note | `note_append` | U6 |
| widget request | `widget_propose` → approval → `widget_dispatch` | U4 |
| automation request | draft YAML → approval → `ha_automation_write` (or dispatch if complex) | U5 |
| reminder / standing request | Hermes cron job (its own scheduler) + optional note | "remind me every Sunday…" |
| unclear | `question_ask` (modal/Telegram), item stays `pending` | — |

Rules the skill must encode:

- **Multi-intent splitting** (U1 is two items). Every action links back to the inbox row.
- **Household context** lives in Hermes' `USER.md` + a `household-context` note in Haven (who Nico is, "food" = his usual brand, home town Queenstown, etc.). When context is missing, ask once via `question_ask` and *store the answer as a note* so it's never asked again.
- **Provenance:** finish by calling `inbox_file` with the list of created entity refs (`todo:123`, `gcal:<event_id>`), setting status `filed`. Ambiguous-and-unanswered items stay `pending` for the sweeper/review job to retry or escalate.
- **Confidence:** when in doubt between two intents, prefer the reversible one (note over calendar write), and say what it did in the Telegram reply so mistakes are caught conversationally.

## 5. Data model changes

One migration file per phase, squawk-safe (additive only). New tables (all with `created_at`, actor attribution where relevant):

- `notes` — Tier 0 second brain. Columns: `id`, `title`, `body` (markdown), `tags text[]`, `subject` (e.g. `person:fiona`), `source_inbox_id`, `created_by`. Plus a generated `tsvector` column + GIN index for FTS. (Contract said "markdown in git"; we're revising to Postgres-first for searchability and MCP symmetry — a nightly export to `/var/haven/notes/*.md` keeps the greppable/backup-friendly property. Update `mcp-contract.md` accordingly.)
- `briefings` — surfaced items. `id`, `dedupe_key` (unique), `severity` (`info|attention|urgent`), `title`, `body`, `surface` (`wall|phone|all`), `source_refs jsonb`, `expires_at`, `acknowledged_at`, `resolved_at`.
- `agent_questions` — `id`, `question`, `options jsonb` (nullable → free text), `context jsonb`, `target_surface`, `target_user`, `expires_at`, `answer`, `answered_by`, `answered_at`.
- `agent_tasks` — dispatch records. `id` (the `task_id` in commit messages), `kind` (`widget|automation|fix|feature`), `plan jsonb`, `status` (`queued|running|succeeded|failed|rolled_back`), `branch`, `commit_sha`, `error jsonb`, `started_at`, `finished_at`, `log_path`.
- `autonomy_policy` — `action_kind` (PK, e.g. `calendar_event_create`, `ha_automation_write`), `mode` (`auto|ask`), `approvals_count`, `rejections_count`, `graduated_at`, `notes`.
- `approvals` — ledger: `id`, `action_kind`, `summary`, `requested_via`, `outcome` (`approved|rejected|expired`), `token_id`, `decided_by`, `decided_at`.
- `users.telegram_user_id` (nullable column add) — maps Telegram senders to household users; unknown senders resolve to a `guest` actor.

Existing tables already carry what's needed (`todos.due_at`, `todos.notes` exist; `raw_inbox` statuses; `widgets` registry table). `calendar_mirror` stays as-is for now (display still reads the ICS feed live).

## 6. MCP tool surface (delta)

Current v0.2 surface: `inbox_{list,get,append}`, `todo_{list,create,set_done}`, `event_{kinds_list,kind_register,log}`, `widget_{list,get}`, `user_list`, `device_list`. Add, per contract conventions (zod schemas in `schemas.ts`, `withAudit` wrapper, optional `actor`):

| Domain | Tool | Risk | Notes |
|---|---|---|---|
| inbox | `inbox_set_status`, `inbox_file` | write_low | filing + provenance links |
| todos | `todo_update` | write_low | due date, notes, title |
| todos | `todo_delete` | destructive | approval token |
| shopping | `shopping_list`, `shopping_add`, `shopping_update` | read / write_low | parity with REST; U1 |
| shopping | `shopping_remove` | write_med | "bought" is `update done`, not remove |
| notes | `note_append`, `note_list`, `note_search` | write_low / read | U6 |
| calendar | `calendar_list_events` | read | reads the ICS mirror (existing backend logic) |
| calendar | `calendar_event_create`, `calendar_event_update` | write_med → **auto** via default policy (§11) | Google API, shared family calendar |
| calendar | `calendar_event_delete` | destructive | approval token |
| briefing | `briefing_publish`, `briefing_resolve`, `briefing_list` | write_low / read | dedupe on `dedupe_key` |
| questions | `question_ask`, `question_get` | write_low / read | answers also push back via webhook (§10) |
| approvals | `approval_issue` | — | contract §7: signed single-use token, 10-min TTL (HMAC with secret from env; store `token_id` in `approvals`) |
| autonomy | `autonomy_policy_list`, `autonomy_policy_set` | read / write_med | `_set` itself always requires approval |
| widgets | `widget_propose` | read (validates only) | validates plan envelope against a zod schema of contract §5; returns normalized plan + computed risk |
| widgets | `widget_dispatch`, `widget_dispatch_status` | write_med (token) / read | §13 |
| widgets | `widget_remove` | destructive | git revert of the widget commit + registry removal, via dispatch |
| HA | `ha_entity_state`, `ha_entity_history`, `ha_entity_search` | read | thin wrappers over the backend HA proxy |
| HA | `ha_entity_call_service` | write_med | same allowlist as `POST /api/ha/climate`, widened deliberately per-entity |
| HA | `ha_automation_write`, `ha_automation_remove` | write_med / destructive (tokens) | §14 |
| search | `search_all` | read | FTS across notes, todos, inbox, events, briefings; returns typed refs |
| dashboard | `dashboard_reload` | write_low | expose the existing NOTIFY as a real tool (contract already specifies it) |

Gated tools check `autonomy_policy` first: if `mode=auto` for that `action_kind`, no token needed (still audited + Telegram-notified); otherwise `permission_denied` without a valid token. **Floor: `todo_delete`, `calendar_event_delete`, `widget_remove`, `ha_automation_remove`, and unsafe migrations can never be set to `auto`.**

Update [`mcp-contract.md`](mcp-contract.md) §4 as each domain lands (CLAUDE.md rule: docs in the same commit).

## 7. Google Calendar write-back

- New backend service `apps/backend/src/services/gcal.ts` using the Google Calendar API v3 with an OAuth refresh token (one-time consent flow run manually; client id/secret/refresh token + `HAVEN_GCAL_CALENDAR_ID` in `/etc/haven/.env`). Scope: `calendar.events` (not full `calendar`).
- Events created with `extendedProperties.private.haven_inbox_id` for provenance and a `[haven]` marker in the description footer — auditable and bulk-cleanable.
- The wall display keeps reading the ICS feed; created events appear there on the next fetch (≤15 min). `calendar_event_create` returns the event id + htmlLink so Hermes can confirm in Telegram immediately.
- MCP tools call the backend over localhost REST (`POST /api/calendar/events`, added alongside the existing read route) rather than duplicating Google auth in the MCP process.

## 8. Second brain (notes tier)

- Postgres `notes` table (§5) + `note_append/list/search` + `search_all`. FTS (tsvector) is v1; **pgvector embeddings are explicitly deferred** until a local embedding runtime exists on the Beelink (candidate: fastembed or Ollama `nomic-embed-text`; revisit after Phase 5 — the column/index add is a safe migration later).
- Nightly Hermes **script-mode** cron exports notes to `/var/haven/notes/<subject-or-date>/*.md` (greppable, included in backups). Git-versioning the export is optional later; don't block on it.
- The intake skill routes "statements about the world with no action" here (U6), tagged by subject. The review job and any future "gift ideas for Fiona" query hit `search_all`.

## 9. Review job & briefing surface

**Hermes cron, agent mode:** every 3h (`0 */3 * * *`) with a compact prompt; a fuller morning pass at 7:30am that also composes a Telegram morning digest. The `household-review` skill procedure:

1. Gather: `todo_list` (due soon/overdue), `inbox_list status=pending` (stuck items), `briefing_list` (what's already surfaced — **dedupe against this, not memory**), `calendar_list_events` (next 48h), selected `ha_entity_state` reads (temps, energy anomalies), `note_search` for date-tagged notes.
2. Decide: what deserves surfacing, at what severity. Encode judgment rules in the skill (e.g. "todo due ≤3 days → attention; overdue → urgent; unanswered question >24h → re-ask once then Telegram").
3. Act: `briefing_publish` (idempotent via `dedupe_key`, e.g. `todo-due:123`); severity `urgent` → also deliver to Telegram through the gateway. `briefing_resolve` anything no longer true (todo completed, event passed).
4. Never restate what's already acknowledged (`acknowledged_at` set) unless severity escalated.

**Wall Briefing widget:** new dashboard component rendering active briefings (severity accent per design tokens — amber attention, rust urgent), tap to acknowledge (`PATCH /api/briefings/:id/ack`). Ambient placement on the main dashboard grid; empty state collapses to nothing. This is also where "earned autonomy" proposals and dispatch results can quietly land.

**Statelessness rule:** each review run is a fresh agent. All continuity comes from `briefings`/`agent_questions`/`autonomy_policy` tables — never from Hermes session memory.

## 10. Agent questions (modal popover) & approvals

- `question_ask` inserts into `agent_questions` and NOTIFYs; backend SSE emits `agent:question` (extend the existing `/api/events` stream in `apps/backend/src/index.ts` / `events.ts`).
- Dashboard: a `AgentQuestionModal` component in `+layout.svelte` listening for the event. E-ink rules apply: no animation on wall, 2px borders, ≥64px touch targets, option buttons + free-text fallback, explicit "Later" dismiss (question stays open). Phone gets the same modal with light motion allowed.
- Answer flow: `POST /api/questions/:id/answer` records it, then the backend POSTs to the Hermes webhook (`question_answered` payload) so a fresh Hermes run resumes the pending work (the question's `context` jsonb carries everything needed to resume — e.g. the inbox id being classified).
- **Approvals** ride the same rails: an approval request is a question with `options: [approve, reject]` + a rendered summary/diff, mirrored to Telegram (first answer wins). On approve, Hermes calls `approval_issue` and immediately the gated tool with the token; the ledger row lands in `approvals` either way.

## 11. Earned autonomy

- Every approval outcome updates `autonomy_policy` counters for its `action_kind` (and `approvals` ledger).
- The morning review checks: any `ask`-mode kind with **≥5 consecutive approvals and 0 rejections in 30 days** → propose graduation via `question_ask` ("I've asked 6 times to write HA automations and you've always approved — make this automatic? I'll still notify you each time.").
- On yes → `autonomy_policy_set mode=auto`. Auto-executed formerly-gated actions always send a Telegram notification (visibility without friction). A rejection at any point resets the streak; the user can demote any kind back to `ask` the same way ("Hermes, ask me before calendar changes again").
- Destructive floor from §6 never graduates.

## 12. Widget system maturation

The specced-but-unbuilt registry becomes real:

- `apps/dashboard/widgets.json` — global registry: array of `{ slug, surface, visibility, position: {col_start, col_span, row}, enabled, schedule? }`. The main dashboard route composes `DashboardGrid` from it instead of hard-coded markup.
- `apps/dashboard/src/lib/widgets/<slug>/` per CLAUDE.md: `manifest.json` (name, description, size constraints, data sources, refresh mode live/static), `index.svelte` (composes `WidgetFrame` + existing components — never bespoke layout), `data.ts` (typed loader; talks to `src/lib/repos/*`).
- `src/lib/repos/` — extract the existing fetchers from `api.ts` into per-domain repo modules (`weather.ts`, `ha.ts`, `todos.ts`, …) so widget `data.ts` files have a sanctioned data layer. `api.ts` stays as the low-level typed client.
- **Port existing tiles** (clock, weather, calendar-today, todos, shopping, sensors) into the registry as the first "dispatches" — this dogfoods the format and produces reference widgets for Claude Code to imitate. Keep `/climate` etc. as hand-built sub-screens; the registry governs the main grid.
- `schedule` field semantics (needed for U4): `{ show_between?: ["08:00","12:00"], refresh_cron?: "0 8 * * *" }` — visibility windowing + data refresh. The grid re-evaluates on the SSE heartbeat; no client-side cron needed.
- Registry loader must **fail soft per widget** (same tolerant-load pattern as today): a broken widget renders an error frame, never a broken wall.

## 13. Claude Code dispatch (`claude -p`, stateless)

**Invocation.** `widget_dispatch` (MCP, runs on the Beelink):

1. Validates plan (re-runs `widget_propose` validation), creates `agent_tasks` row, writes `/var/haven/tasks/<task_id>/plan.json`.
2. Creates a **git worktree** from `main` at `/var/haven/tasks/<task_id>/wt` (never edits the live checkout — a failed run can't break the deployed tree).
3. Spawns:
   ```
   claude -p "You are executing a dispatched Haven plan. Read docs/agent-dispatch.md, then /var/haven/tasks/<task_id>/plan.json, and execute it." \
     --permission-mode acceptEdits --max-turns 80
   ```
   with `cwd` = the worktree, output teed to `/var/haven/tasks/<task_id>/run.log`. Returns `task_id` immediately (async); Hermes polls `widget_dispatch_status`.
4. A wrapper script watches exit: on success it fast-forwards `main`, pushes to origin (deploy key already on the Beelink), lets the watcher rebuild, and marks the task `succeeded`; on failure it marks `failed` with the error JSON the run wrote, and removes the worktree. Rollback = `git revert <commit_sha>` via a `widget_remove` dispatch.

**`docs/agent-dispatch.md` — the stateless runbook.** This is the document every dispatched session reads first; it must be token-light (~2–3 pages) and complete. Contents:

1. *Who you are / where you are* — dispatched contractor on the Beelink; the worktree is yours; the plan is the contract; no scope creep (CLAUDE.md rules apply).
2. *Execute the plan* — file-by-file expectations per plan `kind` (widget / automation / fix), pointing at a reference widget folder as the canonical example, design-system rules digest (the 6 non-negotiable e-ink rules), data-layer rules (repos only, no raw SQL, migration tiers).
3. *Verify before commit* — `bun run check` and `bun run --filter @haven/dashboard build` must pass; migrations must pass `squawk` (write, never apply); smoke-test any new backend route with `curl` if the plan added one.
4. *Commit & report* — commit format `<verb>: <slug> — <task_id>`; update docs in the same commit per CLAUDE.md; call `dashboard_reload` via HouseholdMCP (repo gets a `.mcp.json` exposing HouseholdMCP to dispatched sessions); write `/var/haven/tasks/<task_id>/result.json` (`{status, commit, summary, follow_ups[]}`).
5. *Failure protocol* — if the plan is wrong/infeasible: write `result.json` with `error.code=invalid_args` + a precise reason Hermes can re-plan from, exit non-zero, commit nothing.

**CLAUDE.md** gets a short pointer to the runbook; the runbook, not CLAUDE.md, is the operational spec (keeps CLAUDE.md stable).

**When does Hermes dispatch vs. act directly?** Encoded in the `widget-planning` skill: data-only changes (new event kind, note, cron script) never dispatch; anything touching `apps/` or `ha/` in the repo always dispatches; HA automation YAML *may* be drafted by Hermes and written via `ha_automation_write` when it's a single-file change (U5), dispatching only for multi-file work.

## 14. HA automations

- Create `ha/automations/haven/` (with README stating the ownership rule). `ha_automation_write` writes the YAML file into the repo dir, commits (`automation: <slug> — <task_id>`), **syncs to HAOS** (scp/Samba copy into `/config/automations/haven/` — decide per what HAOS exposes; one-time manual setup: add `automation haven: !include_dir_merge_list automations/haven/` to HA config), then calls HA `automation.reload` via the existing backend HA proxy (add the service-call passthrough).
- Repo is the source of truth; the sync is one-way Haven → HAOS. `ha_automation_remove` deletes file + synced copy + reloads (destructive, token).
- U5 flow: intake classifies → Hermes reads the existing automation (if Haven-owned) or reports it can't touch user-authored ones → drafts YAML → approval question with the YAML diff → `ha_automation_write`.

## 15. Hermes-side setup (config, skills, crons)

We author the initial skills (checked into `docs/hermes/skills/` in this repo for review/versioning, then copied to `~/.hermes/skills/` — Hermes may evolve its own copies from there; ours are the seed, and drift is expected + fine per the "Hermes owns its behaviour" rule):

| Skill | Purpose |
|---|---|
| `household-intake` | §4 taxonomy, splitting rules, household-context lookup, provenance protocol, when to ask |
| `household-review` | §9 procedure, severity rules, dedupe protocol, Telegram digest format |
| `widget-planning` | how to draft a contract-§5 plan envelope, data-strategy tier selection ("lowest viable rung"), dispatch-vs-direct decision rules (§13) |
| `haven-dispatch` | run `widget_dispatch`, poll status, interpret `result.json`, report outcome / re-plan on `invalid_args` |
| `automation-authoring` | HA YAML conventions, entity discovery via `ha_entity_search`, the approval + write flow |
| `scripts-over-agents` | **the policy the user asked for**: when a recurring job is deterministic (fetch → transform → MCP/REST write), write a script into `~/.hermes/scripts/` and schedule it with `no_agent=True`; reserve agent-mode crons for judgment. Review monthly whether any agent cron has become script-able. |

Cron jobs to register (via hermes cronjob tool): intake sweeper (15m, agent), review (`0 */3 * * *`, agent), morning pass (`30 7 * * *`, agent, delivers Telegram digest), notes export (nightly, **script mode**). `USER.md` seeded with household facts (people, pets/kids disambiguation — Nico, town, calendar conventions).

Config: HouseholdMCP already attached (stdio). Add the `claude -p` invocation pattern to Hermes' `command_allowlist` so dispatch runs unattended; keep Hermes approval mode at Manual/Smart otherwise. Gateway webhook channel enabled for the backend push (§4, §10) with a shared secret.

## 16. Build phases & acceptance

Each phase = one or more PR-sized commits, docs updated in-commit, deployable independently. Suggested order optimizes for daily value early, pipeline complexity late:

| Phase | Scope | Acceptance |
|---|---|---|
| **P1 — intake plumbing** | Inbox webhook push + shared secret; `inbox_set_status`/`inbox_file`; shopping MCP tools; `todo_update`; `users.telegram_user_id` + guest actor; `dashboard_reload` tool; `household-intake` skill v1 + sweeper cron | **U1, U3** e2e from both voice capture and Telegram |
| **P2 — calendar + second brain** | gcal service + OAuth setup + `calendar_event_*` tools; `notes` table + tools + `search_all`; notes export cron | **U2, U6** e2e |
| **P3 — conversation surfaces** | `briefings` + `agent_questions` tables/tools/REST; SSE `agent:question`; Briefing widget + question modal (wall + phone); answer→webhook resume; `household-review` skill + review/morning crons | Review job surfaces U3's carpet deadline on the wall and in the digest; a deliberately ambiguous capture produces a modal question that resumes correctly |
| **P4 — approvals + autonomy** | `approval_issue` + token verification on gated tools; `approvals` ledger; `autonomy_policy` + tools + graduation flow; `todo_delete` | An approval round-trips via Telegram *and* via modal; after 5 approvals the graduation prompt appears; floor kinds refuse `auto` |
| **P5 — widget pipeline** | Registry (`widgets.json`, `lib/widgets/`, `lib/repos/`, grid refactor, schedule semantics); port existing tiles; `widget_propose/dispatch/status/remove`; worktree runner; `docs/agent-dispatch.md`; `.mcp.json`; `widget-planning` + `haven-dispatch` skills | **U4** e2e: utterance → plan → approval → dispatched commit → snow widget live on the wall at 8am, with `agent_tasks` row and clean rollback path |
| **P6 — HA automations** | `ha/automations/haven/` + sync + reload; `ha_entity_*` read tools; `ha_entity_call_service`; `ha_automation_write/remove`; `automation-authoring` skill; HAOS include-dir one-time setup | **U5** e2e with one-tap approval |

**Definition of mature (exit criteria):** all six utterances work from cold, by voice, by either family member; nothing requires knowing the data model; the review job has run for a week without duplicate or stale briefings; at least one action kind has graduated to autonomous; a bad dispatch has been rolled back cleanly with `widget_remove`.

## 17. Prerequisites to verify before P5/P6 (check, don't assume)

1. `claude` CLI installed + authenticated on the Beelink as the `haven` user; API billing acceptable for dispatch runs (est. one widget dispatch ≈ single-digit dollars on Opus; use `--model sonnet` default for dispatch, Opus for gnarly plans).
2. Beelink has push access to `git@github.com:ctomichael/haven.git` (deploy key with write).
3. Hermes gateway webhook channel available in the installed version; confirm payload shape.
4. HAOS file access path for the automation sync (Samba add-on / SSH) — pick during P6.
5. Google Cloud project + OAuth client for the calendar scope (one-time manual, ~15 min).

## 18. Risks & mitigations

- **Local-model classification quality** (Nous Hermes vs. cloud): mitigated by tight skills with few-shot examples, the reversible-default rule, conversational confirmations in Telegram, and `question_ask` escape hatch. If misfiles persist, the intake skill is the tuning surface — not code.
- **Fresh-agent statelessness**: all continuity in Postgres (§9); never rely on Hermes sessions.
- **Dispatch safety**: worktree isolation, verify-before-commit gate, one-commit-per-task revert story, `agent_tasks` audit.
- **Approval fatigue**: trusting defaults + earned autonomy exist precisely to keep the ask-rate falling over time.
- **Single box**: everything (Hermes, Postgres, backend, dispatch) shares the Beelink; dispatch runs are the only heavy bursts. Acceptable now; note in `docs/deployment.md` that dispatch and whisper transcription may contend.

## 19. Documentation to update as this lands

Per CLAUDE.md's docs-in-same-commit rule: `mcp-contract.md` (every new tool + the notes-tier revision), `CLAUDE.md` (registry conventions become real; dispatch runbook pointer), `docs/deployment.md` (Hermes topology, webhook, env vars, gcal setup), `README.md` (new env vars, scripts), plus the two new docs this plan creates: `docs/agent-dispatch.md` and `docs/hermes/` (skills seed + setup guide).
