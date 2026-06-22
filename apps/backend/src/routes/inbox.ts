import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';
import { asJson } from '../db/jsonb.ts';

const inbox = new Hono();

// Resolve user / device handles → ids. Mirrors apps/mcp/src/tools/inbox.ts
// — extract when a third caller appears.

async function resolveUserId(handle: string | undefined): Promise<string | null> {
  if (!handle) return null;
  const [u] = await sql<{ id: string }[]>`
    select id from users where handle = ${handle}
  `;
  return u?.id ?? null;
}

async function resolveDeviceId(handle: string | undefined): Promise<string | null> {
  if (!handle) return null;
  const [d] = await sql<{ id: string }[]>`
    select id from devices where handle = ${handle}
  `;
  return d?.id ?? null;
}

// ----- POST /api/inbox -------------------------------------------------
// Mirrors the MCP `inbox_append` tool at the REST layer so the phone PWA
// (and any other capture surface) can post without speaking MCP.
//
// TODO: auth. v0 has no auth — anyone reaching the LAN backend can post.
// Add Authelia / device tokens before exposing beyond the home network.

const AppendBody = z.object({
  source: z
    .string()
    .min(1)
    .describe("Where the capture came from — 'phone', 'wall', 'ha_voice', etc."),
  raw_text: z.string().min(1),
  audio_url: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  device: z.string().optional(),
  actor: z.string().optional(),
});

inbox.post('/', zValidator('json', AppendBody), async (c) => {
  const args = c.req.valid('json');
  let status: 'ok' | 'error' = 'ok';
  let errorDetail: unknown = null;
  try {
    const [actor_user_id, device_id] = await Promise.all([
      resolveUserId(args.actor),
      resolveDeviceId(args.device),
    ]);
    const [row] = await sql<{ id: string; ts: string }[]>`
      insert into raw_inbox (source, raw_text, audio_url, metadata, actor_user_id, device_id)
      values (
        ${args.source},
        ${args.raw_text},
        ${args.audio_url ?? null},
        ${asJson(args.metadata ?? {})},
        ${actor_user_id},
        ${device_id}
      )
      returning id, ts
    `;
    return c.json(row, 201);
  } catch (e) {
    status = 'error';
    errorDetail = { error: e instanceof Error ? e.message : String(e) };
    return c.json({ error: 'internal' }, 500);
  } finally {
    void audit({
      tool: 'inbox_append',
      args,
      actor: args.actor,
      resultStatus: status,
      details: status === 'error' ? errorDetail : null,
    });
  }
});

// ----- GET /api/inbox --------------------------------------------------

const ListQuery = z.object({
  status: z.enum(['pending', 'filed', 'ignored']).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

inbox.get('/', zValidator('query', ListQuery), async (c) => {
  const args = c.req.valid('query');
  const rows = await sql`
    select id, ts, source, raw_text, audio_url, metadata, status, filed_refs,
           actor_user_id, device_id
    from raw_inbox
    where (${args.status ?? null}::text is null or status = ${args.status ?? null})
      and (${args.since ?? null}::timestamptz is null or ts >= ${args.since ?? null}::timestamptz)
    order by ts desc
    limit ${args.limit}
  `;
  void audit({
    tool: 'inbox_list',
    args,
    actor: undefined,
    resultStatus: 'ok',
  });
  return c.json({ rows });
});

// ----- GET /api/inbox/:id ----------------------------------------------

const IdParam = z.object({ id: z.string().uuid() });

inbox.get('/:id', zValidator('param', IdParam), async (c) => {
  const { id } = c.req.valid('param');
  const [row] = await sql`
    select id, ts, source, raw_text, audio_url, metadata, status, filed_refs,
           actor_user_id, device_id
    from raw_inbox
    where id = ${id}
  `;
  if (!row) {
    void audit({
      tool: 'inbox_get',
      args: { id },
      actor: undefined,
      resultStatus: 'error',
      details: { error: 'not_found' },
    });
    return c.json({ error: 'not_found' }, 404);
  }
  void audit({
    tool: 'inbox_get',
    args: { id },
    actor: undefined,
    resultStatus: 'ok',
  });
  return c.json(row);
});

export default inbox;
