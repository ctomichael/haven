import type { PageLoad } from './$types';
import { fetchTodos, fetchShopping, fetchWeather } from '$lib/api';

export const load: PageLoad = async ({ fetch }) => {
  // Tolerant load — if the backend is down (e.g. you're working offline),
  // serve empty arrays / null so the layout still renders rather than 500ing.
  const [todos, shopping, weather] = await Promise.all([
    fetchTodos(fetch).catch(() => []),
    fetchShopping(fetch).catch(() => []),
    fetchWeather(fetch).catch(() => null),
  ]);
  return { todos, shopping, weather };
};
