# Claude Design Brief — Haven Household Dashboard

> Ready to paste into Claude Design. No remaining TBDs. Reference images are intentionally not attached — Claude Design picks.

## One-line

A calm, e-ink-first household second-brain dashboard that lives on a wall-mounted Boox tablet and a phone PWA, designed to be extended by AI agents over time without losing its visual coherence.

---

## 1. Context

Haven is a custom household dashboard and second-brain for our family. A 10.3-inch Boox e-ink tablet hangs on the kitchen wall and shows ambient information — calendar, weather, indoor sensors, household to-dos, shopping list, custom widgets. The same web app, in a phone-shaped variant, lives as a PWA on each adult's phone and is the primary capture surface (voice memos, quick notes, share-sheet drops).

Captured content flows into an AI agent (Hermes, Nous Research) that classifies and files into the right place. New widgets can be requested in plain language and an agent edits the codebase to add them, with the dashboard auto-reloading. The system must therefore have a clear, consistent visual language so machine-generated widgets blend in with hand-designed ones.

This is *for a home*, not a workplace. It should feel like considered furniture, not a SaaS dashboard. Calm, legible, slightly bookish, with restrained warmth from colour used as accent.

---

## 2. Surfaces

### Wall (primary): Boox Note Air 5 C (NA5C)
- 10.3″ Carta 1200 + Kaleido 3 colour e-ink
- B&W resolution: 2480 × 1860 @ 300 ppi — used for all text, line art, fine detail
- Colour resolution: 1240 × 930 @ 150 ppi — only available for colour-filled regions
- Up to 4,096 displayable colours, but rendered muted/pastel by Kaleido — never rely on saturation
- Orientation: landscape (1860 wide × 2480 long becomes 2480 wide × 1860 high)
- Touch: capacitive, finger-only
- Viewing distance: 0.5–3 m, wall-mounted at ~1.5 m
- Refresh: e-ink, supports partial refresh for live regions, full refresh on layout change
- Android 15, octa-core, 6 GB RAM — modern PWA runs fine

### Phone (secondary): PWA, iOS Safari / Android Chrome
- Width: 375–430 px portrait
- Used for: capture (voice, text, share-sheet), inbox review, list browsing, occasional widget glance
- Installed to home screen; share-target intent enabled

---

## 3. Hard constraints

### E-ink rules (non-negotiable on wall variant)
- No animation, no transitions, no fades
- No gradients, shadows, or semi-transparency
- No hover states (no pointer device)
- Minimum stroke width: 2 px
- Minimum body text: 16 px; default 20–24 px; verify at 1 m at delivery
- Pure black (#000) on pure white (#FFF) for all body text and primary lines

### Colour discipline (specific to Kaleido 3)
- Colour fills render at half resolution (150 ppi) — **never put fine detail in colour**. Text, lines, icons are always black.
- Colour saturation is muted on Kaleido — assume pastel, design accordingly. A vivid red on screen will look like a clay terracotta on the device.
- Colour is used **only for** accents: status states, calendar category dots, todo category tags, sensor warning chips, identity badges. Never as background fill on whole widgets.
- A typical screen should be ~95% black-on-white with a few well-placed colour touches.

### Touch targets
- Minimum 64 × 64 px (~28 mm at arm's length)
- Primary action buttons 80–96 px
- Checkboxes 32 px minimum, with padded 64 px tap target

### Refresh awareness
Every screen marks regions as **live** (partial refresh, e.g. clock seconds, sensor numbers) or **static** (changes only on full refresh, e.g. today's calendar, widget layout). Implementation chooses refresh mode per region. This labelling is part of the design.

### Phone PWA differences
Phone may use light animation, hover/focus states, and the same accent palette more freely. Otherwise follows the same tokens for consistency.

---

## 4. Visual direction

**Personality: Calm Almanac with restrained warm accents.**

Swiss-typographic, generous whitespace, hairline-to-modest rules, considered typography. Almost-printed-book feel — closer to *Edward Tufte / Monocle / vintage almanacs* than to any SaaS dashboard. The dashboard should feel like a thoughtful piece of printed matter that happens to update itself.

Colour role: a small palette of muted, low-saturation accents used semantically (calendar categories, status states, identity badges) over a black-on-white foundation. Colour adds warmth and recognition without breaking the printed-page calm. Imagine the spot colours used in mid-century almanacs or risograph prints — quiet, intentional, never decorative.

Anti-references — what we **don't** want:
- SaaS dashboard chrome (no cards-with-shadows, no bright chart palettes)
- Apple Health-style data overload
- Smartwatch faces (too dense, too round)
- Smart-home dashboard "tile soup"
- Anything that looks like a screen first and a surface second

---

## 5. Token system to define

### Typography
- **Suggested direction**: humanist serif for headings (Source Serif, Newsreader, Tiempos Text, Crimson Pro) paired with a precise grotesk for body and UI (Inter, Public Sans, IBM Plex Sans). Mono for timestamps and numeric data (Geist Mono, IBM Plex Mono). Claude Design may choose final families within this character.
- One weight per family unless personality permits two
- Type scale (6 sizes): `caption` 14, `body` 20, `body-lg` 24, `h3` 32, `h2` 44, `h1` 60. Verify at viewing distance on actual Boox.
- Line-height generous (1.4–1.5) for e-ink legibility.

### Colour — neutrals
- `ink` #000000 — body, primary strokes
- `ink-2` #4A4A4A — secondary info, sparingly
- `paper` #FFFFFF — base
- `paper-2` #F0F0F0 — region fill, only when essential

### Colour — accents (muted, Kaleido-aware)
Define a small semantic palette. Suggested directions — Claude Design picks final hexes that survive Kaleido rendering as muted pastels:

- `accent-sage` — soft green; meaning: *done, healthy, on track*
- `accent-amber` — warm ochre; meaning: *today, attention, in-progress*
- `accent-rust` — muted terracotta; meaning: *overdue, alert*
- `accent-sky` — pale blue; meaning: *calendar event, scheduled, external*
- `accent-stone` — warm grey-brown; meaning: *tertiary info, archived*

Rule: any single screen uses **at most three** accent colours. Most use one or two. A whole-system view should still feel ~95% black-and-white.

### Spacing scale
- Base unit 8 px. Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.

### Borders
- `thin` 1 px (sparingly), `normal` 2 px (default), `thick` 4 px (frames, hero elements)
- No rounded corners by default. Max radius 4 px where used.

### Iconography
- Line icons, thick stroke — Phosphor Bold, Lucide thick, or similar
- Always rendered in `ink`, never in colour (preserves 300 ppi crispness)
- Sizes: 20 / 32 / 48

---

## 6. Component inventory

Each component ships with: **eink** variant + **phone** variant + empty state + (if applicable) loading / error state. Mark live vs static regions. Annotate which (if any) accent token each variant uses.

### Foundation
- **WidgetFrame** — container every widget lives in. Title, optional action affordance, content area. Hairline top rule, generous internal padding.
- **ListItem** — base for todos, shopping, notes, etc.
- **Button** — primary, secondary, ghost. Sizes: default (64), large (96), inline.
- **TextInput** — chiefly for capture flows. Big, legible, generous padding.
- **Checkbox** — 32 px visible, 64 px tap region. Accent fill on checked state.
- **StatusBar** — bottom strip: online state, last-sync timestamp, identity dot (uses identity accent).
- **AccentDot** / **AccentChip** — atomic colour-coded markers used across calendar, todos, status. Single source of accent application.

### Data display
- **ClockWidget** — large time, smaller date sub-line. *Live region.*
- **WeatherWidget** — current condition + 3-day strip, location label.
- **CalendarToday** — date header + next N events with time + title. Category accent dot per event.
- **CalendarWeek** — 5–7 day strip with event density indicators.
- **SensorTile** — big number + unit + label ("21°C — Living room"). Optional accent chip if out of healthy range. *Live region.*
- **HAEntityToggle** — on/off pill with entity name + state. Accent on active state.
- **NoteCard** — markdown-rendered preview, 4-line cap, "tap to expand."
- **AlertBanner** — rare-use; uses `accent-rust`. Example: "Boiler offline since 14:02."

### Capture & navigation
- **CaptureButton** — fat primary on wall; floating action button on phone.
- **CaptureSheet** — full-screen overlay: textarea + voice button + cancel + save. Used on both surfaces.
- **InboxReviewCard** — Hermes's classification proposal with single-tap confirm or edit-and-confirm. Accent chip indicates proposed category.

### Layout
- **DashboardGrid** (eink) — widget tile system. Suggested 12-col × 8-row grid with 16 px gutter; widgets occupy rectangular spans.
- **PhoneStack** — vertical stack with safe areas and sticky bottom action bar.

---

## 7. Screens to mock

### E-ink wall (landscape, 2480 × 1860)
1. **Dashboard — day** — clock, weather, today's calendar, two sensor tiles, top-5 todos, shopping list peek, prominent "Note" capture button.
2. **Dashboard — evening** — simplified: clock, tomorrow's calendar, kids' tomorrow-prep reminders, one quiet focal block (quote / photo / nothing).
3. **Capture overlay** — triggered by tapping "Note." Big text area, mic button, cancel + save. Full-screen.

### Phone PWA (portrait, 390 × 844 reference)
4. **Today** — what's on now, what's overdue, what's been captured today, quick stats.
5. **Capture** — opened from share sheet or app icon, lands directly in note input with voice + image attach.
6. **Inbox review** — list of pending-classification items with single-tap confirm or edit-and-confirm.

---

## 8. Out of scope for this design pass

- Settings / config screens (boring admin — can be raw HTML)
- Auth screens (one-time per device, design-light)
- Per-widget configuration UI (will be CLI / Hermes conversation, not visual)
- Animations / transitions (not applicable on e-ink anyway)

---

## 9. Expected output from Claude Design

- HTML mockups for the 6 screens above, with eink + phone variants where listed
- Component library with each component shown in default + variant states (incl. accent applications)
- Token sheet (neutrals, accent palette with chosen hexes, type scale, spacing, borders, icon set choice) as a single reference page
- A handoff bundle ready for Claude Code to scaffold a SvelteKit PWA from

---

## 10. Notes for the AI

- Density preference: **medium** — enough information to be useful at a glance, not enough to feel like an airplane cockpit.
- Wife-deployable: anything on the wall should be readable by a tired parent at 7 am.
- Future-proof: new widgets will be added by an AI agent in plain language. The component system needs to be composable enough that a new widget = WidgetFrame + a content arrangement, not a bespoke new layout.
- Photos and illustrations are welcome where they fit the personality, but every pixel must work at 1-bit dither for line art and 4-bit Kaleido for colour fills — assume the e-ink panel cannot reproduce subtle gradients or anti-aliased colour edges.
- **The black-and-white version of every screen must be fully legible and usable.** Colour is meaningful but never load-bearing.
