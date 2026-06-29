# Haven

A custom household dashboard and family second-brain.

- **Wall**: Boox Note Air 5 C — kiosk-mode web app, e-ink optimised
- **Phone**: same app as a PWA, primary capture surface
- **Backend**: Hono on Bun, runs on the Beelink Ubuntu VM in prod
- **Agent**: Hermes Agent (Nous Research) dispatching Claude Code to extend the dashboard in plain language

See [`design/`](design/) for the design system brief and the MCP contract.

> **Where are you running this?**
>
> - **Beelink (production VM)** → use `sudo ./infra/install.sh` then `sudo make deploy` for updates. **Do not run `bun run dev`** — that's the hot-reload watcher and won't survive a logout. Full guide: [`docs/deployment.md`](docs/deployment.md).
> - **Laptop (development)** → the "Quick start" below is what you want.

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

Workspaces are managed by Bun. Bun runs both apps in parallel via `bun run --filter`.

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
bun run --filter @haven/mcp smoke
```

That spawns the server, lists tools, calls each, and confirms audit_log
rows land in Postgres. See [`design/mcp-contract.md`](design/mcp-contract.md)
for the full tool catalogue and the plan envelope contract.

## Production (Beelink Ubuntu VM)

See [`docs/deployment.md`](docs/deployment.md) for the full topology.
TL;DR for first install on a fresh box:

```bash
sudo git clone git@github.com:ctomichael/haven.git /opt/haven
cd /opt/haven
sudo ./infra/install.sh        # ~3–5 min on first run
sudoedit /etc/haven/.env       # set CADDY_DOMAIN, CF_API_TOKEN, etc.
sudo systemctl restart haven-backend haven-dashboard caddy
```

Production runs **all three services under systemd** (`haven-backend`,
`haven-dashboard`, `haven-autopull.timer`), with Postgres in a Docker
container and Caddy as the TLS edge. Updates pull every 4h via
`haven-autopull.timer`, or `sudo make deploy` for immediate.
