import { sql } from '../client.ts';
import { ACTOR } from '../schemas.ts';

export const userListSchema = {
  actor: ACTOR,
};

export async function userList() {
  const rows = await sql`
    select id, handle, display_name, email, created_at
    from users
    order by handle
  `;
  return { users: rows };
}

export const deviceListSchema = {
  actor: ACTOR,
};

export async function deviceList() {
  const rows = await sql`
    select d.id, d.handle, d.kind, d.user_id, u.handle as user_handle,
           d.created_at, d.last_seen_at
    from devices d
    left join users u on u.id = d.user_id
    order by d.handle
  `;
  return { devices: rows };
}
