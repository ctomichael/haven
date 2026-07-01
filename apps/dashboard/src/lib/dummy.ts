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

export type Aisle = 'produce' | 'bakery' | 'dairy' | 'pantry';

export type ShoppingItem = {
  id: string;
  name: string;
  qty?: string;
  aisle: Aisle;
  bought?: boolean;
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
  morning?: string | null;
  afternoon?: string | null;
  evening?: string | null;
};

export type Identity = {
  initial: string;
  accent: Accent;
};

// Climate types --------------------------------------------------------

export type Room = {
  id: string;
  name: string;
  temp: number;
  on: boolean;
};

export type Climate = {
  current: number;
  target: number;
  mode: 'heat' | 'auto' | 'cool' | 'off';
  status: string;
  sparkline24h: number[]; // hourly °C readings
  runtimeWeek: number[]; // hours per day, oldest → today
  rooms: Room[];
};

export type SleepSack = {
  child: string;
  roomLow: number;
  tog: number;
  extraLayer: string;
};

export type BinColor = { label: string; accent: Accent };

export type BinDay = {
  visible: boolean;
  whenLabel: string;
  collectedLabel: string;
  bins: BinColor[];
};

// Day-dashboard slice --------------------------------------------------

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
      { day: 'TUE', high: 21, low: 12, label: 'Sunny',   morning: 'Fine',   afternoon: 'Sunny',  evening: 'Clear' },
      { day: 'WED', high: 18, low: 11, label: 'Cloud',   morning: 'Cloudy', afternoon: 'Few showers', evening: 'Cloudy' },
      { day: 'THU', high: 15, low: 10, label: 'Showers', morning: 'Showers', afternoon: 'Showers', evening: 'Rain' },
    ] satisfies ForecastDay[],
  },
  calendar: [
    { id: 'e1', start: '09:00', title: 'Standup',           sub: 'Work',                  accent: 'sky',    past: true },
    { id: 'e2', start: '10:30', title: 'Quarterly review',  sub: 'Work · 90m',            accent: 'sky',    isNext: true },
    { id: 'e3', start: '14:00', title: 'Lily pickup',       sub: 'Family',                accent: 'amber' },
    { id: 'e4', start: '19:30', title: 'Squash with Sam',   sub: 'Personal',              accent: 'sage' },
  ] satisfies CalendarEvent[],
  // Full day's events for the calendar sub-screen
  agenda: [
    { id: 'a1', start: '07:30', title: 'School run',           sub: 'Family · with Lily',     accent: 'amber',  past: true },
    { id: 'a2', start: '09:00', title: 'Standup',              sub: 'Work · 15m',             accent: 'sky',    past: true },
    { id: 'a3', start: '10:30', title: 'Quarterly review',     sub: 'Work · 90m',             accent: 'sky',    isNext: true },
    { id: 'a4', start: '12:30', title: 'Lunch with Hannah',    sub: 'Personal',               accent: 'sage' },
    { id: 'a5', start: '14:00', title: 'Lily pickup',          sub: 'Family',                 accent: 'amber' },
    { id: 'a6', start: '16:00', title: 'Heat pump service',    sub: 'Home · 60m',             accent: 'sage' },
    { id: 'a7', start: '18:00', title: 'Family dinner',        sub: 'Family',                 accent: 'amber' },
    { id: 'a8', start: '19:30', title: 'Squash with Sam',      sub: 'Personal',               accent: 'sage' },
  ] satisfies CalendarEvent[],
  todos: [
    { id: 't1', title: 'Pay council tax',          accent: 'amber', done: false },
    { id: 't2', title: 'Book the MOT',             accent: 'stone', done: false },
    { id: 't3', title: "Lily's permission slip",   accent: 'amber', done: true },
    { id: 't4', title: 'Service heat pump',        accent: 'sage',  done: false },
    { id: 't5', title: 'Refill dishwasher salt',   accent: 'sage',  done: false },
  ] satisfies Todo[],
  // Full list for the todo sub-screen
  todosAll: [
    { id: 't1',  title: 'Pay council tax',                 accent: 'amber', done: false },
    { id: 't2',  title: 'Book the MOT',                    accent: 'stone', done: false },
    { id: 't3',  title: "Lily's permission slip",          accent: 'amber', done: true },
    { id: 't4',  title: 'Service heat pump',               accent: 'sage',  done: false },
    { id: 't5',  title: 'Refill dishwasher salt',          accent: 'sage',  done: false },
    { id: 't6',  title: 'Replace bathroom bulb',           accent: 'sage',  done: true },
    { id: 't7',  title: 'Renew passport',                  accent: 'stone', done: false },
    { id: 't8',  title: 'School trip permission · Theo',   accent: 'amber', done: false },
    { id: 't9',  title: 'Birthday card for Mum',           accent: 'stone', done: true },
    { id: 't10', title: 'Move clocks back',                accent: 'sage',  done: true },
    { id: 't11', title: 'Top up oyster card',              accent: 'stone', done: false },
    { id: 't12', title: 'Book swimming lessons',           accent: 'amber', done: true },
  ] satisfies Todo[],
  shopping: {
    items: [
      { id: 's1', name: 'Oat milk',     aisle: 'dairy' },
      { id: 's2', name: 'Sourdough',    aisle: 'bakery' },
      { id: 's3', name: 'Eggs',         qty: '×6', aisle: 'dairy' },
      { id: 's4', name: 'Olive oil',    aisle: 'pantry' },
      { id: 's5', name: 'Apples',       qty: '×4', aisle: 'produce' },
    ] satisfies ShoppingItem[],
    moreCount: 8,
  },
  // Full list for the shopping sub-screen
  shoppingAll: [
    { id: 's1',  name: 'Oat milk',         aisle: 'dairy' },
    { id: 's2',  name: 'Sourdough',        aisle: 'bakery' },
    { id: 's3',  name: 'Eggs',     qty: '×6', aisle: 'dairy' },
    { id: 's4',  name: 'Yogurt',           aisle: 'dairy' },
    { id: 's5',  name: 'Butter',           aisle: 'dairy' },
    { id: 's6',  name: 'Apples',   qty: '×4', aisle: 'produce' },
    { id: 's7',  name: 'Bananas',  qty: '×6', aisle: 'produce' },
    { id: 's8',  name: 'Spinach',          aisle: 'produce', bought: true },
    { id: 's9',  name: 'Olive oil',        aisle: 'pantry' },
    { id: 's10', name: 'Rice',     qty: '500g', aisle: 'pantry' },
    { id: 's11', name: 'Pasta',    qty: '×2', aisle: 'pantry' },
    { id: 's12', name: 'Chopped tomatoes', qty: '×2', aisle: 'pantry' },
    { id: 's13', name: 'Dark chocolate',   aisle: 'pantry', bought: true },
  ] satisfies ShoppingItem[],
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

  // Climate dash slice -------------------------------------------------
  climate: {
    current: 19,
    target: 20,
    mode: 'heat' as const,
    status: 'Heating to 20°',
    sparkline24h: [
      17, 17, 16, 16, 16, 17, 17, 18, 19, 19, 20, 20,
      20, 20, 19, 19, 19, 18, 18, 18, 19, 19, 19, 19,
    ],
    runtimeWeek: [2.1, 1.8, 0.9, 1.4, 2.3, 1.6, 1.2], // today is last
    rooms: [
      { id: 'r1', name: 'Living room', temp: 21, on: true },
      { id: 'r2', name: 'Kitchen',     temp: 22, on: true },
      { id: 'r3', name: "Lily's room", temp: 19, on: false },
      { id: 'r4', name: "Nico's room", temp: 17, on: false },
      { id: 'r5', name: 'Bedroom',     temp: 18, on: true },
    ] satisfies Room[],
  } satisfies Climate,
  sleepSack: {
    child: 'Nico',
    roomLow: 17,
    tog: 2.5,
    extraLayer: '+ long-sleeve vest',
  } satisfies SleepSack,
  binDay: {
    visible: true,
    whenLabel: 'Bins out tonight',
    collectedLabel: 'Collected tomorrow · Thu AM',
    bins: [
      { label: 'Recycling',    accent: 'sage' },
      { label: 'Garden waste', accent: 'stone' },
    ],
  } satisfies BinDay,
};
