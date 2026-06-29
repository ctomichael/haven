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
  await callAndPrint('todo_set_done', { id: todo.id, done: true, actor: 'smoke-test' });
}

// --- Verify the writes landed -------------------------------------------
await callAndPrint('inbox_list', { limit: 3 });
await callAndPrint('event_kinds_list');
await callAndPrint('todo_list', { limit: 3 });

await client.close();
process.exit(0);
