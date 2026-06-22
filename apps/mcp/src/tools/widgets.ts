import { z } from 'zod';

import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';

export const widgetListSchema = {
  visibility: z.enum(['wall', 'personal', 'household']).optional(),
  actor: ACTOR,
};

export async function widgetList(args: {
  visibility?: 'wall' | 'personal' | 'household';
}) {
  const rows = await sql`
    select name, visibility, sha, surface, registered_at, registered_by
    from widgets
    where (${args.visibility ?? null}::text is null or visibility = ${args.visibility ?? null})
    order by name
  `;
  return { widgets: rows };
}

export const widgetGetSchema = {
  name: z.string().describe('Widget slug — primary key on widgets table.'),
  actor: ACTOR,
};

export async function widgetGet(args: { name: string }) {
  const [row] = await sql`
    select name, manifest, sha, visibility, surface, registered_at, registered_by
    from widgets
    where name = ${args.name}
  `;
  if (!row) {
    const err = new Error(`widget ${args.name} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return row;
}
