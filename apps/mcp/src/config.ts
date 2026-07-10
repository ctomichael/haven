// HouseholdMCP — configuration loaded from env.
//
// AGENT_ID identifies the caller in the audit log. Clients (Hermes,
// Claude Code, dashboard-backend, admin-cli) set HAVEN_MCP_AGENT_ID
// when spawning the server, so audit rows accurately reflect who made
// each call. Falls back to 'unknown' to keep development frictionless.

export const AGENT_ID = process.env.HAVEN_MCP_AGENT_ID ?? 'unknown';
export const SERVER_NAME = 'household-mcp';
export const SERVER_VERSION = '0.3.0';

// Some tools proxy to the backend rather than duplicating an integration's
// auth (Google Calendar, Home Assistant). Same box in prod, so localhost.
export const BACKEND_URL = process.env.HAVEN_BACKEND_URL ?? 'http://localhost:8080';

// Widget dispatch (P5): where the repo lives and where per-task working dirs
// (plan.json, worktree, run.log, result.json) go. On the Beelink these are
// /opt/haven and /var/haven/tasks; on the laptop they default to the checkout
// and a scratch dir.
export const REPO_DIR = process.env.HAVEN_REPO_DIR ?? process.cwd();
export const TASKS_DIR = process.env.HAVEN_TASKS_DIR ?? '/tmp/haven-tasks';
// Model for dispatched claude -p runs (sonnet by default; opus for gnarly plans).
export const DISPATCH_MODEL = process.env.HAVEN_DISPATCH_MODEL ?? 'sonnet';
