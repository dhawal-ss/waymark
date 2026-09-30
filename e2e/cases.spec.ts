import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  addCaseManually,
  comeBack,
  dismissSnackbar,
  FIXTURES,
  loadExample,
  open,
  openImport,
  snackbar,
  stubWindowOpen,
} from './helpers';

const basic = readFileSync(`${FIXTURES}/case-basic.json`, 'utf8');
const rescan = readFileSync(`${FIXTURES}/case-rescan.json`, 'utf8');

test('shows the empty state with its actions', async ({ page }) => {
  await open(page, '/cases');
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();
  await expect(page.getByText('Add a case with its receipt number.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add case' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load example' })).toBeVisible();
});

test('adds a case from the receipt number and the copied case page', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, '/cases');
  const opened = await stubWindowOpen(page);
  await page.getByRole('button', { name: 'Add case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  // The receipt number is the only question.
  await expect(dialog.getByRole('textbox')).toHaveCount(1);
  await dialog.getByRole('textbox', { name: 'Receipt number' }).fill('ioe-0999-000-111');
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await expect(dialog.getByText('Get the details for IOE0999000111')).toBeVisible();
  await dialog.getByRole('button', { name: 'Open case page' }).click();
  expect(await opened()).toEqual([
    'https://my.uscis.gov/account/case-service/api/cases/IOE0999000111',
  ]);
  // Copy the page in the other tab and come back: Waymark imports it and opens the case.
  await page.evaluate((text) => navigator.clipboard.writeText(text), basic);
  await comeBack(page);
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, 'Added case IOE0999000111.')).toBeVisible();
  await expect(page.locator('.hero').getByText('IOE0999000111')).toBeVisible();
  await expect(page.getByText(/Updated from USCIS just now/)).toBeVisible();
});

test('adds a case when the case page is pasted into the receipt field', async ({ page }) => {
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Add case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  await dialog.getByRole('textbox', { name: 'Receipt number' }).fill('{"receiptNumber": 1');
  await expect(dialog.getByRole('textbox', { name: 'Receipt number' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await dialog.getByRole('textbox', { name: 'Receipt number' }).fill(basic);
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, 'Added case IOE0999000111.')).toBeVisible();
  await expect(page.locator('.hero').getByText('IOE0999000111')).toBeVisible();
});

test('adds a case with typed details, with validation', async ({ page }) => {
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Add case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  const receipt = dialog.getByRole('textbox', { name: 'Receipt number' });

  await receipt.fill('lin');
  await expect(receipt).toHaveAccessibleDescription(/Nebraska Service Center.*not where it is now/);
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await expect(receipt).toHaveAccessibleDescription(/3 letters and 10 digits/);

  await receipt.fill('lin-09-990-00222');
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await dialog.getByRole('button', { name: 'Enter details yourself' }).click();
  // The receipt is saved in its standard form.
  await expect(receipt).toHaveValue('LIN0999000222');
  await dialog.getByLabel('Received date').fill('2025-01-15');
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await expect(dialog.getByLabel('Form')).toHaveAccessibleDescription(
    'Choose the form from the receipt notice.',
  );
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
  await page.getByRole('button', { name: 'Add case' }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Receipt number' })
    .fill('LIN0999000222');
  await expect(page.getByText('A case with this receipt number already exists.')).toBeVisible();
});

test('imports pasted USCIS JSON, undoes it, and marks new events on re-import', async ({
  page,
}) => {
  await openImport(page);
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await dialog.getByLabel('Case JSON').fill('not json');
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No JSON found');

  await dialog.getByLabel('Case JSON').fill(basic);
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, 'Added case IOE0999000111.')).toBeVisible();
  await snackbar(page, 'Added case IOE0999000111.').getByRole('button', { name: 'Undo' }).click();
  await page.goto('./#/cases');
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();

  await openImport(page);
  await page.getByRole('dialog').getByLabel('Case JSON').fill(basic);
  await page.getByRole('dialog').getByRole('button', { name: 'Import JSON' }).click();
  await dismissSnackbar(page);
  await openImport(page);
  await page.getByRole('dialog').getByLabel('Case JSON').fill(rescan);
  await page.getByRole('dialog').getByRole('button', { name: 'Import JSON' }).click();
  await expect(snackbar(page, '2 new events for IOE0999000111.')).toBeVisible();

  const card = page.locator('a.card');
  await expect(card.getByText('2 new')).toBeVisible();
  await expect(card.getByText('Evidence requested', { exact: true })).toBeVisible();
  await card.click();
  await expect(page.getByText('Unrecognized event')).toBeVisible();
  await expect(page.getByText('ZZZ9')).toBeVisible();
  await page.getByRole('button', { name: 'Mark as seen' }).click();
  await expect(page.getByRole('button', { name: 'Mark as seen' })).toBeHidden();
});

const DA_JSON = JSON.stringify({
  receiptNumber: 'MSC0000000003',
  events: [{ eventCode: 'DA', createdAtTimestamp: new Date().toISOString() }],
});

test('imports the copied case page by itself on return when the clipboard is allowed', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  const opened = await stubWindowOpen(page);
  await page.getByRole('button', { name: 'Open case page' }).click();
  expect(await opened()).toEqual([
    'https://my.uscis.gov/account/case-service/api/cases/MSC0000000003',
  ]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), DA_JSON);
  await comeBack(page);
  await expect(snackbar(page, 'Updated MSC0000000003.')).toBeVisible();
  await expect(page.locator('.hero').getByText('Approved', { exact: true })).toBeVisible();
});

test('offers Import on return when the clipboard needs permission', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await stubWindowOpen(page);
  await page.evaluate((text) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: () => Promise.resolve(text) },
    });
  }, DA_JSON);
  await page.getByRole('button', { name: 'Open case page' }).click();
  await comeBack(page);
  const prompt = snackbar(page, 'Copied the case page?');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Import' }).click();
  await expect(snackbar(page, 'Updated MSC0000000003.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Open case page' }).click();
  await comeBack(page);
  // The case page keeps an Import button after the snackbar is gone.
  await page.getByRole('button', { name: 'Import copied page' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await expect(dialog.getByRole('alert')).toContainText('did not allow reading the clipboard');
});

test('logs a quick status, then deletes the entry with undo', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Quick statuses' }).click();
  await page.getByRole('menuitem', { name: 'Interview scheduled' }).click();
  // Quick statuses log today at once.
  await expect(snackbar(page, 'Logged: Interview scheduled.')).toBeVisible();
  await expect(page.locator('.hero').getByText('Interview scheduled')).toBeVisible();
  const entry = page.getByRole('button', { name: 'Delete entry: Interview scheduled' });
  await expect(entry).toHaveCount(1);

  await entry.click();
  await expect(entry).toHaveCount(0);
  await snackbar(page, 'Deleted the entry.').getByRole('button', { name: 'Undo' }).click();
  await expect(entry).toHaveCount(1);
});

test('logs an evidence request with a response deadline', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Quick statuses' }).click();
  await page.getByRole('menuitem', { name: 'Evidence requested' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a status' });
  await expect(dialog.getByLabel('Status')).toHaveValue('rfe');
  await dialog.getByLabel('Note').fill('Field office letter');
  await dialog.getByLabel('Response due').fill('2099-01-15');
  await dialog.getByRole('button', { name: 'Log status' }).click();
  await expect(
    snackbar(page, 'Logged: Evidence requested. Added deadline: Respond to the evidence request.'),
  ).toBeVisible();
  await expect(page.getByText('Field office letter')).toBeVisible();
  await expect(page.getByText('Respond to the evidence request').first()).toBeVisible();
});

test('deletes a case from the edit sheet with undo', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page
    .getByRole('toolbar', { name: 'Case actions' })
    .getByRole('button', { name: 'Edit case' })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit case' })
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
  // Without a system share sheet, Share summary copies instead.
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  await page.getByRole('button', { name: 'Share summary' }).click();
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
  await expect(page.locator('.summary').getByText(/^Next deadline: /)).toBeVisible();
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

test('keeps a change made right before the page closes', async ({ page }) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Quick statuses' }).click();
  await page.getByRole('menuitem', { name: 'Interview scheduled' }).click();
  // Reload at once, before the IndexedDB write can finish.
  await page.reload();
  await expect(page.locator('.hero').getByText('Interview scheduled')).toBeVisible();
  // The copy kept for the reload is removed once it is saved.
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('waymark:unsaved'))),
    )
    .toEqual([]);
});

test('adds several cases from the Add case button', async ({ page }) => {
  await open(page, '/cases');
  const receipts = ['IOE0999000201', 'IOE0999000202', 'IOE0999000203'];
  for (const receipt of receipts) {
    await addCaseManually(page, { receipt, date: '2025-06-01' });
    await expect(page.locator('.hero').getByText(receipt)).toBeVisible();
  }
  await page.goto('./#/cases');
  await expect(page.locator('a.card')).toHaveCount(3);
  // The labeled button is there once a case exists, and opens the add sheet at once.
  await page.getByRole('button', { name: 'Add case' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Add case' }).getByRole('textbox', { name: 'Receipt number' }),
  ).toBeFocused();
});
