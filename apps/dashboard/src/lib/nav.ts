import type { ComponentType } from 'svelte';
import {
  LayoutDashboard,
  Thermometer,
  CalendarDays,
  ListChecks,
  ShoppingCart,
  Inbox,
} from 'lucide-svelte';

// Navigable dashboards/screens surfaced in the top-right nav menu. Order is
// display order in the grid. Add a screen here to make it reachable from the
// menu on every surface that renders <NavMenu>.

export type NavDest = { label: string; href: string; icon: ComponentType };

export const NAV_DESTINATIONS: NavDest[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Climate', href: '/climate', icon: Thermometer },
  { label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { label: 'To-do', href: '/todos', icon: ListChecks },
  { label: 'Shopping', href: '/shopping', icon: ShoppingCart },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
];
