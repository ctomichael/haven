import type { Component } from 'svelte';
import registryJson from '../../../widgets.json';
import type { Surface } from '$lib/surface';

// The registry-driven widget system. `widgets.json` (repo root of the dashboard
// app) lists which widgets exist and how they're placed; each widget lives in
// src/lib/widgets/<slug>/index.svelte. Dispatched Claude Code sessions add a
// folder + a registry entry (one commit per widget) — see docs/agent-dispatch.md.
//
// Existing hand-tuned tiles (clock, weather, todos, …) stay composed directly
// in +page.svelte; the registry governs *additional* widgets so dispatched ones
// can appear without editing the tuned base layout.

export type WidgetEntry = {
  slug: string;
  title: string;
  enabled: boolean;
  surface: { wall: boolean; phone: boolean };
  position?: { col_span?: number };
  schedule?: { show_between?: [string, string]; refresh_cron?: string };
};

const entries = (registryJson as unknown as { widgets: WidgetEntry[] }).widgets;

// Eagerly import every widget component at build time — no async loading in the
// host, and a missing folder is a build error rather than a runtime surprise.
const modules = import.meta.glob<{ default: Component }>('./*/index.svelte', {
  eager: true,
});

function componentFor(slug: string): Component | null {
  const mod = modules[`./${slug}/index.svelte`];
  return mod?.default ?? null;
}

// "HH:MM" → minutes since midnight.
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True if `now` falls within the widget's show_between window (local time). */
export function inSchedule(entry: WidgetEntry, now: Date): boolean {
  const win = entry.schedule?.show_between;
  if (!win) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [start, end] = [minutes(win[0]), minutes(win[1])];
  // Support windows that wrap past midnight (e.g. 22:00–06:00).
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

export type ResolvedWidget = { entry: WidgetEntry; component: Component };

/**
 * The widgets to render for a surface at a given time: enabled, targeted at
 * this surface, in their schedule window, and with a component present.
 */
export function widgetsFor(surface: Surface, now: Date): ResolvedWidget[] {
  const wantWall = surface === 'eink';
  return entries
    .filter((e) => e.enabled)
    .filter((e) => (wantWall ? e.surface.wall : e.surface.phone))
    .filter((e) => inSchedule(e, now))
    .map((e) => ({ entry: e, component: componentFor(e.slug) }))
    .filter((r): r is ResolvedWidget => r.component !== null);
}
