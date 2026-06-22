import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { AGENT_ID, SERVER_NAME, SERVER_VERSION } from './config.ts';
import { audit } from './audit.ts';
import { sql } from './client.ts';

import { inboxList, inboxListSchema, inboxGet, inboxGetSchema } from './tools/inbox.ts';
import { eventKindsList, eventKindsListSchema } from './tools/events.ts';
import {
  widgetList,
  widgetListSchema,
  widgetGet,
  widgetGetSchema,
} from './tools/widgets.ts';
import { userList, userListSchema, deviceList, deviceListSchema } from './tools/users.ts';

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// Wrap a tool handler so every invocation is captured in audit_log. The
// audit write is fire-and-forget — it never blocks or breaks the call.
//
// Schema validation (zod) happens in the MCP SDK before the handler is
// invoked, so we accept loose typing here and let each tool function
// keep its own precise signature.
type ToolFn = (args: Record<string, unknown>) => Promise<unknown>;

function withAudit(toolName: string, handler: ToolFn) {
  return async (input: Record<string, unknown>) => {
    const { actor, ...rest } = input as { actor?: string } & Record<string, unknown>;
    let status: 'ok' | 'error' = 'ok';
    let outcome: unknown = null;
    try {
      const result = await handler(input);
      outcome = result;
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (e) {
      status = 'error';
      outcome = { error: e instanceof Error ? e.message : String(e) };
      throw e;
    } finally {
      void audit({
        tool: toolName,
        args: rest,
        actor,
        resultStatus: status,
        details: status === 'error' ? outcome : null,
      });
    }
  };
}

// --- Read-only tool surface (v0.1) ----------------------------------
// Write-side tools (inbox_append, todo_create, event_log, widget_dispatch,
// etc.) come next once Hermes is wired in and we have the approval-token
// flow specified in the MCP contract §7.

server.tool(
  'inbox_list',
  'List raw_inbox rows with optional status + since filters.',
  inboxListSchema,
  withAudit('inbox_list', inboxList as ToolFn),
);
server.tool(
  'inbox_get',
  'Get a single raw_inbox row by id.',
  inboxGetSchema,
  withAudit('inbox_get', inboxGet as ToolFn),
);
server.tool(
  'event_kinds_list',
  'List registered event kinds with their schemas, owning widget, and current counts.',
  eventKindsListSchema,
  withAudit('event_kinds_list', eventKindsList as ToolFn),
);
server.tool(
  'widget_list',
  'List registered widgets, optionally filtered by visibility.',
  widgetListSchema,
  withAudit('widget_list', widgetList as ToolFn),
);
server.tool(
  'widget_get',
  'Get a widget manifest + metadata by name.',
  widgetGetSchema,
  withAudit('widget_get', widgetGet as ToolFn),
);
server.tool(
  'user_list',
  'List household users.',
  userListSchema,
  withAudit('user_list', userList as ToolFn),
);
server.tool(
  'device_list',
  'List devices and the users they belong to.',
  deviceListSchema,
  withAudit('device_list', deviceList as ToolFn),
);

async function shutdown(): Promise<void> {
  try {
    await sql.end({ timeout: 5 });
  } catch {
    /* swallow */
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// stdout is owned by the MCP transport — log to stderr instead.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[household-mcp] ${SERVER_NAME}@${SERVER_VERSION} ready (agent_id=${AGENT_ID})`,
);
