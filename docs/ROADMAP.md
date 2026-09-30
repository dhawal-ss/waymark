# Roadmap

Status of the rebuild. Each phase ends with all tests passing and a review before the next starts.

## Phase 0: plan (done)

Stack, layout, data model, token approach, test strategy, and risks agreed.

## Phase 1: foundation and design system (done)

Tooling, lint (including the em dash check), hooks, attribution settings, `packages/theme`, app
shell, design system components, style guide page, PWA.

## Phase 2: feature parity with v0.2 (done, in review)

- [x] IndexedDB storage with versioned upgrades, data schema version with migrations, prefs stored
      with the data and mirrored to localStorage for first paint, cross-tab reload, persistent
      storage request
- [x] Undo on every destructive action (snapshot based)
- [x] Receipt normalization, validation, duplicate check, prefix hints
- [x] USCIS case JSON parser: bare object, `{data}`, arrays, `{cases}`, objects back to back,
      braces in strings, cut-off input, alternate field names; allowed fields only
- [x] Event code dictionary (labeled unofficial), merge by receipt with new-event tracking, status
      from the newest mapped event, same-day tie goes to USCIS
- [x] Cases list: summary line, cards, sorting by tone then days, deadlines, FAB menu, empty state,
      example data labeled demo, v0.2 data offer
- [x] Case detail: tinted hero, split button with quick statuses, USCIS data card, stats, milestone
      track, meaning and next cards, notices, where you sit, merged timeline, deadlines, autosaving
      notes, floating toolbar (edit, add deadline, copy summary, delete)
- [x] Sync flow: open the JSON tab, snackbar on return, clipboard import, paste and file fallback
      with plain errors
- [x] Insights: wait bars, processing time series (chips, range, chart, table, change summary, add
      point, CSV paste, delete), priority date projection with regression and caveats
- [x] Updates: official sources, group chips, mark as checked, relevant forms
- [x] Tools: priority date checker, timeline planner, fee tally, document checklists
- [x] Settings: export, import (exports and v0.2), delete everything, time zone override, sync status
- [x] Parser, merge, derivation, CSV, projection, migration, and storage tests; e2e flows with axe

Known limits:

- The v0.2 importer accepts the field names v0.2 most likely used; the prototype source was not
  available to confirm them.
- Clipboard import depends on the browser: Chromium asks for permission, Safari and Firefox show a
  paste prompt. The paste sheet always works.
- End-to-end tests run in Chromium only.
- Delete everything keeps display settings (theme, color, contrast, masking, time zone).

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

- The v0.2 prototype source is not in this repository. Adding it and a sample export would let
  tests pin the exact v0.2 shapes.
- An anonymized sample of the USCIS case JSON would strengthen parser fixtures.
