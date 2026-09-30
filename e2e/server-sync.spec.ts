import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { fakeSyncServer, officialCase, SYNC_URL } from './fake-sync-server';
import {
  addCaseManually,
  dismissSnackbar,
  expectNoAxeViolations,
  loadExample,
  snackbar,
} from './helpers';

// Recent dates, so official events are newer than manual entries.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const RECEIVED = daysAgo(400);
const APPROVED = daysAgo(2);

const NEW_RECEIPT = 'IOE0999000777';
const newApproved = officialCase(NEW_RECEIPT, [
  ['Case Was Received', RECEIVED],
  ['Case Was Approved', APPROVED],
]);

async function turnOn(page: Page) {
  await page.goto('./#/settings');
  const section = page.getByRole('region', { name: 'Automatic checks' });
  await section.getByLabel('Server address').fill(SYNC_URL);
  await section.getByRole('button', { name: 'Turn on automatic checks' }).click();
  await expect(section.getByText(/^On\. /)).toBeVisible();
  await dismissSnackbar(page);
}

async function addByReceipt(page: Page, receipt: string) {
  await page.goto('./#/cases');
  await page.getByRole('button', { name: 'Add case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  await dialog.getByRole('textbox', { name: 'Receipt number' }).fill(receipt);
  await dialog.getByRole('button', { name: 'Add case' }).click();
  return dialog;
}

test('is off without a server address and explains what it sends', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(
    page.getByText('Off. Cases update when you import the case page from your USCIS account.'),
  ).toBeVisible();
  await expect(page.getByText(/sends your receipt numbers to the Waymark server/)).toBeVisible();
});

test('rejects insecure addresses and reports an unreachable server', async ({ page }) => {
  await page.goto('./#/settings');
  const section = page.getByRole('region', { name: 'Automatic checks' });
  const address = section.getByLabel('Server address');
  await address.fill('http://sync.example.org');
  await section.getByRole('button', { name: 'Turn on automatic checks' }).click();
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await expect(address).toHaveAccessibleDescription(
    'Enter the server address starting with https://.',
  );

  await page.route('https://down.test/**', (route) => route.abort());
  await address.fill('https://down.test');
  await section.getByRole('button', { name: 'Turn on automatic checks' }).click();
  await expect(page.getByRole('alert')).toContainText('The sync server did not respond');
});

test('adds a case from the receipt number alone, pulls changes, and turns off', async ({
  page,
}) => {
  const server = await fakeSyncServer(page, { cases: { [NEW_RECEIPT]: newApproved } });
  await turnOn(page);
  await expect(page.getByText(/Test system: the server uses the USCIS sandbox/)).toBeVisible();

  const dialog = await addByReceipt(page, NEW_RECEIPT);
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, `Added case ${NEW_RECEIPT}.`)).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Petition for alien relative');
  await expect(page.locator('.hero').getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Case Was Approved', { exact: true })).toBeVisible();
  await expect(page.getByText(/Checked automatically just now/)).toBeVisible();
  expect(server.state.subs.map((s) => s.receipt)).toEqual([NEW_RECEIPT]);

  server.change(
    NEW_RECEIPT,
    officialCase(NEW_RECEIPT, [
      ['Case Was Received', RECEIVED],
      ['Case Was Approved', APPROVED],
      ['Card Was Mailed To Me', daysAgo(1)],
    ]),
  );
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(snackbar(page, `1 new event for ${NEW_RECEIPT}.`)).toBeVisible();
  await page.goto('./#/cases');
  await expect(
    page.locator('a.card', { hasText: NEW_RECEIPT }).getByText('Card mailed'),
  ).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Turn off and delete server data' }).click();
  await expect(
    page.getByText('Off. Cases update when you import the case page from your USCIS account.'),
  ).toBeVisible();
  expect(server.state.deleted).toBe(true);
});

test('tracks cases added before, but never example cases', async ({ page }) => {
  const server = await fakeSyncServer(page, { cases: { [NEW_RECEIPT]: newApproved } });
  await loadExample(page);
  await addCaseManually(page, { receipt: NEW_RECEIPT, date: '2025-06-01' });
  await turnOn(page);
  await expect.poll(() => server.state.subs.map((s) => s.receipt)).toEqual([NEW_RECEIPT]);
  await page.goto('./#/cases');
  await expect(
    page.locator('a.card', { hasText: NEW_RECEIPT }).getByText('Approved', { exact: true }),
  ).toBeVisible();
});

test('falls back to the case page when USCIS does not return the receipt', async ({ page }) => {
  await fakeSyncServer(page);
  await turnOn(page);
  const dialog = await addByReceipt(page, NEW_RECEIPT);
  await expect(dialog.getByRole('status')).toHaveText(
    'Automatic checks could not find this case. This server uses the USCIS test system, so real cases are not found yet. Get the details from your USCIS account instead.',
  );
  await expect(dialog.getByRole('button', { name: 'Open case page' })).toBeVisible();
});

test('keeps the sync key out of exports and survives a reload', async ({ page }) => {
  const server = await fakeSyncServer(page, { cases: { [NEW_RECEIPT]: newApproved } });
  await turnOn(page);
  await addByReceipt(page, NEW_RECEIPT);
  await expect(page.locator('main h1')).toHaveText('Petition for alien relative');
  await page.goto('./#/settings');
  await page.reload();
  await expect(page.getByText(/^On\. 1 case is checked/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).not.toContain(server.state.token);
});

test('axe: settings and case page with automatic checks on', async ({ page }) => {
  await fakeSyncServer(page, { cases: { [NEW_RECEIPT]: newApproved } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await turnOn(page);
  await expectNoAxeViolations(page);
  await addByReceipt(page, NEW_RECEIPT);
  await expect(page.getByText(/Checked automatically just now/)).toBeVisible();
  await expectNoAxeViolations(page);
});
