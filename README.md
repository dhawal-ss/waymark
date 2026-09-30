# Waymark

A private, ad-free USCIS case tracker. Data stays on your device.

Waymark is being rebuilt from a single-page prototype (v0.2) on a typed, tested foundation. See
[docs/ROADMAP.md](docs/ROADMAP.md) for status and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
the design.

## Privacy

- All data is stored in your browser (IndexedDB) on this device. There is no account, and the
  optional sync server is off by default. Export, share a backup, import, and delete everything
  are in Settings; the Cases page reminds you to back up after 30 days.
- Production builds ship a strict Content Security Policy; shared case JSON arrives by POST to
  the service worker and never appears in a URL.
- No analytics, trackers, or third-party scripts. Fonts are self-hosted.
- Waymark never signs in to USCIS for you and never stores USCIS credentials.
- Not legal advice. Not affiliated with USCIS.

## Development

Requirements: Node 22 or later, pnpm 10.

```sh
pnpm setup        # install dependencies and enable git hooks
pnpm dev          # http://localhost:5173
pnpm check        # lint (including the em dash check), typecheck, unit tests
pnpm build && pnpm size
pnpm test:e2e     # Playwright and axe at 360px and 1280px
```

The design system reference is at `#/settings/design` (linked from Settings in development
builds). To try the app on a phone, see [docs/HOSTING.md](docs/HOSTING.md).

## Syncing with USCIS

USCIS does not let other sites read a signed-in account, so sync is manual:

1. On a case, choose Open case JSON. Waymark opens
   `https://my.uscis.gov/account/case-service/api/cases/{RECEIPT}` in a new tab.
2. Sign in if asked, select all, and copy the page.
3. Return to Waymark and choose Import copied JSON, or use Paste JSON or a saved file. On
   Android with the app installed, you can also share the text or a saved JSON file to Waymark.

Waymark keeps only events, notices, dates, form type, and channel. Event code meanings are
community documented and shown as unofficial.

### Optional server sync

A Waymark sync server can check the cases you choose with the official USCIS Case Status API
about twice a day. It is off by default. When on, only the receipt numbers of tracked cases leave
the device; the server stores them encrypted and keeps results only when they change. See
[docs/DEPLOY.md](docs/DEPLOY.md) to run one. Until USCIS approves production access, the server
uses the sandbox, which has test data only.

### Optional public data

With public data turned on in Settings, Insights can follow official processing times from
egov.uscis.gov, load Visa Bulletin cutoffs from travel.state.gov, and chart quarterly USCIS form
data. The sync server collects these once a day; requests from the app name only the form or
category being viewed. Manual entry always works without it.

## Structure

| Path             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `packages/core`  | Domain logic with no DOM: parsing, merge, status, projections, I/O  |
| `packages/theme` | Material 3 color roles from one seed in OKLCH, contrast, springs    |
| `apps/web`       | Svelte 5 PWA: design system, app shell, pages                       |
| `apps/server`    | Optional sync server: Cloudflare Workers, D1, USCIS Case Status API |
| `e2e`            | Playwright end-to-end and accessibility tests                       |
| `scripts`        | Setup, em dash lint, bundle budget, icon generation                 |

## Credits

- Roboto Flex and JetBrains Mono, SIL Open Font License 1.1 (`apps/web/public/fonts`).
- Material Symbols icon paths, Apache License 2.0.
