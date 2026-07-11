import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';
import { asJson } from '../db/jsonb.ts';
import { notifyReload } from '../events.ts';
import { notifyHermes, type InboxPush } from '../services/hermes.ts';

const inbox = new Hono();

// raw_inbox lifecycle. Kept in sync with apps/mcp/src/tools/inbox.ts
// INBOX_STATUSES — 'processing' is the transient claim the intake pipeline
// sets so a concurrent sweeper skips an in-flight item.
const INBOX_STATUSES = ['pending', 'processing', 'filed', 'ignored'] as const;

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
    // Respond first; the note is saved. Then fire the Hermes webhook as a
    // detached background task — a slow/failed/absent webhook must never block
    // or break ingestion (notifyHermes catches everything and times out).
    //
    // We deliberately do NOT push a dashboard:reload here. The capture surface
    // navigates home on its own and re-fetches; broadcasting a reload to every
    // surface on each capture used to strand the saver's own post-save
    // navigation (SSE → invalidateAll racing goto), hanging the "Saving…" state.
    const push: InboxPush = {
      type: 'inbox.new',
      inbox_id: row!.id,
      ts: row!.ts,
      source: args.source,
      raw_text: args.raw_text,
      actor: args.actor,
      device: args.device,
    };
    queueMicrotask(() => void notifyHermes(push));
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
  status: z.enum(INBOX_STATUSES).optional(),
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

// ----- PATCH /api/inbox/:id --------------------------------------------
// Lets a surface (or user) file/ignore a captured item and record the refs
// it produced. Mirrors the MCP inbox_set_status / inbox_file tools so the
// dashboard inbox screen can act without speaking MCP.

const PatchBody = z.object({
  status: z.enum(INBOX_STATUSES).optional(),
  refs: z.array(z.string()).optional(),
});

inbox.patch(
  '/:id',
  zValidator('param', IdParam),
  zValidator('json', PatchBody),
  async (c) => {
    const { id } = c.req.valid('param');
    const args = c.req.valid('json');
    let status: 'ok' | 'error' = 'ok';
    let errorDetail: unknown = null;
    try {
      if (args.status === undefined && args.refs === undefined) {
        return c.json({ error: 'nothing to update' }, 400);
      }
      const rows = await sql<{ id: string; status: string; filed_refs: unknown }[]>`
        update raw_inbox
        set status = coalesce(${args.status ?? null}, status),
            filed_refs = filed_refs || ${asJson(args.refs ?? [])}
        where id = ${id}
        returning id, status, filed_refs
      `;
      if (rows.length === 0) {
        status = 'error';
        errorDetail = { error: 'not_found' };
        return c.json({ error: 'not_found' }, 404);
      }
      void notifyReload({ reason: 'inbox_update', surface: 'all' });
      return c.json(rows[0]);
    } catch (e) {
      status = 'error';
      errorDetail = { error: e instanceof Error ? e.message : String(e) };
      return c.json({ error: 'internal' }, 500);
    } finally {
      void audit({
        tool: 'inbox_set_status',
        args: { id, ...args },
        actor: undefined,
        resultStatus: status,
        details: status === 'error' ? errorDetail : null,
      });
    }
  },
);

export default inbox;
