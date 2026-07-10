import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';
import { notifyReload } from '../events.ts';

// Read + acknowledge side of briefings. Writes (publish/resolve) come from
// Hermes via the MCP tools; the wall reads active ones here and taps to ack.

const briefings = new Hono();

const ListQuery = z.object({
  include_resolved: z.coerce.boolean().optional(),
  surface: z.enum(['wall', 'phone', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

briefings.get('/', zValidator('query', ListQuery), async (c) => {
  const args = c.req.valid('query');
  const rows = await sql`
    select id, dedupe_key, severity, title, body, surface, source_refs,
           created_at, updated_at, expires_at, acknowledged_at, resolved_at
    from briefings
    where (${args.include_resolved ?? false}::boolean or resolved_at is null)
      and (expires_at is null or expires_at > now())
      and (${args.surface ?? null}::text is null
           or surface = 'all' or surface = ${args.surface ?? null})
    order by case severity when 'urgent' then 2 when 'attention' then 1 else 0 end desc,
             created_at desc
    limit ${args.limit}
  `;
  return c.json({ briefings: rows });
});

const IdParam = z.object({ id: z.string().uuid() });

briefings.patch('/:id/ack', zValidator('param', IdParam), async (c) => {
  const { id } = c.req.valid('param');
  const rows = await sql<{ id: string }[]>`
    update briefings set acknowledged_at = now(), updated_at = now()
    where id = ${id} and acknowledged_at is null
    returning id
  `;
  void audit({ tool: 'briefing_ack', args: { id }, actor: undefined, resultStatus: 'ok' });
  void notifyReload({ reason: 'briefing_ack', surface: 'all' });
  return c.json({ ok: true, acknowledged: rows.length > 0 });
});

export default briefings;
