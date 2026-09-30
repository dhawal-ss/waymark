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
      notes, floating toolbar (edit, add deadline, share summary; delete is in the edit sheet)
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
- Delete everything keeps display settings (theme, color, contrast, masking, time zone) and the
  sync server address.

## Phase 3: official sync (done, in review)

- [x] Core adapter for Case Status API responses: status text to status, "CS:" events with text,
      merged through the same `mergeImport` as manual imports; data schema 2 with migration
- [x] Server on Cloudflare Workers with Hono, D1, and a Cron Trigger every 30 minutes
- [x] OAuth 2.0 client credentials with token caching and renewal; sandbox base URL by default
- [x] Polling within 5 requests per second and the daily quota, with a reserve, backoff for
      failing receipts, and a batch cap per run
- [x] SHA-256 of a canonical result; snapshots stored only on change (last 50 per receipt)
- [x] Anonymous accounts (random sync key, only its hash stored), receipts per account cap,
      account cap, inactive account cleanup, garbage collection of untracked receipts
- [x] Receipt numbers and results encrypted at rest (AES-GCM), HMAC lookup, secrets in
      environment variables only
- [x] Web: server sync off by default, per-case tracking, updates pulled every 30 minutes while
      open, sync key copy and reuse, turn off deletes server data, sync key never exported
- [x] Sandbox check script, deploy guide, server tests on the real SQL, e2e with a fake server

Not done, needs you:

- Deploy: create the D1 database, set secrets, and deploy (docs/DEPLOY.md). This container cannot
  reach Cloudflare or api-int.uscis.gov.
- Run `sandbox:check` once with your credentials to confirm the response shape against the
  adapter. The adapter follows the documented fields (`case_status`, `receiptNumber`, `formType`,
  `submittedDate`, `modifiedDate`, `current_case_status_text_en`, `hist_case_status`).
- Request production access from USCIS when ready.

## Phase 4: public data (done, in review)

- [x] Core parsers: Visa Bulletin HTML (final action and dates for filing, family and employment,
      C and U, category and country normalization), processing time page data (tolerant of
      nesting, units to months, publication dates), quarterly form data (header detection, merged
      cells, totals skipped, withheld values empty), fiscal quarter helpers
- [x] Server: D1 tables for processing times (a row per published value, last seen moved daily),
      Visa Bulletin cells, form statistics, and dataset run status; daily Cron job, one page per
      second; public read endpoints with caching; admin API for targets, imports, and manual runs
- [x] XLSX reader with no dependencies, `forms:import` and `data:check` scripts
- [x] Web: public data off by default; series linked to USCIS processing times refresh when
      Insights opens; Visa Bulletin cutoffs load into the projection; quarterly form data panel
      with chart and table; manual entry stays available; data schema 3 with migration

Not done, needs you:

- Run `data:check` on your machine to confirm the processing times page data and a live Visa
  Bulletin parse. Both parsers were built from the page layouts and tested on synthetic fixtures,
  because this container cannot reach uscis.gov or travel.state.gov.
- Choose processing time targets (form, office, subtype codes) and import the quarterly form data
  files you want (docs/DEPLOY.md).

## Phone readiness and audit fixes (done, in review)

Android features:

- [x] Install on the home screen, from Settings or a one-time card on Cases.
- [x] Share target: share copied case JSON, or a saved JSON file, from Chrome to Waymark. It
      arrives by POST to the service worker, so the case data never appears in a URL.
- [x] App shortcuts: New case and Import USCIS JSON.
- [x] Calendar: an .ics export for deadlines, plus an Open in Google Calendar link on each
      deadline.
- [x] Appointments from notices can be added as deadlines.
- [x] Copy receipt. Share summary uses the system share sheet.
- [x] Backups: share a backup file to Drive or Files, and a reminder after 30 days.

Case tracking:

- [x] Quick statuses log today at once, with Undo.
- [x] Evidence requests and intents to deny ask for a response due date and add a deadline.
- [x] Cases can be searched. Closed cases are grouped at the end, including cases USCIS closed
      without a decision.
- [x] The summary leads with new USCIS events and overdue deadlines. Cards show each case's next
      deadline.
- [x] The case page flow keeps an Import copied page button on the case for 30 minutes.
- [x] Add case asks only for the receipt number. Automatic checks look it up with the official
      API; otherwise the copied case page is imported by itself on return (once clipboard access
      is allowed), when pasted into the receipt field, or when shared. Typed details are the last
      resort.
- [x] Automatic checks are on when a server address is known, track every open case (never
      example cases), and can be turned off in Settings.
- [x] The GitHub Pages workflow deploys the sync server to Cloudflare when its secrets are set,
      and builds the app with its address.
- [x] A labeled Add case button stays on the Cases page, so adding the second and later cases is
      one tap. Importing a saved case file starts from the add sheet.
- [x] Typed details start empty (no guessed form or date). Closing the sheet during a check
      cancels it. Coming back imports only the case the user went to get.
- [x] Settings saved before automatic checks existed keep them off; an address entered for public
      data alone does not turn them on. The deploy smoke-tests the server with a sandbox receipt.
- [x] A change made right before the app closes is kept (a copy per tab while the write is
      pending).

Reliability:

- [x] Undo reverts only its own action; later changes are kept.
- [x] Data that fails to load is never saved over.
- [x] Server responses are validated like imports. Imports get fresh ids when ids repeat, text
      length caps, and duplicate events removed.
- [x] Official status text: expedite, fee waiver, and reschedule requests no longer change the
      case status.
- [x] Mixing the USCIS JSON and the Case Status API no longer flags the whole history as new.
- [x] Delete everything asks for confirmation, removes the v0.2 copy, and reports when the server
      could not delete its data.

Mobile layout:

- [x] Menus fit the screen.
- [x] The snackbar moves floating buttons up instead of covering them.
- [x] The footer stays clear of floating buttons.
- [x] The keyboard resizes the page, so sheet actions stay reachable.
- [x] Hover tints apply only on devices that can hover.
- [x] Receipts use a slashed zero and do not break across lines.

Server:

- [x] Backoff happens in SQL, and healthy receipts are checked before failing ones.
- [x] One bad row no longer stops polling.
- [x] The refresh cooldown survives deleting a receipt and adding it again.
- [x] The receipt limit is atomic.
- [x] Each account gets a daily budget of on-demand checks.
- [x] Optional rate limiting on account creation.
- [x] Account responses are sent with `no-store`.
- [x] Only fixed error messages are stored.
- [x] Subscribers do not see checks made for other accounts.
- [x] Retries count against the quota.

Web:

- [x] Production builds ship a Content Security Policy with hashes of the inline scripts.
- [x] An opt-in GitHub Pages deploy (docs/HOSTING.md).

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
