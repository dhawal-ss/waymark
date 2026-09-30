import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fakeSyncServer, officialCase, SYNC_URL } from './fake-sync-server';
import { expectNoAxeViolations, loadExample, snackbar } from './helpers';

const RECEIPT = 'MSC0000000003';
// Recent dates, so official events are newer than the example case's manual entries.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const RECEIVED = daysAgo(400);
const APPROVED = daysAgo(2);
const approved = officialCase(RECEIPT, [
  ['Case Was Received', RECEIVED],
  ['Case Was Approved', APPROVED],
]);

async function turnOn(page: import('@playwright/test').Page) {
  await page.goto('./#/settings');
  await page.getByLabel('Sync server address').fill(SYNC_URL);
  await page.getByRole('button', { name: 'Turn on server sync' }).click();
  await expect(page.getByText(/^On\. Server/)).toBeVisible();
}

test('is off by default and explains what it sends', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(
    page.getByText('Off. Cases update only when you import the case JSON yourself.'),
  ).toBeVisible();
  await expect(page.getByText(/sends the receipt numbers of the cases you choose/)).toBeVisible();
});

test('rejects insecure addresses and reports an unreachable server', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByLabel('Sync server address').fill('http://sync.example.org');
  await page.getByRole('button', { name: 'Turn on server sync' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Enter the server address starting with https://.',
  );

  await page.route('https://down.test/**', (route) => route.abort());
  await page.getByLabel('Sync server address').fill('https://down.test');
  await page.getByRole('button', { name: 'Turn on server sync' }).click();
  await expect(page.getByRole('alert')).toContainText('The sync server did not respond');
});

test('tracks a case, merges official results, pulls changes, and turns off', async ({ page }) => {
  const server = await fakeSyncServer(page, { cases: { [RECEIPT]: approved } });
  await loadExample(page);
  await turnOn(page);
  await expect(page.getByText(/Sandbox: the USCIS sandbox has test data only/)).toBeVisible();

  await page.goto('./#/cases');
  await page.locator('a.card', { hasText: RECEIPT }).click();
  await page.getByRole('switch', { name: 'Track with the official USCIS API' }).check();
  await expect(snackbar(page, `Tracking ${RECEIPT} through the official API.`)).toBeVisible();
  await expect(page.locator('.hero').getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Case Was Approved', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('switch', { name: 'Track with the official USCIS API' }),
  ).toBeChecked();

  server.change(
    RECEIPT,
    officialCase(RECEIPT, [
      ['Case Was Received', RECEIVED],
      ['Case Was Approved', APPROVED],
      ['Card Was Mailed To Me', daysAgo(1)],
    ]),
  );
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(snackbar(page, `1 new event for ${RECEIPT}.`)).toBeVisible();
  await page.goto('./#/cases');
  await expect(page.locator('a.card', { hasText: RECEIPT }).getByText('Card mailed')).toBeVisible();

  await page.locator('a.card', { hasText: RECEIPT }).click();
  await page.getByRole('switch', { name: 'Track with the official USCIS API' }).uncheck();
  await expect(snackbar(page, `Stopped tracking ${RECEIPT}. The server deleted it.`)).toBeVisible();
  expect(server.state.subs).toEqual([]);

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Turn off and delete server data' }).click();
  await expect(
    page.getByText('Off. Cases update only when you import the case JSON yourself.'),
  ).toBeVisible();
  expect(server.state.deleted).toBe(true);
});

test('shows a USCIS error for receipts the sandbox does not know', async ({ page }) => {
  await fakeSyncServer(page);
  await loadExample(page);
  await turnOn(page);
  await page.goto('./#/cases');
  await page.locator('a.card', { hasText: RECEIPT }).click();
  await page.getByRole('switch', { name: 'Track with the official USCIS API' }).check();
  await expect(
    page.getByText('USCIS error: USCIS has no case with this receipt number in this environment.'),
  ).toBeVisible();
});

test('keeps the sync key out of exports and survives a reload', async ({ page }) => {
  const server = await fakeSyncServer(page, { cases: { [RECEIPT]: approved } });
  await loadExample(page);
  await turnOn(page);
  await page.reload();
  await expect(page.getByText(/^On\. Server/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).not.toContain(server.state.token);
});

test('axe: settings and case page with server sync on', async ({ page }) => {
  await fakeSyncServer(page, { cases: { [RECEIPT]: approved } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadExample(page);
  await turnOn(page);
  await expectNoAxeViolations(page);
  await page.goto('./#/cases');
  await page.locator('a.card', { hasText: RECEIPT }).click();
  await page.getByRole('switch', { name: 'Track with the official USCIS API' }).check();
  await expect(
    page.getByRole('switch', { name: 'Track with the official USCIS API' }),
  ).toBeChecked();
  await expectNoAxeViolations(page);
});
