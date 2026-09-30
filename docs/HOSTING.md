# Hosting the web app

The web app is a static PWA in `apps/web/dist`. Any static host with HTTPS works. HTTPS is required
for install, offline use, and sharing case JSON into the app on Android.

## Option A: GitHub Pages (from this repository)

1. In GitHub, open Settings, then Pages, and set Source to GitHub Actions. Private repositories need
   a plan that includes Pages; otherwise use option B.
2. Open Settings, then Secrets and variables, then Actions, then Variables, and add `DEPLOY_PAGES`
   with the value `true`.
3. Push to `main` or run the "Deploy web app" workflow by hand. The app appears at
   `https://<user>.github.io/waymark/`.

## Option B: Cloudflare Pages

1. In the Cloudflare dashboard, create a Pages project and connect this GitHub repository.
2. Build command: `pnpm install --frozen-lockfile && pnpm --filter @waymark/web build`
3. Build output directory: `apps/web/dist`
4. Environment variable: `NODE_VERSION` = `22` (and optionally `VITE_SYNC_URL`).
5. Optionally add a custom domain such as `waymark.dhawal.org`.

## Install on Android (tested target: OnePlus 13, Chrome)

1. Open the app URL in Chrome.
2. Open Settings in Waymark and choose Install Waymark, or use Chrome's menu and choose Install app.
3. Waymark now opens from the home screen and works offline.
4. Long-press the icon for the New case and Import USCIS JSON shortcuts.
5. To import case JSON: sign in on my.uscis.gov, open
   `https://my.uscis.gov/account/case-service/api/cases/<RECEIPT>`, select all, then Share and
   choose Waymark. The import sheet opens with the text for review.
