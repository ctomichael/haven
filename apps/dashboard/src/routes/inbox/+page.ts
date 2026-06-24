import type { PageLoad } from './$types';
import { fetchInbox } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
  const inbox = await fetchInbox(fetch, { limit: 200 }).catch(() => []);
  return { inbox };
};
