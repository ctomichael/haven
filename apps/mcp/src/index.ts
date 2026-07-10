import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { AGENT_ID, SERVER_NAME, SERVER_VERSION } from './config.ts';
import { audit } from './audit.ts';
import { sql } from './client.ts';

import {
  inboxAppend,
  inboxAppendSchema,
  inboxGet,
  inboxGetSchema,
  inboxList,
  inboxListSchema,
  inboxSetStatus,
  inboxSetStatusSchema,
  inboxFile,
  inboxFileSchema,
} from './tools/inbox.ts';
import {
  shoppingList,
  shoppingListSchema,
  shoppingAdd,
  shoppingAddSchema,
  shoppingUpdate,
  shoppingUpdateSchema,
} from './tools/shopping.ts';
import { dashboardReload, dashboardReloadSchema } from './tools/dashboard.ts';
import {
  eventKindRegister,
  eventKindRegisterSchema,
  eventKindsList,
  eventKindsListSchema,
  eventLog,
  eventLogSchema,
} from './tools/events.ts';
import {
  widgetList,
  widgetListSchema,
  widgetGet,
  widgetGetSchema,
} from './tools/widgets.ts';
import { userList, userListSchema, deviceList, deviceListSchema } from './tools/users.ts';
import {
  todoList,
  todoListSchema,
  todoCreate,
  todoCreateSchema,
  todoSetDone,
  todoSetDoneSchema,
  todoUpdate,
  todoUpdateSchema,
} from './tools/todos.ts';

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

// --- Tool surface (v0.3) --------------------------------------------
// Reads + write_low writes (inbox_*, todo_*, shopping_*, event_*,
// dashboard_reload) auto-execute without an approval token. write_med +
// destructive tools (todo_delete, calendar_event_delete, ha_entity_call_service,
// ha_automation_*, widget_dispatch, etc.) require the approval-token flow
// from MCP contract §7 — landed in Phase 4 (approvals + autonomy).

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
  'inbox_append',
  'Append a new capture to raw_inbox. Resolves actor + device handles to ids.',
  inboxAppendSchema,
  withAudit('inbox_append', inboxAppend as ToolFn),
);
server.tool(
  'inbox_set_status',
  'Move a raw_inbox item through its lifecycle (pending → processing → filed/ignored). Pass `expect` to claim optimistically without clobbering a concurrent run.',
  inboxSetStatusSchema,
  withAudit('inbox_set_status', inboxSetStatus as ToolFn),
);
server.tool(
  'inbox_file',
  'Close out a raw_inbox item: append the typed entity refs it produced (todo:*, shopping:*, gcal:*, note:*) and mark it filed/ignored.',
  inboxFileSchema,
  withAudit('inbox_file', inboxFile as ToolFn),
);
server.tool(
  'shopping_list',
  'List shopping_items with an optional bought filter. Still-needed items first.',
  shoppingListSchema,
  withAudit('shopping_list', shoppingList as ToolFn),
);
server.tool(
  'shopping_add',
  'Add an item to the shopping list; optionally link the source_inbox_id it was filed from.',
  shoppingAddSchema,
  withAudit('shopping_add', shoppingAdd as ToolFn),
);
server.tool(
  'shopping_update',
  'Update a shopping item. Marking bought sets purchased_at (item is kept, not removed).',
  shoppingUpdateSchema,
  withAudit('shopping_update', shoppingUpdate as ToolFn),
);
server.tool(
  'todo_list',
  'List todos with an optional done filter. Newest-open-first ordering.',
  todoListSchema,
  withAudit('todo_list', todoList as ToolFn),
);
server.tool(
  'todo_create',
  'Create a todo. Resolves the assignee handle to a user id; optionally links the source_inbox_id it was filed from.',
  todoCreateSchema,
  withAudit('todo_create', todoCreate as ToolFn),
);
server.tool(
  'todo_set_done',
  'Mark a todo done or re-open it by id.',
  todoSetDoneSchema,
  withAudit('todo_set_done', todoSetDone as ToolFn),
);
server.tool(
  'todo_update',
  'Partially update a todo (title, notes, due_at, tags, visibility, assignee). Only fields present change; pass null to clear a nullable field.',
  todoUpdateSchema,
  withAudit('todo_update', todoUpdate as ToolFn),
);
server.tool(
  'event_kinds_list',
  'List registered event kinds with their schemas, owning widget, and current counts.',
  eventKindsListSchema,
  withAudit('event_kinds_list', eventKindsList as ToolFn),
);
server.tool(
  'event_kind_register',
  'Register or update an event kind (idempotent on kind slug).',
  eventKindRegisterSchema,
  withAudit('event_kind_register', eventKindRegister as ToolFn),
);
server.tool(
  'event_log',
  'Log a household event of a given kind.',
  eventLogSchema,
  withAudit('event_log', eventLog as ToolFn),
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
  'dashboard_reload',
  'Push an SSE refresh to connected surfaces. Call after landing a widget or a batch of file/registry changes.',
  dashboardReloadSchema,
  withAudit('dashboard_reload', dashboardReload as ToolFn),
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
