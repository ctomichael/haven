import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';
import { notifyReload } from '../reload.ts';

// Row shape from the DB; surfaces a derived `bought` boolean, mirroring the
// backend REST presenter (apps/backend/src/routes/shopping.ts) so agents and
// the phone PWA see identical fields.
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

const RETURNING = sql`
  returning id, name, qty, store, aisle, purchased_at, visibility,
            source_inbox_id, created_at
`;

// ----- shopping_list ---------------------------------------------------

export const shoppingListSchema = {
  bought: z
    .boolean()
    .optional()
    .describe('Filter to bought (true) or still-needed (false); omit for all.'),
  limit: z.number().int().min(1).max(500).default(200),
  actor: ACTOR,
};

export async function shoppingList(args: { bought?: boolean; limit: number }) {
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
  return { items: rows.map(present) };
}

// ----- shopping_add ----------------------------------------------------

export const shoppingAddSchema = {
  name: z.string().min(1).describe('Item name, e.g. "Milk", "Nappies".'),
  qty: z.string().optional().describe('Freeform quantity, e.g. "×6", "2L".'),
  store: z.string().optional().describe('Preferred store, if the item is store-specific.'),
  aisle: z
    .enum(['produce', 'bakery', 'dairy', 'pantry', 'other'])
    .optional()
    .describe('Aisle grouping for the list view; defaults to "other".'),
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  source_inbox_id: z
    .string()
    .uuid()
    .optional()
    .describe('raw_inbox row this item was filed from, if any.'),
  actor: ACTOR,
};

export async function shoppingAdd(args: {
  name: string;
  qty?: string;
  store?: string;
  aisle?: 'produce' | 'bakery' | 'dairy' | 'pantry' | 'other';
  visibility?: 'wall' | 'personal' | 'household';
  source_inbox_id?: string;
}) {
  const inserted = await sql<ShoppingRow[]>`
    insert into shopping_items (name, qty, store, aisle, visibility, source_inbox_id)
    values (
      ${args.name},
      ${args.qty ?? null},
      ${args.store ?? null},
      ${args.aisle ?? 'other'},
      ${args.visibility ?? 'household'},
      ${args.source_inbox_id ?? null}
    )
    ${RETURNING}
  `;
  await notifyReload('shopping_add');
  return present(inserted[0]!);
}

// ----- shopping_update -------------------------------------------------
// Partial update. Marking an item bought is `{ bought: true }` — the item
// stays on the record (with purchased_at set) rather than being removed, so
// history and provenance survive. Only fields present are changed.

export const shoppingUpdateSchema = {
  id: z.string().uuid().describe('shopping_items id'),
  bought: z.boolean().optional().describe('true sets purchased_at=now, false clears it.'),
  name: z.string().min(1).optional(),
  qty: z.string().nullable().optional(),
  store: z.string().nullable().optional(),
  aisle: z.enum(['produce', 'bakery', 'dairy', 'pantry', 'other']).optional(),
  actor: ACTOR,
};

export async function shoppingUpdate(args: {
  id: string;
  bought?: boolean;
  name?: string;
  qty?: string | null;
  store?: string | null;
  aisle?: 'produce' | 'bakery' | 'dairy' | 'pantry' | 'other';
}) {
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = args.name;
  if (args.qty !== undefined) patch.qty = args.qty;
  if (args.store !== undefined) patch.store = args.store;
  if (args.aisle !== undefined) patch.aisle = args.aisle;
  if (args.bought !== undefined) patch.purchased_at = args.bought ? new Date() : null;

  if (Object.keys(patch).length === 0) {
    const err = new Error('shopping_update called with no fields to change');
    (err as { code?: string }).code = 'invalid_args';
    throw err;
  }

  const rows = await sql<ShoppingRow[]>`
    update shopping_items set ${sql(patch)}
    where id = ${args.id}
    ${RETURNING}
  `;
  if (rows.length === 0) {
    const err = new Error(`shopping item ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  await notifyReload('shopping_update');
  return present(rows[0]!);
}
