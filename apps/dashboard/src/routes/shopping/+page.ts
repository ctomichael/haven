import type { PageLoad } from './$types';
import { fetchShopping } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
  const shopping = await fetchShopping(fetch).catch(() => []);
  return { shopping };
};
