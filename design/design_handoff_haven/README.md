# Handoff: Haven — Household Dashboard & Second-Brain

## Overview

Haven is a calm, e-ink-first household dashboard and second-brain for a family. It runs on two surfaces from one codebase:

- **Wall (primary):** a 10.3″ Boox Note Air 5 C colour e-ink tablet, wall-mounted in the kitchen, landscape. Shows ambient info — clock, weather, calendar, indoor sensors, to-dos, shopping, climate, and custom widgets.
- **Phone (secondary):** a PWA on each adult's phone (375–430 px portrait). The primary *capture* surface — voice memos, quick notes, share-sheet drops — plus inbox review and list browsing.

Captured content flows to an AI agent ("Hermes") that classifies and files it. New widgets are requested in plain language and added by an agent editing the codebase. **Therefore the visual system must be strict and composable** so machine-generated widgets blend in with hand-designed ones. The guiding principle: *a new widget = WidgetFrame + a content arrangement, never a bespoke new layout.*

Personality: **Calm Almanac** — Swiss-typographic, generous whitespace, hairline rules, bookish. Closer to Tufte / Monocle / a vintage almanac than to any SaaS dashboard. It should read as considered furniture, not a screen.

**Target stack (from the brief): SvelteKit PWA.** See "Recreating in SvelteKit" below.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing the intended look and behaviour. They are **not production code to copy directly.** They were authored as "Design Components" (a streaming-preview HTML format); you do not need that runtime. Treat them as a precise, interactive spec.

Your task is to **recreate these designs in a SvelteKit PWA** using idiomatic Svelte components, the design tokens documented below, and the structure described per screen. Where a design file uses inline styles and a small JS class for state, map that to Svelte components + reactive state.

Every `.dc.html` file opens directly in a browser if you want to interact with the prototype. Logic (state, chart geometry, navigation) lives in a `<script data-dc-script>` class named `Component` near the bottom of each file; markup is the bulk above it. Ignore `support.js` — it's the prototype runtime, not part of the deliverable.

## Fidelity

**High-fidelity (hifi).** Final colours, typography, spacing, borders, and interactions are all specified and intended to be reproduced faithfully. Exact hex values, the type scale, the 8 px spacing scale, and touch-target sizes are given below and must be honoured — they were chosen specifically to survive e-ink rendering. Recreate the UI pixel-faithfully, then let real data drive it.

## The two surfaces differ by rule, not by token

Both surfaces share **all** tokens (colour, type, spacing, borders, icons). They differ only in motion and input:

| | Wall (e-ink) | Phone (PWA) |
|---|---|---|
| Animation / transitions | **None** — forbidden | Light, allowed (≤320 ms) |
| Hover states | None (no pointer) | Allowed |
| Shadows / gradients / alpha | **None** | Avoid, but soft device shadow OK |
| Min stroke | 2 px | 2 px |
| Min body text | 16 px (default 20–24) | 15–16 px |
| Touch target | 64×64 px min, primary 80–96 | 44 px min (iOS), 64 preferred |
| Colour | accents only, ~95% B/W | same palette, slightly freer |

Implement this as a surface flag (e.g. `surface: 'eink' | 'phone'`) that gates transitions/hover, **not** a different design language.

---

## E-ink hard constraints (non-negotiable on wall)

- No animation, no transitions, no fades.
- No gradients, no shadows, no semi-transparency. Flat fills only.
- No hover states.
- Minimum stroke width 2 px. Charts are 2 px ink polylines.
- Pure black `#000` on pure white `#FFF` for all text and primary lines.
- **Colour never load-bearing.** The black-and-white version of every screen must be fully legible and usable. Colour is a flat fill behind/beside ink, only for: status states, calendar category dots, todo/category tags, sensor warning chips, identity badges, chart band fills. Text, icons, and lines are *always* ink.
- Max 3 accent colours per screen; most screens use one or two.
- Every region is labelled **live** (partial refresh — clock, sensor numbers, weather) or **static** (full refresh — calendar, layout). Carry this as a per-widget flag; it informs the e-ink refresh strategy.

---

## Design Tokens

### Colour — neutrals
| Token | Hex | Use |
|---|---|---|
| `ink` | `#000000` | Body text, primary strokes |
| `ink-2` | `#4A4A4A` | Secondary info, sparingly |
| `paper` | `#FFFFFF` | Base surface |
| `paper-2` | `#F0F0F0` | Region fill, only when essential |
| `hairline` | `#ECECEC` | Internal divider rules (2 px) |
| `hairline-2` | `#E2E2E2` | Secondary divider |
| `disabled` | `#C8C2B8` | Disabled stroke/knob |
| `muted-mono` | `#8C8275` | Mono meta text, de-emphasised |

### Colour — accents (muted, Kaleido-aware)
Each accent ships a **solid** (dots, checked fill, identity, density, chart marks) and a **tint** (chip backgrounds, band fills behind ink text). These hexes were chosen to render as quiet pastels on Kaleido 3.

| Token | Solid | Tint | Meaning |
|---|---|---|---|
| `accent-sage` | `#7E9168` | `#DDE5D4` | Done, healthy, on track, comfort band |
| `accent-amber` | `#B98A3E` | `#EFE3C8` | Today, attention, in-progress |
| `accent-rust` | `#A85C42` | `#ECD9D0` | Overdue, alert, active/heating state |
| `accent-sky` | `#6E8AA8` | `#D7E0E9` | Scheduled, calendar, external, kids |
| `accent-stone`| `#8C8275` | `#E4DDD2` | Tertiary info, archived |

Rule: text/icons/lines are always `ink`; accents appear only as fills.

### Typography
Three families, loaded from Google Fonts:
- **Newsreader** (serif) — headings, dates, quotes, large unit labels (°C, TOG). Weights 400, 500. Also italic 400 for the evening quote.
- **Public Sans** (grotesk) — UI, body, labels, buttons. Weights 400, 500, 600, 700.
- **IBM Plex Mono** — time, numbers, timestamps, meta, axis labels, chip/section captions. Weights 400, 500.

Type scale (6 sizes — verify at 1 m on the Boox):
| Name | Size / line-height | Family | Notes |
|---|---|---|---|
| `caption` | 14 / 1.4 | Public Sans 600 | UPPERCASE, letter-spacing 0.16em |
| `body` | 20 / 1.5 | Public Sans 400 | default wall reading size |
| `body-lg` | 24 / 1.45 | Public Sans 400/500 | |
| `h3` | 32 / 1.2 | Newsreader 500 | |
| `h2` | 44 / 1.1 | Newsreader 500 | section titles |
| `h1` | 60 / 1.05 | Newsreader 500 | screen titles |

Special display numerals (not part of the 6-step scale, used deliberately): clock `104–112 px` IBM Plex Mono 500, tabular-nums, letter-spacing −0.03em; sensor/setpoint big numbers `46–74 px` IBM Plex Mono 500.

Common mono treatments: section captions and meta are IBM Plex Mono, 11–14 px, letter-spacing 0.10–0.20em, often UPPERCASE, colour `muted-mono` or `ink`.

### Spacing
Base unit **8 px**. Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`. Dashboard grid gutter is 16 px nominal (the prototypes use 26–30 px gaps on the 1240-wide canvas; keep gutters generous and consistent).

### Borders & radius
- `thin` 1 px (sparingly) · `normal` 2 px (**default** for rules, frames, controls) · `thick` 4 px (hero frames, primary capture button, popover frame).
- Radius **0 by default**; max **4 px** where used. Exceptions are intentionally round: switch tracks/knobs (pill), identity badges and the phone FAB (circles), phone device bezel.

### Iconography
**Lucide**, 2 px stroke, always rendered in `ink` (never colour). Sizes 20 / 32 / 48. Icons used: chevron-right, check, plus, x, sun, mic, image, alert-triangle, calendar, inbox, trash (bin), flame (heating), minus. All are standard Lucide paths — pull from `lucide-svelte`.

### Motion (phone only)
- Sheet slide-up: `transform: translateY(100%→0)`, **320 ms** `cubic-bezier(0.4,0,0.1,1)`.
- Switch knob / track: **200 ms** ease.
- Button/control press: `transform: scale(0.96–0.98)` on `:active`.
- Tab/icon active colour swap: instant.
None of these run on the e-ink surface.

---

## Screens / Views

> Wall canvas is designed at **1240 × 930** logical px (the Kaleido colour grid). It renders at 2× (2480 × 1860) for crisp 300 ppi text. Build the wall layout at 1240×930 logical and let device-pixel-ratio handle the doubling. Phone reference is **390 × 844**.

### 1. Dashboard — Day (wall) — `Haven - Dashboard Day.dc.html`
**Purpose:** ambient morning/daytime glance; springboard into sub-screens.
**Layout:** full-bleed white, 36 px padding, flex column: masthead → body grid → status bar.
- **Masthead:** 2 px bottom rule. Left: "Haven" (Newsreader 500, 34) + "The Household Almanac" (mono caption). Right: "WEEK n · day/365" (mono).
- **Body grid:** 12 columns, rows `200px / 1fr / 128px`, gaps 28×26.
  - Clock (cols 1–6, row 1) — **live**. Mono 104, date sub-line Newsreader 29.
  - Weather (cols 6–13, row 1) — current (sun icon + 19°) + 3-day strip split by 2 px rules. **live** badge.
  - Today/calendar (cols 1–6, row 2) — **static**, tappable → Calendar. 4 events; each = mono time (62 px col) + category dot + title + sub. Past events `opacity:0.5` + strike. "Up next" amber chip + amber left bar.
  - To-do (cols 6–10, row 2) — **static**, tappable → To-do. 5 rows: 32 px checkbox + label + category tint chip. Done = sage fill + white check + strike.
  - Shopping (cols 10–13, row 2) — **static**, tappable → Shopping. 5 items + "+8 more".
  - Sensor ×2 (cols 1–3, 3–5, row 3) — **live**. Big mono number + Newsreader unit + mono label. One shows an amber "Dry" chip (out of range).
  - Note capture button (cols 5–13, row 3) — **4 px frame**, plus-in-box icon, "Note" (Newsreader 42) + mono sub. Tappable → Capture.
- **Status bar:** 2 px top rule. Left: online dot + "LAST SYNC hh:mm" + "HERMES READY". Right: identity badges (A = sky, M = amber circles, 22 px).
- **Two built-in dev tweaks:** `showGrid` (12-col overlay) and `highlightLive` (dashed amber outline on live regions). These are design aids — not shipped UI.

### Sub-screens (same file, full-refresh navigation, no transition)
Tapping a widget swaps the whole screen (state `screen: home|calendar|todos|shopping|capture`). Each sub-screen has a **back control**: a 56 px-tall bordered button "‹ DASHBOARD" top-left.
- **Calendar:** h1 "Calendar" + week meta. 7-day strip (today = `paper-2` fill + 4 px amber bottom border, density dots per day in category colours). Full agenda list (time / dot / title / category·meta), category legend footer (sky=Work, amber=Family, sage=Personal).
- **To-do:** h1 + "n/12 done" + filter chips (All [ink fill] / Home / Errands / Kids). 2-column × 4-row grid of items. Dashed "+ ADD TO-DO" button → Capture.
- **Shopping:** h1 + "13 items · 4 aisles". 2-column, grouped by aisle (Produce / Bakery / Dairy / Pantry) with section captions; checked items sage + strike; quantity `×3` in mono.
- **Capture overlay:** full-screen white. Header "● NEW NOTE" + 56 px X. 4 px ink left bar beside Newsreader-40 draft text with a blinking caret block. "HERMES SUGGESTS" + proposed category tint chips. Footer 2 px rule: left = "Hold to speak" (4 px frame, mic 40) + "Photo" (2 px frame); right = "Cancel" + "Save note" (4 px frame, ink fill, white text).

### 2. Dashboard — Evening (wall) — `Haven - Wall Evening.dc.html`
**Purpose:** quiet wind-down mode. Fewer widgets, 2 accents, more air.
**Layout:** masthead "Good evening" → grid (rows `236px / 1fr`) → status bar.
- Clock (cols 1–7, row 1) — mono 112.
- "Tonight" focal block (cols 1–7, row 2) — italic Newsreader 38 quote + attribution, footer "SUNSET … · MOON · CLEAR 14°".
- Right column (cols 7–13, both rows): "Tomorrow" agenda (sky dots) + "Tomorrow's prep — kids" checklist (sage checks for done).
- Status bar identity badges go **ink** (night), "NIGHT MODE · 22:00".
This file also shows the **Capture overlay** as a second labelled frame (identical to the day one).

### 3. Phone PWA — `Haven - Phone PWA.dc.html` (interactive: Today / Capture / Inbox)
**Purpose:** capture → classify → review loop.
**Device:** 390×844, dynamic island, status bar (21:18 + signal/wifi/battery glyphs), home indicator. Sticky bottom bar (108 px) with **Today** and **Inbox** tabs + centre **FAB** (66 px ink circle, white border) that opens the capture sheet. Inbox tab shows a rust badge with pending count.
- **Today view:** "Haven" + date rule. h1 "Good evening, Anna." + summary line. Sections (mono caption + 2 px rule): "Up next" (event), "Needs you" (overdue to-do with rust "2 days over" chip), "Captured today" (tappable card → Inbox, shows count), "At a glance" (3-up stats: to-do 5/12, shopping 13, home 21°C).
- **Capture sheet:** slides up (320 ms). Header "● NEW NOTE" + X. Full-height `textarea` (Newsreader 26) with placeholder "What's on your mind?". "HERMES WILL FILE THIS" + "Auto-sort on save" chip. Footer: mic (64 circle, 3 px) + photo (64, 2 px) + "Save note" (ink fill, flex-1). Saving a non-empty draft prepends it to the inbox and navigates to Inbox.
- **Inbox view:** h1 "Inbox" + "n to review · m filed". Each card: quote (Newsreader 20) + "FILE AS" + selectable category chips (selected = tint fill, others = 2 px `disabled` outline; tapping re-categorises) + "Confirm" (ink fill, flex-1) / "EDIT". Confirm removes the card and increments filed. Empty state: sage check ring + "Inbox zero" + "EVERYTHING'S FILED — n TODAY".

### 4. Climate & Home (wall) — `Haven - Climate.dc.html` (interactive: dash + popover)
**Purpose:** simple climate at-a-glance on the dash; in-depth history + controls in a popover. Also demonstrates two **custom informational tiles**.
**Dash layout:** masthead "Climate & home" → grid (rows `auto / 1fr`) → status bar.
- **Climate tile** (cols 1–7, row 1) — **live**, tappable → popover. Big mono temp (74) + °C, "HEATING → target°" (flame icon, rust), "MODE · …", and a 24 h **sparkline** (2 px ink polyline). "TAP FOR CONTROLS".
- **Sleep-sack tile** (cols 7–10, row 1) — **custom**. "Tonight · Nico", TOG value (mono 52) + "TOG", "+ long-sleeve vest", footer "ROOM LOW ~n° OVERNIGHT". TOG is derived from the overnight room-low: ≥21→0.5, ≥18→1.0, ≥16→2.5, else 3.5.
- **Bin-day tile** (cols 10–13, row 1) — **custom, conditional** (render only the day before collection). Trash icon + "Bins out tonight" + colour-square + label rows (sage = Recycling, stone = Garden waste), footer "COLLECTED TOMORROW · THU AM".
- **Rooms + switches** (cols 1–7, row 2) — list of rooms: name + temp + **Switch** (62×34 pill, 200 ms knob; on = ink track/white knob, off = white track/ink knob). Tap toggles.
- **Runtime bar chart** (cols 7–13, row 2) — 7 daily bars (hours); today = ink fill, rest = sage tint + 2 px ink border; value above, day letter below.

**Popover** (`open` state): full-screen white inside a 4 px ink frame, 40 px padding.
- Header: h2 "Nico's room" + mono sub + 56 px X.
- **Left (flex 1.5):** "Temperature · last 24h" + now value. **Line chart** (SVG, `preserveAspectRatio=none`, 2.5 px ink polyline): sage comfort **band** (`accent-sage` tint rect between 18–21°, dashed sage edge lines), hollow-ring marker at the coldest point with a dashed drop line, filled ink dot at "now". Y labels 22/19/16°, X labels 22:00→NOW. Legend: comfort band / threshold / now. Below: "Heat pump · runtime" **state timeline** (SVG: rust rects on a 2 px ink baseline marking heating-on runs) + label "hh:00–hh:00 · n.nh".
- **Right (flex 1, 2 px left border):** **Power** switch (80×44). **Target temperature** stepper (−/+ 72 px buttons, ±0.5°, mono 62 value, clamp 10–28). **Mode** segmented control (Heat/Auto/Cool/Off; selected = ink fill/white). Status line (Newsreader 24): "Now n° — heating to t°" / "at target" / "Heat pump off".

### Reference pages (not screens — your spec sheets)
- **`Haven - Tokens.dc.html`** — the rendered token sheet: type specimens + scale, neutrals, accent solid/tint pairs with meanings, spacing bars, borders, icons, **06 Controls** (switch/stepper/mode), **07 Data visualisation** (chart conventions).
- **`Haven - Components.dc.html`** — component library in default + variant + empty/error states, grouped: A Foundation, B Data display, C Capture & navigation, D Smart home & data.

---

## Components (build these in Svelte)

Reusable, data-driven. Suggested prop shapes in parentheses.

**Foundation**
- `WidgetFrame` (`title`, `live?`, `action?`, `onAction?`, slot) — 2 px top rule, caption title, optional chevron affordance, content slot. **Every widget composes from this.**
- `Button` (`variant: primary|secondary|ghost`, `size: default(64)|large(96)|inline`) — primary = ink fill/white; secondary = 2 px ink outline; ghost = underlined mono.
- `Checkbox` (`checked`) — 32 px box, 64 px tap region, sage fill + white check when checked.
- `TextInput` / `Textarea` (`value`, `placeholder`) — 2 px outline, focus = ink border.
- `ListItem` — flexible row base (leading control/time, title, trailing chip/meta).
- `AccentDot` (`accent`) / `AccentChip` (`accent`, `label`) — single source of colour application.
- `StatusBar` (`online`, `lastSync`, `identities[]`) — online/offline + sync + identity badges.

**Data display**
- `ClockWidget` (live) · `WeatherWidget` (`current`, `days[]`) · `SensorTile` (`label`, `value`, `unit`, `state: healthy|warn|nodata`, live) · `CalendarToday` / `CalendarWeek` (`days[]` with density dots; today = amber underline) · `NoteCard` (`title`, `body`, 4-line cap) · `HAEntityToggle` (`name`, `on`) · `AlertBanner` (`title`, `detail`, rust, rare).

**Capture & navigation**
- `CaptureButton` (wall fat / phone FAB) · `CaptureSheet` (`open`, `draft`, voice/photo, save) · `InboxReviewCard` (`text`, `options[]`, `selected`, `onPick`, `onConfirm`).

**Smart home & data** (new)
- `Switch` (`on`, `disabled?`, `size?`) — pill toggle; animates on phone, instant on wall.
- `Stepper` (`value`, `step=0.5`, `min`, `max`, `unit`) — −/+ with mono value.
- `ModeSelector` (`options[]`, `selected`) — segmented; selected = ink fill.
- `LineChart` (`data:number[]`, `min`, `max`, `band?:[lo,hi]`, `markers?`) — 2 px ink polyline, optional tint band + dashed edges, hollow-ring threshold marker, filled "now" dot. SVG with `preserveAspectRatio=none` and `vector-effect=non-scaling-stroke` so strokes stay 2 px when stretched. **See geometry note below.**
- `BarChart` (`data:number[]`, `labels[]`, `highlightIndex?`) — highlighted bar = ink fill, rest = sage tint + ink border.
- `StateTimeline` (`states:bool[]`, `span`) — rust rects for on-runs on an ink baseline.
- `ClimateTile` (dash, tap → controls) · `SleepSackTile` (TOG from room-low) · `BinDayTile` (conditional, day-before) · `ClimateControl` (power + stepper + mode cluster for the popover).

---

## Interactions & Behaviour

- **Wall navigation** is full-screen swaps with **no transition** (honest to e-ink). Hold a single `screen` state; render one screen at a time; always provide a 56 px "‹ DASHBOARD" back control.
- **Climate popover** is an `open` boolean overlaying the dash inside a 4 px frame.
- **Phone** uses real motion: the capture sheet translates up over 320 ms; switches and presses animate; tab active colour swaps instantly.
- **Capture flow (phone):** FAB → sheet → type → "Save note" → (if non-empty) prepend to inbox + switch to Inbox tab. Empty draft just closes the sheet.
- **Inbox flow:** each card proposes a category (Hermes); tapping an alternative chip re-selects it (selected = tint fill); "Confirm" removes the card and increments the filed counter; empty → "Inbox zero".
- **Climate controls:** power toggle; target stepper ±0.5° clamped 10–28°; mode select; a derived status line updates from power/target/current. Room switches toggle independently.

## State Management

Per-screen reactive state (Svelte stores or component state):
- **Wall dashboard:** `screen` (`home|calendar|todos|shopping|capture`); a live `clock` tick (1 s) feeding masthead meta (week #, day-of-year), date strings.
- **Phone:** `tab` (`today|inbox`), `sheetOpen`, `draft`, `inbox: Item[]` (`{id, text, category, options[]}`), `filed: number`.
- **Climate:** `open`, `power`, `target`, `mode`, `rooms: {id,name,temp,on}[]`; chart geometry derived from a readings array `temps:number[]` + `heater:boolean[]` + `runtimeWk:number[]`.

**Data fetching (real implementation):** sensor temps, heater state, weather, calendar, and Home Assistant entity states come from live sources (HA WebSocket / REST, calendar feeds). Captured notes POST to the Hermes agent, which returns a proposed category for the inbox. The prototypes hard-code representative data — replace with stores fed by your data layer. Keep the **live vs static** distinction so the e-ink refresh layer can partial-refresh only live regions.

## Chart geometry note (LineChart)

The prototype computes points in a fixed SVG viewBox and stretches with `preserveAspectRatio="none"`, keeping strokes crisp via `vector-effect="non-scaling-stroke"`. Map a value to Y with `y = top + (max - v) / (max - min) * (bottom - top)` and X evenly across the width. The comfort band is two horizontal lines at the band temps with a tint rect between; the coldest point is `Math.min(...data)` (hollow ring + dashed drop line); the last point is the filled "now" dot. This generalises to any sensor series — pass `data`, `min`, `max`, optional `band`.

## Recreating in SvelteKit (suggested)

- `npm create svelte@latest` → SvelteKit, then add `@vite-pwa/sveltekit` for the installable PWA + share-target intent (phone capture).
- Define tokens as CSS custom properties in `app.css` (`:root { --ink:#000; --accent-sage:#7E9168; … }`) and a small `tokens.ts` mirror for chart/JS use. **No Tailwind needed**; the system is small and inline-style-friendly, but a thin set of utility classes is fine.
- Load fonts via `@fontsource` (Newsreader, Public Sans, IBM Plex Mono) or a Google Fonts `<link>`.
- Icons: `lucide-svelte`.
- One `surface` context (`'eink' | 'phone'`) gating a `transitionsEnabled` flag; bind it to route/device. Guard all `transition:`/hover behind it.
- Suggested routes: `/` (wall day dashboard with in-page screen state, or sub-routes `/calendar` `/todos` `/shopping`), `/climate`, and a phone layout group for `/today` `/inbox` + capture sheet. Choose in-page state vs routes per your e-ink refresh strategy — full-refresh swaps map cleanly to either.
- Reproduce charts as Svelte components emitting the SVG described above. Keep them pure (props in, SVG out).

## Assets

- **Fonts:** Newsreader, Public Sans, IBM Plex Mono (Google Fonts / Fontsource) — open licence.
- **Icons:** Lucide (`lucide-svelte`) — open licence. No custom icons.
- **Images:** none in the current designs (the evening "focal block" is a text quote; it could optionally host a photo — design for a 1-bit-dither-safe image if so).
- **Device chrome** (Boox bezel, phone bezel) in the prototypes is presentation scaffolding for the mockups — **do not ship it**; the real app renders full-bleed to the device screen.

## Files

In this bundle (`design_handoff_haven/`):
- `Haven - Dashboard Day.dc.html` — wall day dashboard + Calendar/To-do/Shopping/Capture sub-screens (interactive).
- `Haven - Wall Evening.dc.html` — wall evening dashboard + capture overlay.
- `Haven - Phone PWA.dc.html` — phone Today/Capture/Inbox loop (interactive).
- `Haven - Climate.dc.html` — wall climate dash + history/controls popover, sleep-sack & bin-day tiles (interactive).
- `Haven - Tokens.dc.html` — rendered token reference.
- `Haven - Components.dc.html` — component library, all states.
- `claude-design-brief.md` — the original product brief.

Open any `.dc.html` in a browser to interact with the prototype. To read logic, scroll to the `Component` class near the bottom of the file; markup is above it. `support.js` is prototype runtime — ignore for implementation.
