# Waymark: guidance for AI agents

Waymark is a private, local-first USCIS case tracker. Read this file before changing anything.

## Non-negotiable rules

- **Authorship.** The repository owner is the only author. Never add Claude or Anthropic as author
  or co-author. No `Co-Authored-By`, `Claude-Session`, or "Generated with" lines in commits or PRs.
  Never change `git config user.name` or `user.email`. `.githooks/commit-msg` strips these lines as a
  backstop; `.claude/settings.json` disables attribution.
- **No em dashes (U+2014)** anywhere: code, comments, UI, docs, commits. `pnpm lint:emdash` fails on
  them and the commit-msg hook rejects them. Use a comma, colon, or parentheses.
- **Commits.** Short imperative messages. `pnpm check` must pass before every commit (the pre-commit
  hook runs it).
- **UI copy.** Functional and precise. Sentence case. No taglines, greetings, hype, or filler.
  Buttons name the exact action. Errors say what went wrong and how to fix it. Empty states say
  what is missing and offer the action.
- **Data.** Official public sources only. Never scrape or copy third-party trackers. Never automate
  requests against a user's signed-in USCIS session or store USCIS credentials. Never hardcode fees
  or processing times. Label demo data as demo in the UI.
- **Privacy.** Local-first. No analytics, trackers, or third-party scripts. Fonts are self-hosted.
  Export, import, and delete-everything must always work. The footer reads exactly:
  "Stored on this device only. Not legal advice. Not affiliated with USCIS."
- **Quality.** WCAG AA, visible focus, full keyboard support, `prefers-reduced-motion` respected.
  Mobile first; test at 360px wide. Initial JS under 80 KB gzipped (`pnpm size`).

## Layout

```
packages/core    Pure domain logic, no DOM, with fixtures in test/fixtures
  src/elis.ts      USCIS case JSON parser (brace scanner, allowed fields only)
  src/merge.ts     Merge imports by receipt; new-event tracking
  src/derive.ts    Status, timeline, milestones, stats, sorting, summaries
  src/events.ts    Community event code dictionary (unofficial)
  src/sanitize.ts  Validation of untrusted records
  src/transfer.ts  Export files, schema migrations, v0.2 import
  src/csv.ts, series.ts, projection.ts, receipt.ts, dates.ts, demo.ts
packages/theme   OKLCH palettes, Material color roles, contrast, spring curves
apps/web         Svelte 5 + Vite PWA
  src/lib/db.ts    IndexedDB schema versions and upgrades
  src/lib/stores   data (app data, persistence, undo), prefs, router, snackbar, ui (sheets)
  src/lib/actions.ts  Domain actions; every change goes through mutate()
  src/lib/sync.ts  Manual sync flow (open JSON tab, clipboard import, paste fallback)
  src/lib/sheets   Add or edit case, deadline, status, and import sheets
  src/lib/ui       Design system components (import each by path; no barrel file)
  src/routes       Pages; all but Cases and Settings are lazy-loaded
  src/styles       fonts.css, tokens.css (shape, type, tones), base.css
e2e/             Playwright tests with axe, run at 360px and 1280px
scripts/         setup.sh, check-emdash, check-bundle-size, icons, render-icons
docs/            ROADMAP.md, ARCHITECTURE.md
```

## Commands

```
pnpm setup        install and enable .githooks
pnpm dev          start the web app
pnpm check        em dash lint, ESLint, Prettier, typecheck, unit tests
pnpm build        production build (apps/web/dist)
pnpm size         initial JS budget check (after build)
pnpm test:e2e     Playwright + axe (builds are served with vite preview)
```

In this container, Playwright is pinned to 1.56.1 to match the preinstalled Chromium.

## Conventions

- Workspace packages export TypeScript source directly. Use explicit `.ts` extensions in relative
  imports inside `packages/*` and only erasable TypeScript syntax (no enums, no parameter
  properties), so Node can load them without a build step (Vite config imports `@waymark/theme`).
- Colors come only from role custom properties (`var(--primary)`, `var(--on-surface)`, ...). Status
  tones use the `tone-*` classes, which set `--tone-container`, `--tone-on-container`,
  `--tone-accent`.
- Shape and position animate with spring tokens (`var(--spring-fast-spatial)` with
  `var(--spring-fast-spatial-duration)`); color and opacity use `var(--ease-standard)`.
- Type classes: `t-page-title`, `t-counter`, `t-headline`, `t-title-large`, `t-title`, `t-body`,
  `t-label`, `t-small`, `t-mono`.
- Change data only through `mutate()` in `lib/stores/data.svelte.ts`. Pass `{ undo: 'Text.' }` for
  every destructive action; the snackbar then offers Undo that restores the previous snapshot.
- Structural IndexedDB changes: append a step to `UPGRADES` in `lib/db.ts` and bump `DB_VERSION`.
  Data shape changes: add `MIGRATIONS[n]` in `packages/core/src/transfer.ts` and bump
  `SCHEMA_VERSION`. Never edit a shipped step.
- Untrusted input (imports, stored data, USCIS JSON) goes through `sanitize.ts` or `elis.ts`.
- Pages render after the data store is ready, so components may seed local form state from it.
- Dates are local `YYYY-MM-DD` strings; do arithmetic with `toEpochDay` from `@waymark/core`.
  Convert USCIS instants with `localDateOf(instant, tz())` so the time zone setting applies.
- Add icons by name to `scripts/icons.mjs` and run `node scripts/icons.mjs`.

Keep this file, `README.md`, and `docs/ROADMAP.md` current as the project changes.
