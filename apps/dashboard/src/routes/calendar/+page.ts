import type { PageLoad } from './$types';
import { fetchCalendar, type ApiCalEvent } from '$lib/api';
import { mondayOf, addDays, parseYMD, localYMD } from '$lib/calendar';

// Selected date comes from ?date=YYYY-MM-DD (default today). We fetch the whole
// Mon–Sun week around it in one request so the strip can show per-day density
// dots and the agenda can filter to the selected day — tapping within the week
// needs no refetch (the backend caches anyway).
export const load: PageLoad = async ({ url, fetch }) => {
  const dateParam = url.searchParams.get('date');
  const selected = dateParam ? parseYMD(dateParam) : new Date();
  const weekStart = mondayOf(selected);
  const weekEnd = addDays(weekStart, 7);

  const events: ApiCalEvent[] | null = await fetchCalendar(weekStart, weekEnd, fetch).catch(
    () => null,
  );

  return {
    selectedYMD: localYMD(selected),
    weekStartYMD: localYMD(weekStart),
    events,
  };
};
