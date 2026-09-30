# Deploying the sync server

The sync server (`apps/server`) is optional. The web app works fully without it. It runs on
Cloudflare Workers with D1 and a Cron Trigger, and checks receipts with the official USCIS Case
Status API.

## Easiest: deploy from GitHub Actions

The Deploy web app workflow (`.github/workflows/pages.yml`) deploys the server before the web app
when these repository secrets exist (Settings, Secrets and variables, Actions, New repository
secret):

| Secret                  | Where to get it                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, Workers and Pages, Account details                                                            |
| `CLOUDFLARE_API_TOKEN`  | My Profile, API Tokens, Create Token, "Edit Cloudflare Workers" template, then add the permission Account, D1, Edit |
| `USCIS_CLIENT_ID`       | developer.uscis.gov, your app, Consumer key                                                                         |
| `USCIS_CLIENT_SECRET`   | developer.uscis.gov, your app, Consumer secret                                                                      |

Then run the workflow (Actions, Deploy web app, Run workflow) or push to the default branch. It
finds or creates the D1 database, applies migrations, deploys the Worker with
`ALLOWED_ORIGINS=https://<owner>.github.io`, creates the receipt keys and admin token once (they
are never replaced), and builds the web app with the Worker's workers.dev address, so automatic
checks are on for everyone who opens the app. Open Workers and Pages once in the Cloudflare
dashboard first so the account has a workers.dev subdomain.

Optional repository variables: `USCIS_BASE_URL` (the production base URL once USCIS approves it),
`APP_ORIGINS` (comma-separated, when the app is served from another origin), and `VITE_SYNC_URL`
(to point the app at a different server).

The manual steps below do the same from your own machine.

## Before you start

- A USCIS developer account with an approved app and the Case Status API product enabled. Start
  with the sandbox product; production needs separate approval from USCIS.
- A Cloudflare account and `pnpm install` done in this repository.
- Never commit credentials. They live only in Cloudflare secrets (or `.dev.vars` locally, which is
  ignored by git).

## 1. Check your USCIS credentials

Run this on your own machine, with credentials only in the environment:

```sh
USCIS_CLIENT_ID=... USCIS_CLIENT_SECRET=... pnpm --filter @waymark/server sandbox:check EAC9999103402
```

It requests a token from `https://api-int.uscis.gov/oauth/accesstoken`, fetches one case from
`/case-status/{receipt}`, and prints what Waymark keeps. Use a sandbox test receipt from the USCIS
developer portal. If Waymark cannot read the response, the script prints the top-level keys so the
adapter in `packages/core/src/official.ts` can be adjusted.

## 2. Create the database

```sh
cd apps/server
pnpm exec wrangler login
pnpm exec wrangler d1 create waymark
```

Put the printed `database_id` in `wrangler.toml`, then apply the schema:

```sh
pnpm db:migrate:remote
```

## 3. Set secrets

```sh
pnpm exec wrangler secret put USCIS_CLIENT_ID
pnpm exec wrangler secret put USCIS_CLIENT_SECRET
openssl rand -base64 32 | pnpm exec wrangler secret put RECEIPT_ENC_KEY
openssl rand -base64 32 | pnpm exec wrangler secret put RECEIPT_HMAC_KEY
```

Keep a copy of the two receipt keys in a password manager. Losing `RECEIPT_ENC_KEY` makes stored
receipts unreadable; users would need to track their cases again.

## 4. Configure and deploy

In `wrangler.toml`, set `ALLOWED_ORIGINS` to the web app origins, for example
`https://dhawal.org`. Leave `USCIS_BASE_URL` on the sandbox until USCIS approves production.

```sh
pnpm deploy
```

Build the web app with the server address so users do not need to type it:

```sh
VITE_SYNC_URL=https://waymark-sync.<your-subdomain>.workers.dev pnpm build
```

## Limits and quota

- The Case Status API allows 5 requests per second and 1,000 per day. The server waits 220 ms
  between calls and keeps 10% of the daily quota for new subscriptions and manual refreshes.
- Each receipt is checked every `POLL_INTERVAL_HOURS` (default 12), so about 450 receipts fit in
  the daily quota. `MAX_RECEIPTS_PER_ACCOUNT` (default 10) and `MAX_ACCOUNTS` (default 500) cap
  usage. Receipts that keep failing back off to at most 16 times the interval.
- Manual refresh is limited to once per hour per receipt, and the limit holds when a receipt is
  deleted and added again. Each account gets 20 checks outside the schedule (new receipts and
  refreshes) per UTC day. Healthy receipts are checked before failing ones.
- New accounts are rate limited per client IP by the `ACCOUNT_LIMITER` binding in
  `wrangler.toml` (5 per minute). The IP is used only for that check and is never stored. Remove
  the `[[ratelimits]]` block if your account does not offer Workers Rate Limiting.
- Errors shown to users are fixed messages. USCIS response text and credential problems go only
  to the Worker logs.

## What the server stores

| Table           | Contents                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `accounts`      | Random id, SHA-256 of the sync key, created and last seen times                |
| `receipts`      | HMAC of the receipt (lookup), AES-GCM encrypted receipt, check times, errors   |
| `subscriptions` | Which account tracks which receipt                                             |
| `snapshots`     | Encrypted normalized result, stored only when it changes (last 50 per receipt) |
| `usage`         | API calls per UTC day, and each account's on-demand checks for the day         |
| `recent_checks` | HMAC and last check time of receipts nobody tracks, kept for the cooldown only |

No names, emails, notes, or USCIS account credentials. Accounts unused for 180 days are deleted
with their subscriptions; receipts nobody tracks are deleted with their snapshots.

## Public data

The same server collects official public data once a day (Cron `17 13 * * *`) and serves it to
apps that turn on public data. Set `PUBLIC_DATA_ENABLED = "false"` in `wrangler.toml` to turn it
off. The job fetches one page per second.

| Dataset          | Source                                         | How it gets in                          |
| ---------------- | ---------------------------------------------- | --------------------------------------- |
| Processing times | egov.uscis.gov/processing-times (page data)    | Daily, for the targets you configure    |
| Visa Bulletin    | travel.state.gov bulletin pages                | Daily: next and current month, backfill |
| Form data        | uscis.gov quarterly form data files (XLSX/CSV) | You import each quarterly file          |

Set an admin token first:

```sh
openssl rand -base64 32 | pnpm exec wrangler secret put ADMIN_TOKEN
```

### Check the official pages

The processing times page data is public but not documented, so check it before relying on it:

```sh
pnpm --filter @waymark/server data:check I-485 NBC 134A
```

It fetches the current Visa Bulletin and one processing time page and prints what Waymark reads.
Form, office, and subtype codes are the ones the egov.uscis.gov processing times page uses in its
requests for that selection. If the script reports no range, send the printed top-level keys so the
parser in `packages/core/src/public/processingTimes.ts` can be adjusted.

### Choose processing time targets

```sh
curl -X POST "$SERVER/v1/admin/pt-targets" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"targets":[{"form":"I-485","office":"NBC","subtype":"134A","label":"Family-based adjustment"}]}'
```

Each target is checked once a day. A new row is stored only when USCIS publishes a new date or
value; otherwise the existing row's last seen time moves forward.

### Import quarterly form data

Download the quarterly file from uscis.gov (Immigration and Citizenship Data), then:

```sh
ADMIN_TOKEN=... pnpm --filter @waymark/server forms:import ~/Downloads/file.xlsx \
  --quarter "FY2026 Q3" --source "https://www.uscis.gov/..." --server "$SERVER"
```

Without `--server` the script prints the normalized JSON so you can review it first. Use `--sheet`
when the form table is not on the first sheet. Values USCIS withholds ("D") are stored as empty.

### News feed

The daily job also collects official news for the app's Updates feed. It reads two kinds of source:

- **Federal Register**: documents that USCIS publishes (rules, proposed rules, notices), from the
  Federal Register API. On by default; no setup.
- **USCIS feeds**: RSS or Atom feeds you choose. None are listed by default because Waymark does not
  guess feed addresses. USCIS lists its feeds on its newsroom pages (news releases, alerts, and forms
  updates); copy the RSS links from those pages into `USCIS_FEED_URLS` in `wrangler.toml`, comma
  separated, then push or run `pnpm deploy`. Only https addresses on `uscis.gov` are accepted; others
  are ignored.

| Variable                    | Default                           | Meaning                                                                    |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `NEWS_ENABLED`              | follows `PUBLIC_DATA_ENABLED`     | `"false"` turns the news job off; `"true"` keeps it on without public data |
| `FEDERAL_REGISTER_BASE_URL` | `https://www.federalregister.gov` | Must be https                                                              |
| `USCIS_FEED_URLS`           | empty                             | USCIS feed addresses, comma separated                                      |

Apply the new migration before deploying (`pnpm db:migrate:remote`; the GitHub Actions deploy does it
for you). Then check the sources on your own machine and run the job once:

```sh
USCIS_FEED_URLS="https://www.uscis.gov/..." pnpm --filter @waymark/server data:check
curl -X POST "$SERVER/v1/admin/run?job=news" -H "Authorization: Bearer $ADMIN_TOKEN"
curl "$SERVER/v1/public/news?limit=5"
```

`data:check` prints how many items each source gives, a sample, and anything it skipped. The run
returns `sources`, `failed`, `items`, `added`, `skipped`, and one line per failed source in `errors`.

- A source that fails is reported and does not stop the others. `GET /v1/public/status` shows an
  error for `news` only when every source failed.
- Each item keeps its title, a summary cut from the source text (never written by Waymark), its link
  and date, a category chosen by fixed keyword rules, and the form numbers found in the title or
  summary. The newest 500 items by publication date are kept.
- `GET /v1/public/news` takes `limit` (1 to 100, default 40), `before` (a date, exclusive),
  `category`, and `form` (for example `I-485`), and answers `{ "items": [...] }` newest first.
  `before` pages by date, so items that share the last date of a page can fall between pages.

### Run a job now

```sh
curl -X POST "$SERVER/v1/admin/run?job=visa-bulletin" -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X POST "$SERVER/v1/admin/run?job=processing-times" -H "Authorization: Bearer $ADMIN_TOKEN"
```

`GET /v1/public/status` shows when each dataset last updated and the last error.

## Moving to production

1. Request production access for the Case Status API in the USCIS developer portal.
2. When approved, set `USCIS_BASE_URL` to the production base URL USCIS gives you, and update the
   client id and secret if USCIS issues new ones.
3. Deploy. `/v1/health` then reports `"environment": "production"` and the app stops showing the
   sandbox notice.
