# Dispatch runbook (read this first)

You are a **dispatched Claude Code session**, launched by Haven's
`widget_dispatch` via `claude -p` inside a **git worktree** on the Beelink. You
have no memory of prior sessions — this document plus your plan file are your
whole brief. Keep it tight; do exactly the plan, nothing more.

## 1. Where you are

- CWD is a throwaway worktree off `main` at `/var/haven/tasks/<task_id>/wt`. Edit
  freely here; the live checkout is untouched. If your run fails, the worktree is
  discarded — no harm done.
- Your plan is at `/var/haven/tasks/<task_id>/plan.json` (a validated envelope,
  contract §5). **The plan is the contract.** If it's wrong or infeasible, fail
  per §5 below — do not improvise a different change.
- Repo conventions in [`../CLAUDE.md`](../CLAUDE.md) apply. No scope creep
  ("while I'm here…") — that's how widget commits become unreviewable.

## 2. Execute the plan

By `plan.kind`:

- **widget** — create `apps/dashboard/src/lib/widgets/<name>/` with three files,
  using the reference widget [`snow_watch`](../apps/dashboard/src/lib/widgets/snow_watch/)
  as the canonical example:
  - `manifest.json` — name, title, description, refresh (`live`|`static`), size,
    data_sources, surface.
  - `data.ts` — a `load(fetch)` that imports from `$lib/repos/*` (never raw
    `fetch`/SQL in the widget). Add a repo under `src/lib/repos/` if the data
    source doesn't have one yet.
  - `index.svelte` — composes `WidgetFrame` + existing components + design
    tokens. **No bespoke layout, no raw colours/shadows/animation** (e-ink rules
    below). Then add an entry to `apps/dashboard/widgets.json`.
- **automation** — write YAML under `ha/automations/haven/` (see that dir's
  README); one concern per file.
- **fix / feature** — make the minimal change the plan describes.

**Design rules that are binding** (full set in
[`../design/claude-design-brief.md`](../design/claude-design-brief.md) §3): no
animation/transition, no gradient/shadow/semi-transparency, min 2px strokes, min
16px body text, pure `#000` on `#FFF` for text/lines, colour is accent-only via
tokens and never load-bearing. Use CSS variables (`var(--ink)`, `var(--accent-*)`),
never hex.

**Data-layer rules**: prefer the lowest data tier the plan specifies (0 notes →
1 `events.kind` → 2 column → 3 table). Migrations go in
`apps/backend/src/db/migrations/NNNN_name.sql` — **write them, never apply**; the
backend applies squawk-safe ones on rebuild. New `events.kind` values need an
`event_kind_register` MCP call.

## 3. Verify before you commit

All must pass — do not commit if any fails (fail per §5 instead):

```bash
bun run --filter @haven/dashboard check     # svelte-check: 0 errors
bun run --filter @haven/dashboard build     # must build
bun run --filter @haven/backend check       # if you touched the backend
```

If you added a migration, confirm it's additive (squawk will hold anything
unsafe). If you added a backend route, curl it once against the running backend.

## 4. Commit & report

- One commit, message `<verb>: <slug> — <task_id>` (e.g. `widget: snow_watch — task_abc`).
- **Add a top entry to `CHANGELOG.md`** (a `pre-commit` hook blocks the commit
  otherwise) — what the widget does and how Hermes should treat it:
  ```
  ## <YYYY-MM-DD> — widget: <slug>
  **What:** <one line>
  **Hermes:** <e.g. "new wall widget; no tool changes" or the tool it added>
  ```
- Update docs in the **same commit** if you changed behaviour/commands/tools
  (CLAUDE.md rule).
- Call `dashboard_reload(reason="widget:<slug> landed", surface="wall")` via
  HouseholdMCP (configured in `.mcp.json`).
- Write `/var/haven/tasks/<task_id>/result.json`:
  ```json
  { "status": "ok", "commit": "<sha>", "summary": "one line", "follow_ups": [] }
  ```
  The runner reads this + verifies the commit before it fast-forwards `main` and
  pushes. Do **not** push yourself — the runner owns that.

## 5. Failure protocol

If the plan is wrong, infeasible, or verification can't pass:

- Commit nothing.
- Write `result.json` with a precise, re-plannable reason:
  ```json
  { "status": "error", "error": { "code": "invalid_args", "message": "why" } }
  ```
- Exit. The runner marks the task `failed`, discards the worktree, and Hermes
  reports/re-plans from your message. A clean failure is always better than a
  wrong commit.
