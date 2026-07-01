// Calendar helpers shared by the dashboard "Today" widget and the /calendar
// page. All date maths is *local* (the household is single-timezone), so
// all-day events — which the backend anchors to local midnight — group onto
// the right calendar day without any UTC juggling.

import type { Accent } from './tokens';
import type { CalendarEvent } from './dummy';
import type { ApiCalEvent } from './api';

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function mondayOf(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = Monday
  return addDays(s, -dow);
}

/** 'YYYY-MM-DD' from a Date's *local* components. */
export function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse 'YYYY-MM-DD' as a *local* midnight Date. */
export function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const ACCENTS: Accent[] = ['sky', 'amber', 'sage', 'rust', 'stone'];

/** Stable, semantic-free accent so events get distinct-but-consistent dots. */
export function accentFor(seed: string): Accent {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

/** Does an event overlap the given local calendar day (YYYY-MM-DD)? */
export function onLocalDate(e: ApiCalEvent, ymd: string): boolean {
  const dayStart = parseYMD(ymd);
  const dayEnd = addDays(dayStart, 1);
  return new Date(e.end) > dayStart && new Date(e.start) < dayEnd;
}

/** Map a raw ICS occurrence to the widget/agenda CalendarEvent shape. */
export function toWidgetEvent(e: ApiCalEvent, now: Date): CalendarEvent {
  return {
    id: e.id,
    start: e.allDay ? 'ALL' : hhmm(e.start),
    title: e.title,
    sub: e.location ?? (e.allDay ? 'All day' : undefined),
    accent: accentFor(e.title),
    past: new Date(e.end) <= now,
  };
}

/** Mark the first non-past event as "up next" (mutates + returns the list). */
export function markNext(events: CalendarEvent[]): CalendarEvent[] {
  const idx = events.findIndex((e) => !e.past);
  if (idx >= 0) events[idx]!.isNext = true;
  return events;
}
