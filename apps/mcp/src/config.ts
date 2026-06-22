// HouseholdMCP — configuration loaded from env.
//
// AGENT_ID identifies the caller in the audit log. Clients (Hermes,
// Claude Code, dashboard-backend, admin-cli) set HAVEN_MCP_AGENT_ID
// when spawning the server, so audit rows accurately reflect who made
// each call. Falls back to 'unknown' to keep development frictionless.

export const AGENT_ID = process.env.HAVEN_MCP_AGENT_ID ?? 'unknown';
export const SERVER_NAME = 'household-mcp';
export const SERVER_VERSION = '0.1.0';
