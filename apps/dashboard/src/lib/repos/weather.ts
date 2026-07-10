// Weather repo — the sanctioned data layer for widgets. Widget `data.ts` files
// import from repos rather than calling the backend directly, so the data
// surface stays typed and swappable. Thin wrapper over $lib/api for now.

import { fetchWeather, type ApiWeather, type ApiForecastDay } from '$lib/api';

export type { ApiWeather, ApiForecastDay };

export function getWeather(fetchFn: typeof fetch = fetch): Promise<ApiWeather | null> {
  return fetchWeather(fetchFn).catch(() => null);
}
