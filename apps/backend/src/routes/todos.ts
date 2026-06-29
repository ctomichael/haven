import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';
import { notifyReload } from '../events.ts';

const todos = new Hono();

// Row shape from the DB; the API surfaces a derived `done` boolean.
type TodoRow = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  done_at: string | null;
  assignee_user_id: string | null;
  visibility: string;
  tags: string[];
  source_inbox_id: string | null;
  created_at: string;
  updated_at: string;
};

function present(r: TodoRow) {
  return { ...r, done: r.done_at !== null };
}

// ----- GET /api/todos --------------------------------------------------

const ListQuery = z.object({
  done: z
    .union([z.enum(['true', 'false']), z.boolean()])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

todos.get('/', zValidator('query', ListQuery), async (c) => {
  const args = c.req.valid('query');
  const filterDone = args.done;
  const rows = await sql<TodoRow[]>`
    select id, title, notes, due_at, done_at, assignee_user_id, visibility,
           tags, source_inbox_id, created_at, updated_at
    from todos
    where (
      ${filterDone === undefined}::boolean
      or (${filterDone ?? false}::boolean = (done_at is not null))
    )
    order by done_at nulls first, due_at nulls last, created_at desc
    limit ${args.limit}
  `;
  void audit({ tool: 'todo_list', args, actor: undefined, resultStatus: 'ok' });
  return c.json({ todos: rows.map(present) });
});

// ----- POST /api/todos -------------------------------------------------

const CreateBody = z.object({
  title: z.string().min(1),
  due_at: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  assignee: z.string().optional(),
});

todos.post('/', zValidator('json', CreateBody), async (c) => {
  const args = c.req.valid('json');
  let status: 'ok' | 'error' = 'ok';
  let errorDetail: unknown = null;
  try {
    let assigneeId: string | null = null;
    if (args.assignee) {
      const [u] = await sql<{ id: string }[]>`
        select id from users where handle = ${args.assignee}
      `;
      assigneeId = u?.id ?? null;
    }
    const inserted = await sql<TodoRow[]>`
      insert into todos (title, due_at, tags, visibility, assignee_user_id)
      values (
        ${args.title},
        ${args.due_at ?? null},
        ${(args.tags ?? []) as unknown as string[]},
        ${args.visibility ?? 'household'},
        ${assigneeId}
      )
      returning id, title, notes, due_at, done_at, assignee_user_id, visibility,
                tags, source_inbox_id, created_at, updated_at
    `;
    await notifyReload({ reason: 'todo_create' });
    return c.json(present(inserted[0]!), 201);
  } catch (e) {
    status = 'error';
    errorDetail = { error: e instanceof Error ? e.message : String(e) };
    return c.json({ error: 'internal' }, 500);
  } finally {
    void audit({
      tool: 'todo_create',
      args,
      actor: args.assignee,
      resultStatus: status,
      details: status === 'error' ? errorDetail : null,
    });
  }
});

// ----- PATCH /api/todos/:id --------------------------------------------

const IdParam = z.object({ id: z.string().uuid() });
const PatchBody = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).optional(),
  due_at: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

todos.patch(
  '/:id',
  zValidator('param', IdParam),
  zValidator('json', PatchBody),
  async (c) => {
    const { id } = c.req.valid('param');
    const args = c.req.valid('json');
    let status: 'ok' | 'error' = 'ok';
    let errorDetail: unknown = null;
    try {
      // Build the patch object the postgres lib can spread into SET.
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (args.title !== undefined) patch.title = args.title;
      if (args.due_at !== undefined) patch.due_at = args.due_at;
      if (args.tags !== undefined) patch.tags = args.tags;
      if (args.done !== undefined) patch.done_at = args.done ? new Date() : null;

      const rows = await sql<TodoRow[]>`
        update todos set ${sql(patch)}
        where id = ${id}
        returning id, title, notes, due_at, done_at, assignee_user_id, visibility,
                  tags, source_inbox_id, created_at, updated_at
      `;
      if (rows.length === 0) {
        status = 'error';
        errorDetail = { error: 'not_found' };
        return c.json({ error: 'not_found' }, 404);
      }
      await notifyReload({ reason: 'todo_update' });
      return c.json(present(rows[0]!));
    } catch (e) {
      status = 'error';
      errorDetail = { error: e instanceof Error ? e.message : String(e) };
      return c.json({ error: 'internal' }, 500);
    } finally {
      void audit({
        tool: 'todo_update',
        args: { id, ...args },
        actor: undefined,
        resultStatus: status,
        details: status === 'error' ? errorDetail : null,
      });
    }
  },
);

// ----- DELETE /api/todos/:id -------------------------------------------

todos.delete('/:id', zValidator('param', IdParam), async (c) => {
  const { id } = c.req.valid('param');
  try {
    const rows = await sql`delete from todos where id = ${id} returning id`;
    if (rows.length === 0) {
      void audit({
        tool: 'todo_delete',
        args: { id },
        actor: undefined,
        resultStatus: 'error',
        details: { error: 'not_found' },
      });
      return c.json({ error: 'not_found' }, 404);
    }
    void audit({
      tool: 'todo_delete',
      args: { id },
      actor: undefined,
      resultStatus: 'ok',
    });
    return c.json({ ok: true });
  } catch (e) {
    const detail = { error: e instanceof Error ? e.message : String(e) };
    void audit({
      tool: 'todo_delete',
      args: { id },
      actor: undefined,
      resultStatus: 'error',
      details: detail,
    });
    return c.json({ error: 'internal' }, 500);
  }
});

export default todos;
