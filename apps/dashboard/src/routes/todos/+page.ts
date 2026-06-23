import type { PageLoad } from './$types';
import { fetchTodos } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
  const todos = await fetchTodos(fetch).catch(() => []);
  return { todos };
};
