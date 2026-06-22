# Haven — repo guide for Claude Code

You are operating in the Haven monorepo. Most invocations of you in this repo come from **Hermes Agent dispatching a structured widget plan** — see [`design/mcp-contract.md`](design/mcp-contract.md) §5 for the plan envelope shape.

When you are dispatched with a plan, your job is to land the files described in the plan, register what needs registering, commit with a meaningful message, and trigger `dashboard_reload`. Do not deviate from the plan; if the plan is wrong, fail with `error.code = invalid_args` so Hermes can re-plan.

## Conventions

### Layout

```
apps/
  backend/             Hono on Bun
    src/
      index.ts         Entry point — REST + SSE
      db/              Postgres client, migrator (squawk-linted), CLI
      routes/          (future) One file per route group
      services/        (future) Cross-route logic
  mcp/                 HouseholdMCP server (stdio, @modelcontextprotocol/sdk)
    src/
      index.ts         Tool registry + audit wrapper
      tools/           One file per domain (inbox, events, widgets, users)
      audit.ts         audit_log writer
      smoke-test.ts    `bun run smoke` — spawns server, calls each tool
  dashboard/           SvelteKit PWA
    src/
      routes/          SvelteKit pages
      lib/
        components/    Shared UI components (from the design system)
        widgets/       (future) One folder per widget — see "Adding a widget"
        repos/         (future) Typed query helpers per data domain
        api.ts         Typed client for the backend
ha/
  automations/
    haven/             HA automations owned by Haven — safe to add/remove
design/                Design brief, MCP contract, future ADRs
```

### Adding a widget (when the widget system lands)

A widget is a folder under `apps/dashboard/src/lib/widgets/<slug>/` containing:

- `manifest.json` — widget metadata: name, visibility, surface, size, schedule, data sources
- `index.svelte` — the component (uses tokens from the design system; no bespoke CSS that breaks e-ink rules)
- `data.ts` — calls into `apps/dashboard/src/lib/repos/*` — never raw SQL in the widget

Register the widget in `apps/dashboard/widgets.json` (the global registry the dashboard reads). One commit per widget; commit message format `widget: <slug> — <task_id>` so widgets can be rolled back individually.

### Data layer rules

- Prefer Tier 0 (markdown notes) → Tier 1 (`events.kind`) → Tier 2 (column add) → Tier 2 (new table). See [`design/mcp-contract.md`](design/mcp-contract.md) §5 "data_strategy".
- Migrations go in `apps/backend/src/db/migrations/NNNN_name.sql`. Write the file; **do not apply**. The backend applies safe migrations on rebuild via squawk-lint check.
- New `events.kind` values require an `event_kind_register` MCP call recording the JSON schema for `metadata`.

### HA automations

Write only inside `ha/automations/haven/`. Never modify automations elsewhere in the HA config — they are user-authored.

### Design system

All UI uses tokens from the design system. No raw colours, no shadows, no animation. The eink rules in [`design/claude-design-brief.md`](design/claude-design-brief.md) §3 are binding for the wall surface; the phone surface may use light animation but follows the same token set.

### Commit and reload

- Commit your changes before exiting. Message format: `<verb>: <slug> — <task_id>` (e.g. `widget: bin_day — task_abc123`).
- After commit, call `dashboard_reload(reason="<short>", surface="<wall|phone|all>")` via HouseholdMCP. This SSE-pushes the reload to connected surfaces.

## Development

```bash
bun install
bun run dev          # both apps concurrently
```

Backend at <http://localhost:8080>, dashboard at <http://localhost:5173>. The dashboard proxies `/api/*` to the backend.

For one app at a time:

```bash
bun --filter @haven/backend dev
bun --filter @haven/dashboard dev
```

## When to ask vs act

In this repo, prefer to **act** — the plan envelope you receive is the contract. If anything in the plan conflicts with the rules in this file, the rules win and you should return an error. Don't add scope ("while I'm in here…") beyond the plan; that's how widget commits become unreviewable.
