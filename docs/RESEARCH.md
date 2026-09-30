# Research: other USCIS trackers and the developer portal

Purpose: decide what Waymark adopts, skips, and does differently. Nothing here was copied from
another tracker, and Waymark never uses their data or code.

## Method and limits

Direct access to uscis-tracker.github.io, usciscasetracker.com, and developer.uscis.gov was blocked
by this environment's network policy, so this summary uses the public descriptions of those
products that search results and store listings show (their GitHub description, app store text, and
page summaries). Marketing claims are marked as claims. Re-check the live pages before relying on
any detail.

## What the others offer

**uscis-tracker.github.io** (open source, single page, browser only)

- Input: the user pastes JSON from their own signed-in USCIS case page, or uploads a JSON file.
- Output: a stat bar, case details, the official notices list, an event timeline with decoded event
  codes, and a case summary with analysis. Data stays on the device.
- Strength: it reads the detailed event history, which the public API does not return.
- Weakness: every case starts with a manual copy step, and there are no alerts.

**usciscasetracker.com** (apps and site)

- Tracks USCIS, EOIR (immigration court), and NVC cases.
- Case analytics to estimate processing times, push notifications on status changes, hearing
  reminders, and quick access to Visa Bulletins.
- Automatic daily checks are a paid feature; free users refresh by hand. It claims more in-depth case
  histories than other apps (a claim, not verified here).
- Strength: alerts and multi-agency coverage. Weakness: paid tier for automatic checks, accounts.

Other apps in store listings add a citizenship civics quiz, an AI assistant, and range search over
receipt numbers. Those are noted, and not planned (see decisions).

## Waymark today

| Area                  | Waymark                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Input to add a case   | Receipt number only                                                                                         |
| Source of details     | Official Case Status API (automatic), else the case page the user copies                                    |
| Event decoding        | Community code dictionary, labeled unofficial. Plain-language explanations of each event are in development |
| Notices and deadlines | Notices list, appointment to deadline, calendar export                                                      |
| Processing times      | Official egov.uscis.gov series, linked to the case, with projection                                         |
| Visa Bulletin         | Official cutoffs feed the priority date projection                                                          |
| Official news         | In development: Federal Register and USCIS feeds in a vertical feed, tagged by form                         |
| Privacy               | Local first, no accounts, no analytics, export and delete everything                                        |
| Price                 | Free, no ads                                                                                                |

## Decisions

- Adopt: decoded event timeline (uscis-tracker), automatic checks (usciscasetracker), Visa Bulletin
  and processing time context, news tied to the user's forms.
- Go further: explain silent background events in plain language, a stage journey chart, and a
  news feed that highlights items for the user's own forms without telling the server which forms.
- Not planned: AI assistant (would send case data to a model), civics quiz (out of scope),
  scraping or reusing other trackers' community data (official sources only), EOIR and NVC (no
  official public API found; revisit if one is published).
- Still to do: push alerts and quiet hours (Phase 5), Spanish localization (Phase 6).

## Hard limit: what a receipt number alone can return

The official Case Status API returns the status text, form type, submitted and modified dates, and
the status history for a receipt number. It does not return the detailed event codes or the
notices list. Those exist only in a signed-in USCIS session. Waymark does not automate a signed-in
session and does not store USCIS credentials, so the detailed timeline always needs one copy step
from the user (the app imports it automatically on return). Everything else Waymark can show from
the receipt number alone comes from the official API and other official public data.

## USCIS developer portal

Steps and production access requirements are in [DEPLOY.md](DEPLOY.md), sections 0 and "Moving to
production".
