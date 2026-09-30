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

## Data model

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
- Every change goes through `mutate()`, which applies it to the in-memory state and writes the whole
  data set to IndexedDB in one transaction. Destructive changes snapshot the data first so the
  snackbar can undo them. Data sets are small (dozens of cases), so full writes stay fast and keep
  the stores consistent.
- Other tabs get a BroadcastChannel message after each save and reload from IndexedDB. When another
  tab needs to upgrade or delete the database, this tab closes its connection and asks for a reload.

## Automatic checks (server sync)

- Add case asks only for the receipt number. With a server address known (built in with
  `VITE_SYNC_URL`, or entered in Settings) and automatic checks not turned off, the app creates an
  anonymous account on first use, subscribes the receipt, and adds the case from the result.
  Every open, non-example case is subscribed at each pull. Without a result, the add sheet falls
  back to the case page flow in `sync.svelte.ts`.

- `apps/server` is a Hono app on Cloudflare Workers with D1. A Cron Trigger runs `pollDue` every
  30 minutes: it picks receipts not checked within the poll interval (oldest first, failing ones
  backed off), stays under the daily quota minus a 10% reserve, waits 220 ms between calls, and
  stops on rate limiting or credential errors.
- The USCIS client uses OAuth 2.0 client credentials and reuses the token until a minute before it
  expires, renewing once on a 401.
- Each response goes through `parseCaseStatusResponse` in core. The server hashes a canonical form
  and stores an encrypted snapshot only when the hash changes.
- Accounts are anonymous: the client holds a random sync key; the server stores its SHA-256.
  Receipts are stored AES-GCM encrypted with a keyed HMAC for lookup, so the database alone does
  not reveal receipt numbers.
- The web app pulls `/v1/updates?after=<cursor>` and merges results for local cases with
  `mergeImport`. Official events carry status text and use `CS:` codes, so they sit in the same
  timeline as ELIS events from manual imports.

## Public data (optional)

- Parsers live in `packages/core/src/public` and have no DOM dependency, so they run in the Worker,
  in Node scripts, and in tests. The Visa Bulletin parser reads tables with a small HTML table
  extractor and decides the chart from the uppercase section heading before each table.
- The daily job stores processing times as one row per distinct published value; unchanged checks
  only move `last_seen_at`. Visa Bulletin months are replaced as a whole when fetched. Quarterly
  form data is imported by a maintainer from the official files.
- The app opts in through a preference. Linked series and cutoffs carry a `source` and are replaced
  from the server when Insights opens; unlinking keeps the values and makes them editable.

## USCIS import

- `parseUscisJson` tries `JSON.parse`, then falls back to a brace scanner that finds top-level
  objects and ignores braces inside strings. It unwraps `data`, `cases`, and arrays, keeps only the
  allowed fields, normalizes receipts, forms, and timestamps (offset-less times are treated as UTC),
  and reports problems in plain language.
- `mergeImport` merges by receipt. The event key is `code|timestamp`. The first import into a case
  marks nothing new; later imports mark unseen keys new until the user marks them seen. Missing
  cases are created with the filing date taken from the submission time in the user's zone.
- The sync flow opens the JSON in a new tab (the endpoint needs the user's session and cannot be
  fetched cross-origin). When the page becomes visible again, a snackbar offers Import, which reads
  the clipboard inside that user gesture. Any failure opens the paste sheet with the reason.
