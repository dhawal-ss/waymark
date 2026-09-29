# Architecture

## Principles

Local-first, typed, and tested. Domain logic is pure TypeScript in `packages/core` with no DOM, so
the web app and the Phase 3 server share one implementation of parsing, merging, and status
derivation.

## Color

`packages/theme` builds seven tonal palettes from one seed color:

- Hue and chroma come from the seed in OKLCH. Primary keeps the seed chroma (clamped), secondary is
  muted, tertiary is rotated 60 degrees, neutral and neutral variant are near gray, error and
  success use fixed hues nudged toward the seed.
- A tone is solved so that its CIE L* equals the tone number (0 to 100). Chroma is reduced by binary
  search until the color fits sRGB. Pinning tone to L* makes contrast between tones independent of
  hue, so Material's tone pairs hold AA across any seed.
- Roles map tones for light, dark, and high contrast. Tests assert contrast for every text pair,
  every surface, and outlines across the six presets and extreme seeds.
- The default theme is compiled into CSS at build time. At runtime the chosen theme is written to a
  style element on `:root[data-theme]` and cached in localStorage; an inline script in
  `index.html` applies the cache before first paint.

## Motion

Material 3 Expressive springs (damping ratio and stiffness) are sampled into CSS `linear()` easing
with a matching duration. Browsers without `linear()` get a cubic-bezier fallback through
`@supports`. `prefers-reduced-motion` collapses transitions and animations; JS-driven animation
(loading indicator, wavy progress) checks the media query and stays static.

## Web app

Svelte 5 with runes, Vite, and `vite-plugin-pwa`. A hash router keeps static hosting and offline use
simple. Components are imported by path so unused component CSS is not bundled. The design system
page is a lazy chunk.

## Data model (Phase 2)

- `LocalDate` is `YYYY-MM-DD`; `Instant` is an ISO UTC string for USCIS timestamps only.
- `Case`: id, receipt, form, owner, receivedDate, processingMonths, notes, manual entries
  (`{id, date, status, note}`, with the initial status as the first entry), and an optional USCIS
  block (last synced, updated, closed, channel, events `{code, at}`, notices, known keys, new keys).
- Current status is the newest entry across manual entries and mapped USCIS events; codes with no
  status mapping are skipped. On a tie the USCIS event wins.
- Other records: deadlines, processing time series, visa projection, source checks, fees,
  checklists, prefs.
- IndexedDB stores `cases`, `deadlines`, `series`, and `kv`, with an ordered migration list keyed by
  schema version. Exports are `{app: "waymark", schema, exportedAt, data}`; imports run a separate
  chain of data migrators, starting with v0.2 to schema 1.
- Destructive actions go through one store operation that snapshots the affected records so the
  snackbar can undo them.
