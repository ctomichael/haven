// Design tokens — JS mirror of the CSS custom properties in app.css.
// Use for chart math and other places CSS variables can't reach.
// Source of truth for visual design: design/design_handoff_haven/README.md.

export const colors = {
  ink: '#000000',
  ink2: '#4A4A4A',
  paper: '#FFFFFF',
  paper2: '#F0F0F0',
  hairline: '#ECECEC',
  hairline2: '#E2E2E2',
  disabled: '#C8C2B8',
  mutedMono: '#8C8275',
} as const;

export const accents = {
  sage:  { solid: '#7E9168', tint: '#DDE5D4' },
  amber: { solid: '#B98A3E', tint: '#EFE3C8' },
  rust:  { solid: '#A85C42', tint: '#ECD9D0' },
  sky:   { solid: '#6E8AA8', tint: '#D7E0E9' },
  stone: { solid: '#8C8275', tint: '#E4DDD2' },
} as const;

export type Accent = keyof typeof accents;

export const space = {
  '4':  4,
  '8':  8,
  '12': 12,
  '16': 16,
  '24': 24,
  '32': 32,
  '48': 48,
  '64': 64,
  '96': 96,
} as const;

export const borders = {
  thin: 1,
  normal: 2,
  thick: 4,
} as const;

export const type = {
  caption:  { size: 14, lh: 1.4,  family: 'Public Sans', weight: 600, tracking: '0.16em', case: 'uppercase' as const },
  body:     { size: 20, lh: 1.5,  family: 'Public Sans', weight: 400 },
  bodyLg:   { size: 24, lh: 1.45, family: 'Public Sans', weight: 400 },
  h3:       { size: 32, lh: 1.2,  family: 'Newsreader',  weight: 500 },
  h2:       { size: 44, lh: 1.1,  family: 'Newsreader',  weight: 500 },
  h1:       { size: 60, lh: 1.05, family: 'Newsreader',  weight: 500 },
} as const;
