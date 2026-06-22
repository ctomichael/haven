# Haven

A custom household dashboard and family second-brain.

- **Wall**: Boox Note Air 5 C — kiosk-mode web app, e-ink optimised
- **Phone**: same app as a PWA, primary capture surface
- **Backend**: Hono on Bun, runs on the Beelink Ubuntu VM in prod
- **Agent**: Hermes Agent (Nous Research) dispatching Claude Code to extend the dashboard in plain language

See [`design/`](design/) for the design system brief and the MCP contract.

## Layout

```
apps/
  backend/      Hono on Bun — REST + SSE, runs DB migrations
  dashboard/    SvelteKit PWA — eink-first wall layout + phone breakpoint
  mcp/          HouseholdMCP server (stdio) — tool surface for Hermes + Claude Code
design/
  claude-design-brief.md   Brief handed to Claude Design for the visual system
  mcp-contract.md          HouseholdMCP tool surface + settled conventions
```

Workspaces are managed by Bun. Bun runs both apps in parallel via `bun --filter`.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (`brew install bun`)
- Node 20+ only needed if you fall back to npm/pnpm; Bun is the supported path

## Quick start

```bash
bun install
bun run dev
```

This starts both apps:

- Backend: <http://localhost:8080>
  - Health: `GET /api/health`
  - SSE: `GET /api/events`
- Dashboard: <http://localhost:5173>

The dashboard Vite dev server proxies `/api/*` to the backend, so both run on first-party origins for the browser.

## Scripts (root)

| Command | What |
|---|---|
| `bun install` | Install all workspace deps |
| `bun run dev` | Run backend + dashboard concurrently (MCP is stdio, not part of dev) |
| `bun run build` | Build all apps |
| `bun run check` | Type-check all apps |
| `bun run mcp` | Start the HouseholdMCP server on stdio (usually launched by clients) |
| `bun run clean` | Wipe build artifacts and node_modules |

## MCP server (apps/mcp)

HouseholdMCP runs over stdio — clients (Hermes, Claude Code) spawn it as a
subprocess with `HAVEN_MCP_AGENT_ID` set for audit attribution. To exercise
the v0.1 read-only tool surface end-to-end:

```bash
make db-up
bun --filter @haven/mcp run smoke
```

That spawns the server, lists tools, calls each, and confirms audit_log
rows land in Postgres. See [`design/mcp-contract.md`](design/mcp-contract.md)
for the full tool catalogue and the plan envelope contract.

## Status

This is the v0 scaffold — no DB, no auth, no widgets yet. The wiring proves frontend ↔ backend round-trip works (REST + SSE).
