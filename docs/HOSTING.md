# Hosting the web app

The web app is a static PWA in `apps/web/dist`. Any static host with HTTPS works. HTTPS is required
for install, offline use, and sharing case JSON into the app on Android.

## Option A: GitHub Pages (from this repository)

1. In GitHub, open Settings, then Pages, and set Source to GitHub Actions. Private repositories need
   a plan that includes Pages; otherwise use option B.
2. Push to the default branch or run the "Deploy web app" workflow by hand. The app appears at
   `https://<user>.github.io/waymark/`. Pushes to other branches build nothing, because GitHub Pages
   accepts deploys only from the default branch.
3. To stop deploying, add the repository variable `DEPLOY_PAGES` with the value `false` (Settings,
   Secrets and variables, Actions, Variables).

## Option B: Cloudflare Pages

1. In the Cloudflare dashboard, create a Pages project and connect this GitHub repository.
2. Build command: `pnpm install --frozen-lockfile && pnpm --filter @waymark/web build`
3. Build output directory: `apps/web/dist`
4. Environment variable: `NODE_VERSION` = `22` (and optionally `VITE_SYNC_URL`).
5. Optionally add a custom domain such as `waymark.dhawal.org`.

Cloudflare Pages also applies `apps/web/public/_headers`: it blocks framing and content sniffing
and sends no referrer. GitHub Pages cannot set headers; the app's Content Security Policy meta tag
still applies there.

## Install on Android (tested target: OnePlus 13, Chrome)

1. Open the app URL in Chrome.
2. Open Settings in Waymark and choose Install Waymark, or use Chrome's menu and choose Install app.
3. Waymark now opens from the home screen and works offline.
4. Long-press the icon for the New case and Import USCIS JSON shortcuts.
5. To import case JSON: on a case, choose Open case JSON (sign in on my.uscis.gov if asked).
   Select all, then either:
   - choose Share in the selection menu and pick Waymark (the import sheet opens with the text
     for review), or
   - choose Copy, come back to Waymark, and tap Import copied JSON on the case.
     A JSON file saved from my.uscis.gov can also be shared to Waymark from the Files app.

## What to check on the phone

- Install from the card on Cases or from Settings, then open from the home screen with no
  connection.
- Add a case (the keyboard opens on the receipt field; the Add case button stays above the
  keyboard).
- Import case JSON by sharing and by Import copied JSON.
- Quick statuses: pick one from the menu next to Log a status. It logs at once and offers Undo.
  Pick Evidence requested to add a response deadline.
- Deadlines: open one and choose Open in Google Calendar, or Download .ics file.
- Share summary opens the Android share sheet.
- Settings, Data: Share backup can save to Google Drive.
- Long-press the home screen icon for shortcuts.
- Try dark mode and a larger system font size.
