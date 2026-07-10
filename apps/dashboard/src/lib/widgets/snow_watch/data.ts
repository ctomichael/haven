// snow_watch data layer — pulls the forecast via the weather repo and reduces
// it to the days worth flagging for a morning ski check.

import { getWeather, type ApiForecastDay } from '$lib/repos/weather';

export type SnowDay = { day: string; label: string; high: number; low: number; when: string[] };

const SNOW_RE = /snow|flurr|blizzard/i;

// Which dayparts on a forecast day mention snow.
function snowyParts(d: ApiForecastDay): string[] {
  return (
    [
      ['morning', d.morning],
      ['afternoon', d.afternoon],
      ['evening', d.evening],
    ] as const
  )
    .filter(([, cond]) => cond && SNOW_RE.test(cond))
    .map(([part]) => part);
}

export async function load(fetchFn: typeof fetch = fetch): Promise<{ days: SnowDay[] }> {
  const weather = await getWeather(fetchFn);
  if (!weather) return { days: [] };
  const days = weather.forecast
    .map((d) => ({ d, when: snowyParts(d) }))
    .filter(({ when }) => when.length > 0)
    .map(({ d, when }) => ({ day: d.day, label: d.label, high: d.high, low: d.low, when }));
  return { days };
}
