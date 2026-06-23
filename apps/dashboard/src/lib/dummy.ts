// Dummy data driving the v0 dashboard. Replace each slice with a repo
// query once /api/* surfaces the typed reads.

import type { Accent } from './tokens';

export type CalendarEvent = {
  id: string;
  start: string; // "09:00"
  title: string;
  sub?: string;
  accent: Accent;
  past?: boolean;
  isNext?: boolean;
};

export type Todo = {
  id: string;
  title: string;
  accent: Accent;
  done: boolean;
};

export type ShoppingItem = {
  id: string;
  name: string;
  qty?: string;
};

export type Sensor = {
  label: string;
  value: number;
  unit: string;
  state: 'healthy' | 'warn' | 'nodata';
  warnText?: string;
};

export type ForecastDay = {
  day: string; // "TUE"
  high: number;
  low: number;
  label: string;
};

export type Identity = {
  initial: string;
  accent: Accent;
};

export const dummy = {
  masthead: {
    title: 'Haven',
    subtitle: 'The Household Almanac',
  },
  weather: {
    city: 'BRISTOL',
    currentTemp: 19,
    currentLabel: 'Bright',
    forecast: [
      { day: 'TUE', high: 21, low: 12, label: 'Sunny' },
      { day: 'WED', high: 18, low: 11, label: 'Cloud' },
      { day: 'THU', high: 15, low: 10, label: 'Showers' },
    ] satisfies ForecastDay[],
  },
  calendar: [
    { id: 'e1', start: '09:00', title: 'Standup',           sub: 'Work',       accent: 'sky',    past: true },
    { id: 'e2', start: '10:30', title: 'Quarterly review',  sub: 'Work · 90m', accent: 'sky',    isNext: true },
    { id: 'e3', start: '14:00', title: 'Lily pickup',       sub: 'Family',     accent: 'amber' },
    { id: 'e4', start: '19:30', title: 'Squash with Sam',   sub: 'Personal',   accent: 'sage' },
  ] satisfies CalendarEvent[],
  todos: [
    { id: 't1', title: 'Pay council tax',            accent: 'amber', done: false },
    { id: 't2', title: 'Book the MOT',               accent: 'stone', done: false },
    { id: 't3', title: "Lily's permission slip",     accent: 'amber', done: true },
    { id: 't4', title: 'Service heat pump',          accent: 'sage',  done: false },
    { id: 't5', title: 'Refill dishwasher salt',     accent: 'sage',  done: false },
  ] satisfies Todo[],
  shopping: {
    items: [
      { id: 's1', name: 'Oat milk' },
      { id: 's2', name: 'Sourdough' },
      { id: 's3', name: 'Eggs',     qty: '×6' },
      { id: 's4', name: 'Olive oil' },
      { id: 's5', name: 'Apples',   qty: '×4' },
    ] satisfies ShoppingItem[],
    moreCount: 8,
  },
  sensors: [
    { label: 'Living room', value: 21, unit: '°C', state: 'healthy' as const },
    { label: 'Bedroom',     value: 18, unit: '°C', state: 'warn' as const, warnText: 'Dry' },
    { label: 'Kitchen',     value: 22, unit: '°C', state: 'healthy' as const },
  ] satisfies Sensor[],
  status: {
    online: true,
    lastSync: '08:42',
    hermesReady: true,
    identities: [
      { initial: 'A', accent: 'sky' as const },
      { initial: 'M', accent: 'amber' as const },
    ] satisfies Identity[],
  },
};
