import type { PageLoad } from './$types';
import {
  fetchTodos,
  fetchShopping,
  fetchWeather,
  fetchHaEntities,
  fetchCalendar,
  fetchBriefings,
  type HaEntity,
  type ApiBriefing,
} from '$lib/api';
import type { Sensor, CalendarEvent } from '$lib/dummy';
import { startOfDay, addDays, toWidgetEvent, markNext } from '$lib/calendar';
import { SENSOR_TILES } from '$lib/sensors';

function toSensor(label: string, e: HaEntity | undefined): Sensor {
  const n = e ? Number(e.state) : NaN;
  if (!e || !Number.isFinite(n)) {
    return { label, value: 0, unit: '°C', state: 'nodata' };
  }
  return { label, value: Math.round(n), unit: e.unit ?? '°C', state: 'healthy' };
}

export const load: PageLoad = async ({ fetch }) => {
  // Tolerant load — if the backend is down (e.g. you're working offline),
  // serve empty arrays / null so the layout still renders rather than 500ing.
  const dayStart = startOfDay(new Date());
  const dayEnd = addDays(dayStart, 1);

  const [todos, shopping, weather, haEntities, calRaw, briefings] = await Promise.all([
    fetchTodos(fetch).catch(() => []),
    fetchShopping(fetch).catch(() => []),
    fetchWeather(fetch).catch(() => null),
    fetchHaEntities(
      SENSOR_TILES.map((s) => s.entity),
      fetch,
    ).catch(() => null),
    fetchCalendar(dayStart, dayEnd, fetch).catch(() => null),
    fetchBriefings(fetch, { surface: 'wall', limit: 6 }).catch((): ApiBriefing[] => []),
  ]);

  // Today's events for the widget; null when the ICS feed isn't configured.
  const now = new Date();
  const calendar: CalendarEvent[] | null = calRaw
    ? markNext(calRaw.map((e) => toWidgetEvent(e, now))).slice(0, 6)
    : null;

  // Null when HA is unreachable/unconfigured → page falls back to dummy.
  const sensors: Sensor[] | null = haEntities
    ? SENSOR_TILES.map((t) =>
        toSensor(
          t.label,
          haEntities.find((e) => e.entity_id === t.entity),
        ),
      )
    : null;

  return { todos, shopping, weather, sensors, calendar, briefings };
};
