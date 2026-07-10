import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';
import { notifyReload } from '../reload.ts';
import { resolveUserId } from './inbox.ts';

// Row shape from the DB; the tool surfaces a derived `done` boolean,
// mirroring the backend REST presenter so agents see the same fields.
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

const RETURNING = sql`
  returning id, title, notes, due_at, done_at, assignee_user_id, visibility,
            tags, source_inbox_id, created_at, updated_at
`;

// ----- todo_list -------------------------------------------------------

export const todoListSchema = {
  done: z
    .boolean()
    .optional()
    .describe('Filter to done (true) or open (false) todos; omit for all.'),
  limit: z.number().int().min(1).max(500).default(200),
  actor: ACTOR,
};

export async function todoList(args: { done?: boolean; limit: number }) {
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
  return { todos: rows.map(present) };
}

// ----- todo_create -----------------------------------------------------

export const todoCreateSchema = {
  title: z.string().min(1).describe('The to-do text.'),
  due_at: z
    .string()
    .datetime()
    .optional()
    .describe('Optional due date/time (ISO-8601).'),
  tags: z
    .array(z.string())
    .optional()
    .describe("Category tags, e.g. ['home'], ['kids'], ['errands'], ['work']."),
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  assignee: z
    .string()
    .optional()
    .describe("User handle to assign the todo to (e.g. 'michael', 'fiona')."),
  source_inbox_id: z
    .string()
    .uuid()
    .optional()
    .describe('raw_inbox row this todo was filed from, if any.'),
  actor: ACTOR,
};

export async function todoCreate(args: {
  title: string;
  due_at?: string;
  tags?: string[];
  visibility?: 'wall' | 'personal' | 'household';
  assignee?: string;
  source_inbox_id?: string;
}) {
  const assigneeId = await resolveUserId(args.assignee);
  const inserted = await sql<TodoRow[]>`
    insert into todos (title, due_at, tags, visibility, assignee_user_id, source_inbox_id)
    values (
      ${args.title},
      ${args.due_at ?? null},
      ${(args.tags ?? []) as unknown as string[]},
      ${args.visibility ?? 'household'},
      ${assigneeId},
      ${args.source_inbox_id ?? null}
    )
    ${RETURNING}
  `;
  await notifyReload('todo_create');
  return present(inserted[0]!);
}

// ----- todo_set_done ---------------------------------------------------

export const todoSetDoneSchema = {
  id: z.string().uuid().describe('todo id'),
  done: z.boolean().describe('true to complete, false to re-open.'),
  actor: ACTOR,
};

export async function todoSetDone(args: { id: string; done: boolean }) {
  const rows = await sql<TodoRow[]>`
    update todos
    set done_at = ${args.done ? new Date() : null}, updated_at = ${new Date()}
    where id = ${args.id}
    ${RETURNING}
  `;
  if (rows.length === 0) {
    const err = new Error(`todo ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  await notifyReload('todo_set_done');
  return present(rows[0]!);
}

// ----- todo_update -----------------------------------------------------
// Partial update of a todo's editable fields. Only the fields present in
// the call are changed; omit a field to leave it as-is. Pass null for
// due_at/notes/assignee to clear them.

export const todoUpdateSchema = {
  id: z.string().uuid().describe('todo id'),
  title: z.string().min(1).optional().describe('New title.'),
  notes: z.string().nullable().optional().describe('Freeform notes; null clears.'),
  due_at: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe('Due date/time (ISO-8601); null clears.'),
  tags: z.array(z.string()).optional().describe('Replaces the tag set.'),
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  assignee: z
    .string()
    .nullable()
    .optional()
    .describe("User handle to assign to (e.g. 'michael'); null unassigns."),
  actor: ACTOR,
};

export async function todoUpdate(args: {
  id: string;
  title?: string;
  notes?: string | null;
  due_at?: string | null;
  tags?: string[];
  visibility?: 'wall' | 'personal' | 'household';
  assignee?: string | null;
}) {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (args.title !== undefined) patch.title = args.title;
  if (args.notes !== undefined) patch.notes = args.notes;
  if (args.due_at !== undefined) patch.due_at = args.due_at;
  if (args.tags !== undefined) patch.tags = args.tags;
  if (args.visibility !== undefined) patch.visibility = args.visibility;
  if (args.assignee !== undefined) {
    patch.assignee_user_id = args.assignee === null ? null : await resolveUserId(args.assignee);
  }

  const rows = await sql<TodoRow[]>`
    update todos set ${sql(patch)}
    where id = ${args.id}
    ${RETURNING}
  `;
  if (rows.length === 0) {
    const err = new Error(`todo ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  await notifyReload('todo_update');
  return present(rows[0]!);
}
