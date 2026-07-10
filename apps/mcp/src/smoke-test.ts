// Smoke test: spawn HouseholdMCP via stdio, list tools, call a few,
// confirm audit rows land. Run with `bun run smoke` from apps/mcp.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['run', 'src/index.ts'],
  env: {
    ...(process.env as Record<string, string>),
    HAVEN_MCP_AGENT_ID: 'smoke-test',
  },
});

const client = new Client({ name: 'smoke-test-client', version: '0.0.0' });
await client.connect(transport);

console.log('=== listTools ===');
const tools = await client.listTools();
console.log(tools.tools.map((t) => t.name).join(', '));

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
};

const callAndPrint = async (
  name: string,
  args: Record<string, unknown> = {},
) => {
  console.log(`\n=== ${name}(${JSON.stringify(args)}) ===`);
  try {
    const r = (await client.callTool({ name, arguments: args })) as ToolResult;
    const first = r.content[0];
    const text = first && first.type === 'text' ? first.text : undefined;
    if (r.isError) {
      console.log('TOOL ERROR:', text ?? JSON.stringify(r));
      return;
    }
    if (text !== undefined) {
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.log(text);
      }
    } else {
      console.log(JSON.stringify(r, null, 2));
    }
  } catch (e) {
    console.log('TRANSPORT ERROR:', e instanceof Error ? e.message : String(e));
  }
};

// --- Reads --------------------------------------------------------------
await callAndPrint('user_list', { actor: 'smoke-test' });
await callAndPrint('device_list');
await callAndPrint('widget_list');
await callAndPrint('shopping_list', { bought: false, limit: 3 });

// --- Writes -------------------------------------------------------------
await callAndPrint('event_kind_register', {
  kind: 'smoke_test_event',
  description: 'Synthetic event written by the MCP smoke test.',
  schema_json: { type: 'object', properties: { note: { type: 'string' } } },
  actor: 'smoke-test',
});

const appendResult = (await client.callTool({
  name: 'inbox_append',
  arguments: {
    source: 'smoke-test',
    raw_text: 'Reminder: buy milk on the way home',
    metadata: { lang: 'en' },
    actor: 'smoke-test',
  },
})) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
const firstC = appendResult.content[0];
const appendedRaw = firstC && firstC.type === 'text' ? firstC.text : undefined;
const appended = appendedRaw ? (JSON.parse(appendedRaw) as { id: string; ts: string }) : null;
console.log('\n=== inbox_append → ===');
console.log(appended);

await callAndPrint('event_log', {
  kind: 'smoke_test_event',
  metadata: { note: 'from smoke test' },
  source_inbox_id: appended?.id,
  actor: 'smoke-test',
});

// --- Todos: create → complete → list ------------------------------------
const todoResult = (await client.callTool({
  name: 'todo_create',
  arguments: {
    title: 'Smoke-test todo: water the plants',
    tags: ['home'],
    assignee: 'michael',
    actor: 'smoke-test',
  },
})) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
const todoC = todoResult.content[0];
const todoRaw = todoC && todoC.type === 'text' ? todoC.text : undefined;
const todo = todoRaw ? (JSON.parse(todoRaw) as { id: string }) : null;
console.log('\n=== todo_create → ===');
console.log(todo);

if (todo) {
  await callAndPrint('todo_update', {
    id: todo.id,
    due_at: '2026-07-23T09:00:00Z',
    notes: 'set by smoke test',
    actor: 'smoke-test',
  });
  await callAndPrint('todo_set_done', { id: todo.id, done: true, actor: 'smoke-test' });
}

// --- Shopping: add → mark bought ----------------------------------------
const shopResult = (await client.callTool({
  name: 'shopping_add',
  arguments: {
    name: 'Smoke-test milk',
    qty: '2L',
    aisle: 'dairy',
    source_inbox_id: appended?.id,
    actor: 'smoke-test',
  },
})) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
const shopC = shopResult.content[0];
const shopRaw = shopC && shopC.type === 'text' ? shopC.text : undefined;
const shopItem = shopRaw ? (JSON.parse(shopRaw) as { id: string }) : null;
console.log('\n=== shopping_add → ===');
console.log(shopItem);
if (shopItem) {
  await callAndPrint('shopping_update', { id: shopItem.id, bought: true, actor: 'smoke-test' });
}

// --- Inbox filing: claim → file with provenance refs --------------------
if (appended) {
  await callAndPrint('inbox_set_status', {
    id: appended.id,
    status: 'processing',
    expect: 'pending',
    actor: 'smoke-test',
  });
  await callAndPrint('inbox_file', {
    id: appended.id,
    refs: [todo ? `todo:${todo.id}` : 'todo:none', shopItem ? `shopping:${shopItem.id}` : 'shopping:none'],
    status: 'filed',
    actor: 'smoke-test',
  });
}

// --- Notes (second brain): append → search → cross-tier search ----------
await callAndPrint('note_append', {
  body: 'Fiona really likes daffodils',
  subject: 'person:fiona',
  source_inbox_id: appended?.id,
  actor: 'smoke-test',
});
await callAndPrint('note_search', { query: 'daffodils', limit: 3 });
await callAndPrint('search_all', { query: 'daffodils', limit: 5 });

// --- Briefings + questions (conversation surfaces) ----------------------
await callAndPrint('briefing_publish', {
  dedupe_key: todo ? `todo-due:${todo.id}` : 'smoke-briefing',
  title: 'Carpet decision due in 3 days',
  body: 'Pick the new house carpet by 23 Jul.',
  severity: 'attention',
  source_refs: todo ? [`todo:${todo.id}`] : [],
  actor: 'smoke-test',
});
await callAndPrint('briefing_list', { limit: 5 });
await callAndPrint('question_ask', {
  question: 'Which carpet sample did we prefer — the wool or the loop pile?',
  options: ['Wool', 'Loop pile'],
  context: { resume: 'household-intake', inbox_id: appended?.id },
  target_surface: 'all',
  actor: 'smoke-test',
});

// --- Verify the writes landed -------------------------------------------
await callAndPrint('inbox_list', { limit: 3 });
await callAndPrint('event_kinds_list');
await callAndPrint('todo_list', { limit: 3 });

await client.close();
process.exit(0);
