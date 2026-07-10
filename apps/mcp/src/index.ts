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
  noteAppend,
  noteAppendSchema,
  noteList,
  noteListSchema,
  noteSearch,
  noteSearchSchema,
} from './tools/notes.ts';
import { searchAll, searchAllSchema } from './tools/search.ts';
import {
  calendarListEvents,
  calendarListEventsSchema,
  calendarEventCreate,
  calendarEventCreateSchema,
  calendarEventUpdate,
  calendarEventUpdateSchema,
} from './tools/calendar.ts';
import {
  briefingPublish,
  briefingPublishSchema,
  briefingResolve,
  briefingResolveSchema,
  briefingList,
  briefingListSchema,
} from './tools/briefings.ts';
import {
  questionAsk,
  questionAskSchema,
  questionGet,
  questionGetSchema,
} from './tools/questions.ts';
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
  todoDelete,
  todoDeleteSchema,
} from './tools/todos.ts';
import {
  approvalIssue,
  approvalIssueSchema,
  approvalReject,
  approvalRejectSchema,
  autonomyPolicyList,
  autonomyPolicyListSchema,
  autonomyPolicySet,
  autonomyPolicySetSchema,
} from './tools/approvals.ts';

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
  'todo_delete',
  'Delete a todo (destructive, floor kind). Requires an approval_token; prefer todo_set_done for completion.',
  todoDeleteSchema,
  withAudit('todo_delete', todoDelete as ToolFn),
);
server.tool(
  'note_append',
  'Store a household fact in the second brain (Tier 0). No action attached — e.g. "Fiona likes daffodils". Optionally subject-tag and link source_inbox_id.',
  noteAppendSchema,
  withAudit('note_append', noteAppend as ToolFn),
);
server.tool(
  'note_list',
  'List notes, optionally filtered by subject tag. Newest first.',
  noteListSchema,
  withAudit('note_list', noteList as ToolFn),
);
server.tool(
  'note_search',
  'Full-text search the second brain by keyword/phrase.',
  noteSearchSchema,
  withAudit('note_search', noteSearch as ToolFn),
);
server.tool(
  'search_all',
  'Cross-tier recall across notes, todos, and inbox. Returns typed refs (note:*, todo:*, inbox:*). "Have we mentioned X before?"',
  searchAllSchema,
  withAudit('search_all', searchAll as ToolFn),
);
server.tool(
  'briefing_publish',
  'Surface something worth attention on the wall/phone (idempotent on dedupe_key). severity info|attention|urgent; re-publishing refreshes and re-surfaces on escalation.',
  briefingPublishSchema,
  withAudit('briefing_publish', briefingPublish as ToolFn),
);
server.tool(
  'briefing_resolve',
  'Mark a briefing no longer true (by dedupe_key) so it drops off the surfaces.',
  briefingResolveSchema,
  withAudit('briefing_resolve', briefingResolve as ToolFn),
);
server.tool(
  'briefing_list',
  'List active briefings (highest severity first). The review job dedupes against this, not memory.',
  briefingListSchema,
  withAudit('briefing_list', briefingList as ToolFn),
);
server.tool(
  'question_ask',
  'Ask the household a question (modal on wall/phone + it can be mirrored to Telegram). context carries what a fresh run needs to resume once answered.',
  questionAskSchema,
  withAudit('question_ask', questionAsk as ToolFn),
);
server.tool(
  'question_get',
  'Get an agent question (and its answer, once given) by id.',
  questionGetSchema,
  withAudit('question_get', questionGet as ToolFn),
);
server.tool(
  'approval_issue',
  'Record household approval of a gated action and mint a single-use, 10-min approval token. Call after the household approves (approve/reject question). Bumps the earned-autonomy streak.',
  approvalIssueSchema,
  withAudit('approval_issue', approvalIssue as ToolFn),
);
server.tool(
  'approval_reject',
  'Record that the household rejected a gated action (resets its earned-autonomy streak).',
  approvalRejectSchema,
  withAudit('approval_reject', approvalReject as ToolFn),
);
server.tool(
  'autonomy_policy_list',
  'List autonomy policy per action_kind (mode, streak, counts, floor, graduatable). The review job reads this to propose graduation.',
  autonomyPolicyListSchema,
  withAudit('autonomy_policy_list', autonomyPolicyList as ToolFn),
);
server.tool(
  'autonomy_policy_set',
  'Set an action_kind to auto or ask. Itself gated (needs an approval_token); floor kinds refuse auto.',
  autonomyPolicySetSchema,
  withAudit('autonomy_policy_set', autonomyPolicySet as ToolFn),
);
server.tool(
  'calendar_list_events',
  'List calendar events in a window (reads the ICS mirror via the backend).',
  calendarListEventsSchema,
  withAudit('calendar_list_events', calendarListEvents as ToolFn),
);
server.tool(
  'calendar_event_create',
  'Create an event on the shared family Google Calendar. Timed (ISO start) or all-day (YYYY-MM-DD). Link source_inbox_id for provenance.',
  calendarEventCreateSchema,
  withAudit('calendar_event_create', calendarEventCreate as ToolFn),
);
server.tool(
  'calendar_event_update',
  'Update an event on the shared family Google Calendar by id. Only fields present change.',
  calendarEventUpdateSchema,
  withAudit('calendar_event_update', calendarEventUpdate as ToolFn),
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
