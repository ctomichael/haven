import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';

const shopping = new Hono();

type ShoppingRow = {
  id: string;
  name: string;
  qty: string | null;
  store: string | null;
  aisle: string | null;
  purchased_at: string | null;
  visibility: string;
  source_inbox_id: string | null;
  created_at: string;
};

function present(r: ShoppingRow) {
  return { ...r, bought: r.purchased_at !== null };
}

// ----- GET /api/shopping -----------------------------------------------

const ListQuery = z.object({
  bought: z
    .union([z.enum(['true', 'false']), z.boolean()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

shopping.get('/', zValidator('query', ListQuery), async (c) => {
  const args = c.req.valid('query');
  const filterBought = args.bought;
  const rows = await sql<ShoppingRow[]>`
    select id, name, qty, store, aisle, purchased_at, visibility,
           source_inbox_id, created_at
    from shopping_items
    where (
      ${filterBought === undefined}::boolean
      or (${filterBought ?? false}::boolean = (purchased_at is not null))
    )
    order by purchased_at nulls first, created_at desc
    limit ${args.limit}
  `;
  void audit({
    tool: 'shopping_list',
    args,
    actor: undefined,
    resultStatus: 'ok',
  });
  return c.json({ items: rows.map(present) });
});

// ----- POST /api/shopping ----------------------------------------------

const CreateBody = z.object({
  name: z.string().min(1),
  qty: z.string().optional(),
  store: z.string().optional(),
  aisle: z.string().optional(),
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
});

shopping.post('/', zValidator('json', CreateBody), async (c) => {
  const args = c.req.valid('json');
  let status: 'ok' | 'error' = 'ok';
  let errorDetail: unknown = null;
  try {
    const inserted = await sql<ShoppingRow[]>`
      insert into shopping_items (name, qty, store, aisle, visibility)
      values (
        ${args.name},
        ${args.qty ?? null},
        ${args.store ?? null},
        ${args.aisle ?? null},
        ${args.visibility ?? 'household'}
      )
      returning id, name, qty, store, aisle, purchased_at, visibility,
                source_inbox_id, created_at
    `;
    return c.json(present(inserted[0]!), 201);
  } catch (e) {
    status = 'error';
    errorDetail = { error: e instanceof Error ? e.message : String(e) };
    return c.json({ error: 'internal' }, 500);
  } finally {
    void audit({
      tool: 'shopping_create',
      args,
      actor: undefined,
      resultStatus: status,
      details: status === 'error' ? errorDetail : null,
    });
  }
});

// ----- PATCH /api/shopping/:id -----------------------------------------

const IdParam = z.object({ id: z.string().uuid() });
const PatchBody = z.object({
  bought: z.boolean().optional(),
  name: z.string().min(1).optional(),
  qty: z.string().nullable().optional(),
  store: z.string().nullable().optional(),
  aisle: z.string().nullable().optional(),
});

shopping.patch(
  '/:id',
  zValidator('param', IdParam),
  zValidator('json', PatchBody),
  async (c) => {
    const { id } = c.req.valid('param');
    const args = c.req.valid('json');
    let status: 'ok' | 'error' = 'ok';
    let errorDetail: unknown = null;
    try {
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.qty !== undefined) patch.qty = args.qty;
      if (args.store !== undefined) patch.store = args.store;
      if (args.aisle !== undefined) patch.aisle = args.aisle;
      if (args.bought !== undefined)
        patch.purchased_at = args.bought ? new Date() : null;

      if (Object.keys(patch).length === 0) {
        return c.json({ ok: true });
      }

      const rows = await sql<ShoppingRow[]>`
        update shopping_items set ${sql(patch)}
        where id = ${id}
        returning id, name, qty, store, aisle, purchased_at, visibility,
                  source_inbox_id, created_at
      `;
      if (rows.length === 0) {
        status = 'error';
        errorDetail = { error: 'not_found' };
        return c.json({ error: 'not_found' }, 404);
      }
      return c.json(present(rows[0]!));
    } catch (e) {
      status = 'error';
      errorDetail = { error: e instanceof Error ? e.message : String(e) };
      return c.json({ error: 'internal' }, 500);
    } finally {
      void audit({
        tool: 'shopping_update',
        args: { id, ...args },
        actor: undefined,
        resultStatus: status,
        details: status === 'error' ? errorDetail : null,
      });
    }
  },
);

// ----- DELETE /api/shopping/:id ----------------------------------------

shopping.delete('/:id', zValidator('param', IdParam), async (c) => {
  const { id } = c.req.valid('param');
  try {
    const rows = await sql`delete from shopping_items where id = ${id} returning id`;
    const ok = rows.length > 0;
    void audit({
      tool: 'shopping_delete',
      args: { id },
      actor: undefined,
      resultStatus: ok ? 'ok' : 'error',
      details: ok ? null : { error: 'not_found' },
    });
    return c.json(ok ? { ok: true } : { error: 'not_found' }, ok ? 200 : 404);
  } catch (e) {
    const detail = { error: e instanceof Error ? e.message : String(e) };
    void audit({
      tool: 'shopping_delete',
      args: { id },
      actor: undefined,
      resultStatus: 'error',
      details: detail,
    });
    return c.json({ error: 'internal' }, 500);
  }
});

export default shopping;
