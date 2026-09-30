# Deploying the sync server

The sync server (`apps/server`) is optional. The web app works fully without it. It runs on
Cloudflare Workers with D1 and a Cron Trigger, and checks receipts with the official USCIS Case
Status API.

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
- Manual refresh is limited to once per hour per receipt.

## What the server stores

| Table           | Contents                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| `accounts`      | Random id, SHA-256 of the sync key, created and last seen times                |
| `receipts`      | HMAC of the receipt (lookup), AES-GCM encrypted receipt, check times, errors   |
| `subscriptions` | Which account tracks which receipt                                             |
| `snapshots`     | Encrypted normalized result, stored only when it changes (last 50 per receipt) |
| `usage`         | API calls per UTC day                                                          |

No names, emails, notes, or USCIS account credentials. Accounts unused for 180 days are deleted
with their subscriptions; receipts nobody tracks are deleted with their snapshots.

## Moving to production

1. Request production access for the Case Status API in the USCIS developer portal.
2. When approved, set `USCIS_BASE_URL` to the production base URL USCIS gives you, and update the
   client id and secret if USCIS issues new ones.
3. Deploy. `/v1/health` then reports `"environment": "production"` and the app stops showing the
   sandbox notice.
