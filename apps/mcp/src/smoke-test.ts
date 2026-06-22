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

await callAndPrint('user_list', { actor: 'smoke-test' });
await callAndPrint('device_list');
await callAndPrint('event_kinds_list');
await callAndPrint('widget_list');
await callAndPrint('inbox_list', { limit: 5 });
await callAndPrint('inbox_get', {
  id: '00000000-0000-0000-0000-000000000000',
});

await client.close();
process.exit(0);
