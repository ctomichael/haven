import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';

export const eventKindsListSchema = {
  actor: ACTOR,
};

export async function eventKindsList() {
  const rows = await sql`
    with counts as (
      select kind, count(*)::int as count, max(ts) as last_ts
      from events
      group by kind
    )
    select
      k.kind,
      k.description,
      k.schema_json,
      k.owner_widget,
      k.first_seen_ts,
      coalesce(c.count, 0) as count,
      coalesce(c.last_ts, k.last_ts) as last_ts
    from event_kinds k
    left join counts c on c.kind = k.kind
    order by k.kind
  `;
  return { kinds: rows };
}
