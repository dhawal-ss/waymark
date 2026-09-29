# Roadmap

Status of the rebuild. Each phase ends with all tests passing and a review before the next starts.

## Phase 0: plan (done)

Stack, layout, data model, token approach, test strategy, and risks agreed.

## Phase 1: foundation and design system (done, in review)

- [x] pnpm monorepo, TypeScript, ESLint, Prettier, Vitest, Playwright with axe, CI workflow
- [x] Em dash lint (`pnpm lint:emdash`), commit-msg hook that strips AI attribution, pre-commit
      hook that runs `pnpm check`, `.claude/settings.json` with empty attribution
- [x] `packages/theme`: OKLCH tonal palettes pinned to CIE lightness, Material roles including
      success, light, dark, and high contrast, AA contrast tests across presets and extreme seeds,
      spring `linear()` curves with cubic-bezier fallbacks
- [x] `packages/core` start: status catalog with tones and meanings, form types, local date math
- [x] App shell: bottom bar under 840px, rail from 840px, hash router, focus management, skip
      link, footer notice, cached theme applied before first paint
- [x] Settings: theme (System, Light, Dark), high contrast, seed presets plus custom color, mask
      receipts preference
- [x] Components: filled, tonal, tertiary, outlined, and text buttons with press morph; icon
      buttons; connected button group; split button with menu; FAB menu with scrim; floating
      toolbar; sheet (bottom on mobile, dialog on wide screens); snackbar with action; filter
      chips; switch; checkbox; text field; select; wavy progress; morphing loading indicator;
      scalloped form badge; status pills; SVG line chart with tooltips, keyboard reading, and a
      table view
- [x] Design system page under Settings
- [x] Installable PWA with offline precache, self-hosted fonts, app icons

## Phase 2: feature parity with v0.2

- [ ] IndexedDB storage with schema versions and migrations; move prefs into it (keep the
      localStorage theme cache for first paint)
- [ ] Receipt parsing, prefix hints, duplicate check
- [ ] USCIS case JSON parser (all input shapes, brace scanner), event code dictionary, merge with
      new-event tracking, status derivation; fixtures for every shape and edge case
- [ ] Cases list, case detail, add and edit sheet, deadlines, notes, timeline, milestone track
- [ ] Sync flow: open the case URL, clipboard import on return, paste and file fallback
- [ ] Insights: wait bars, processing time series with CSV paste, priority date projection
- [ ] Updates: official sources with check tracking and a relevant-forms card
- [ ] Tools: priority date checker, timeline planner, fee tally, document checklists
- [ ] Settings: export, import (including v0.2 `waymark:v1` exports), delete everything with
      undo, sync status card, time zone override
- [ ] Undo on every destructive action

## Phase 3: official sync

Server on Cloudflare Workers (Hono, D1, Cron Triggers) using the USCIS Case Status API with OAuth
2.0 client credentials. Sandbox first, production after USCIS approval. Scheduled polling within
published rate limits, response hashing, changes only, same core merge logic. Optional account;
local-only stays the default. Receipt numbers encrypted at rest.

## Phase 4: public data

Daily processing time snapshots with source timestamps, quarterly form data by form and office,
Visa Bulletin parser. Charts use these with manual entry as a fallback.

## Phase 5: updates and alerts

Federal Register API and USCIS newsroom with short neutral summaries tagged by form. Email and web
push alerts with quiet hours and per-case controls.

## Phase 6: polish

Encrypted local storage, family profiles, Spanish localization, performance and accessibility
audit.

## Open items

- The v0.2 prototype source is not in this repository. The v0.2 import will follow the key list in
  the brief (`cases`, `deadlines`, `series`, `visa`, `checks`, `srcChecked`, `fees`, `prefs`) and
  tolerate missing fields. Adding the prototype and a sample export would let tests pin exact
  shapes.
- An anonymized sample of the USCIS case JSON would strengthen parser fixtures.
