import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dismissSnackbar, FIXTURES, loadExample, open, snackbar } from './helpers';

const basic = readFileSync(`${FIXTURES}/case-basic.json`, 'utf8');
const rescan = readFileSync(`${FIXTURES}/case-rescan.json`, 'utf8');

test('shows the empty state with its three actions', async ({ page }) => {
  await open(page, '/cases');
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add case' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import USCIS JSON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load example' })).toBeVisible();
});

test('adds a case with validation and opens its detail page', async ({ page }) => {
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'New case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  const receipt = dialog.getByRole('textbox', { name: 'Receipt number' });

  await receipt.fill('lin');
  await expect(receipt).toHaveAccessibleDescription(/Nebraska Service Center.*not where it is now/);
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await expect(receipt).toHaveAccessibleDescription(/3 letters and 10 digits/);

  await receipt.fill('lin-09-990-00222');
  await dialog.getByLabel('Received date').fill('2099-01-01');
  await expect(dialog.getByText('cannot be in the future')).toBeVisible();
  await dialog.getByLabel('Received date').fill('2025-01-15');
  await dialog.getByLabel('Form').selectOption('I-765');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Robin');
  await dialog.getByLabel('Published processing time, months').fill('6');
  await dialog.getByRole('button', { name: 'Add case' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('main h1')).toHaveText('Robin');
  await expect(page.locator('.hero').getByText('LIN0999000222')).toBeVisible();
  await expect(page.getByText('since filing on Jan 15, 2025')).toBeVisible();

  // Duplicate receipts are rejected.
  await page.goto('./#/cases');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'New case' }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Receipt number' })
    .fill('LIN0999000222');
  await expect(page.getByText('A case with this receipt number already exists.')).toBeVisible();
});

test('imports pasted USCIS JSON, undoes it, and marks new events on re-import', async ({
  page,
}) => {
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Import USCIS JSON' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await dialog.getByLabel('Case JSON').fill('not json');
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No JSON found');

  await dialog.getByLabel('Case JSON').fill(basic);
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, 'Added case IOE0999000111.')).toBeVisible();
  await snackbar(page, 'Added case IOE0999000111.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Import USCIS JSON' }).click();
  await page.getByRole('dialog').getByLabel('Case JSON').fill(basic);
  await page.getByRole('dialog').getByRole('button', { name: 'Import JSON' }).click();
  await dismissSnackbar(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await page.getByRole('dialog').getByLabel('Case JSON').fill(rescan);
  await page.getByRole('dialog').getByRole('button', { name: 'Import JSON' }).click();
  await expect(snackbar(page, '2 new events for IOE0999000111.')).toBeVisible();

  const card = page.locator('a.card');
  await expect(card.getByText('2 new')).toBeVisible();
  await expect(card.getByText('Evidence requested', { exact: true })).toBeVisible();
  await card.click();
  await expect(page.getByText('Unrecognized event')).toBeVisible();
  await expect(page.getByText('ZZZ9')).toBeVisible();
  await page.getByRole('button', { name: 'Mark 2 seen' }).click();
  await expect(page.getByRole('button', { name: 'Mark 2 seen' })).toBeHidden();
});

test('sync opens the case JSON and imports from the clipboard on return', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { opened: string[] }).opened.push(String(url));
      return null;
    };
  });
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
    'https://my.uscis.gov/account/case-service/api/cases/MSC0000000003',
  ]);
  const json = JSON.stringify({
    receiptNumber: 'MSC0000000003',
    events: [{ eventCode: 'DA', createdAtTimestamp: new Date().toISOString() }],
  });
  await page.evaluate((text) => navigator.clipboard.writeText(text), json);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const prompt = snackbar(page, 'Copied the case JSON?');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Import' }).click();
  await expect(snackbar(page, 'Updated MSC0000000003.')).toBeVisible();
  await expect(page.locator('.hero').getByText('Approved', { exact: true })).toBeVisible();
});

test('falls back to the paste sheet when clipboard reading is blocked', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card').first().click();
  await page.evaluate(() => {
    window.open = () => null;
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await snackbar(page, 'Copied the case JSON?').getByRole('button', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await expect(dialog.getByRole('alert')).toContainText('did not allow reading the clipboard');
});

test('logs a quick status, then deletes the entry with undo', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Quick statuses' }).click();
  await page.getByRole('menuitem', { name: 'Interview scheduled' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a status' });
  await expect(dialog.getByLabel('Status')).toHaveValue('interview');
  await dialog.getByLabel('Note').fill('Field office letter');
  await dialog.getByRole('button', { name: 'Log status' }).click();
  await expect(page.locator('.hero').getByText('Interview scheduled')).toBeVisible();
  await expect(page.getByText('Field office letter')).toBeVisible();

  await page.getByRole('button', { name: 'Delete entry: Interview scheduled' }).click();
  await expect(page.getByText('Field office letter')).toBeHidden();
  await snackbar(page, 'Deleted the entry.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Field office letter')).toBeVisible();
});

test('deletes a case from the toolbar with undo', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page
    .getByRole('toolbar', { name: 'Case actions' })
    .getByRole('button', { name: 'Delete case' })
    .click();
  await expect(page.locator('main h1')).toHaveText('Cases');
  await expect(page.locator('a.card')).toHaveCount(2);
  await snackbar(page, 'Deleted case MSC0000000003.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('a.card')).toHaveCount(3);
});

test('copies a one-line summary', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Copy summary' }).click();
  await expect(snackbar(page, 'Copied the case summary.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^I-130 MSC0000000003 \(Sam\): In review\. Day \d+ since filing on \d{4}-\d{2}-\d{2}\.$/,
  );
});

test('saves notes and data across reloads', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  const notes = page.getByLabel('Notes for this case');
  await notes.fill('Called the contact center on Monday.');
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Notes for this case')).toHaveValue(
    'Called the contact center on Monday.',
  );
});

test('manages deadlines with done and undo', async ({ page }) => {
  await loadExample(page);
  const deadlines = page.locator('section', {
    has: page.getByRole('heading', { name: 'Deadlines' }),
  });
  await deadlines.getByRole('button', { name: 'New deadline' }).click();
  const dialog = page.getByRole('dialog', { name: 'New deadline' });
  await dialog.getByRole('button', { name: 'Add deadline' }).click();
  await expect(dialog.getByText('Enter what is due')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'What is due' }).fill('Mail evidence packet');
  await dialog.getByRole('button', { name: 'Add deadline' }).click();
  await expect(deadlines.getByText('Mail evidence packet')).toBeVisible();

  await deadlines.getByRole('checkbox', { name: 'Done: Mail evidence packet' }).click();
  await expect(deadlines.getByText('Mail evidence packet')).toBeHidden();
  await deadlines.getByRole('button', { name: 'Show 1 done deadline' }).click();
  await deadlines.getByRole('button', { name: 'Delete deadline: Mail evidence packet' }).click();
  await expect(deadlines.getByText('Mail evidence packet')).toBeHidden();
  await snackbar(page, 'Deleted deadline: Mail evidence packet.')
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(deadlines.getByText('Mail evidence packet')).toBeVisible();
});

test('sorts action cases first and summarizes the list', async ({ page }) => {
  await loadExample(page);
  const receipts = await page.locator('a.card .receipt').allTextContents();
  expect(receipts).toEqual(['IOE0000000001', 'MSC0000000003', 'IOE0000000002']);
  await expect(page.getByText('3 in progress.')).toBeVisible();
  await expect(page.getByText('Longest wait 420 days.')).toBeVisible();
  await expect(page.getByText('Example data is loaded and labeled demo.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove example data' }).click();
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();
});

test('masks receipt numbers when the setting is on', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Mask receipt numbers' }).check();
  await page.goto('./#/cases');
  await expect(page.locator('a.card .receipt').first()).toHaveText('•'.repeat(9) + '0001');
  await expect(page.locator('a.card .receipt').first()).toHaveAttribute(
    'aria-label',
    'Receipt ending 0001',
  );
});

test('shows event times in the chosen time zone', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/settings');
  await page.getByLabel('Time zone for USCIS event times').selectOption('America/Los_Angeles');
  await page.goto('./#/cases');
  await page.locator('a.card').first().click();
  await expect(page.getByText(/(PDT|PST)\. Day 0\./)).toBeVisible();
});
