import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loadExample, open, snackbar } from './helpers';

test('opens shared text in the import sheet for review', async ({ page }) => {
  const json =
    '{"receiptNumber":"IOE0999000444","formType":"I131","events":[{"eventCode":"IAF","createdAtTimestamp":"2026-01-02T10:00:00Z"}]}';
  await page.goto(`./?shared_text=${encodeURIComponent(json)}#/cases`);
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await expect(dialog.getByLabel('Case JSON')).toHaveValue(json);
  expect(new URL(page.url()).search).toBe('');
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(snackbar(page, 'Added case IOE0999000444.')).toBeVisible();
});

test('app shortcuts open the add case and import sheets', async ({ page }) => {
  await page.goto('./?action=new-case');
  await expect(page.getByRole('dialog', { name: 'Add case' })).toBeVisible();
  await page.goto('./?action=import');
  await expect(page.getByRole('dialog', { name: 'Import USCIS case JSON' })).toBeVisible();
});

test('turns a notice appointment into a deadline and exports it to the calendar', async ({
  page,
}) => {
  await open(page, '/cases');
  const when = new Date(Date.now() + 10 * 86_400_000);
  when.setUTCHours(15, 0, 0, 0);
  const json = JSON.stringify({
    receiptNumber: 'IOE0999000555',
    formType: 'I485',
    submissionTimestamp: '2026-01-02T10:00:00Z',
    events: [{ eventCode: 'FNA', createdAtTimestamp: '2026-02-02T10:00:00Z' }],
    notices: [
      {
        actionType: 'Biometrics appointment',
        appointmentDateTime: when.toISOString(),
        letterId: 'L1',
      },
    ],
  });
  await page.getByRole('button', { name: 'Import USCIS JSON' }).click();
  await page.getByRole('dialog').getByLabel('Case JSON').fill(json);
  await page.getByRole('dialog').getByRole('button', { name: 'Import JSON' }).click();
  await page.locator('a.card').click();

  const appointments = page.getByRole('region', { name: 'Upcoming appointments' });
  await expect(appointments.getByText('Biometrics appointment')).toBeVisible();
  await appointments.getByRole('button', { name: 'Add to deadlines' }).click();
  await expect(snackbar(page, 'Added deadline: Biometrics appointment.')).toBeVisible();
  await expect(appointments).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('region', { name: 'Deadlines' })
      .getByRole('button', { name: 'Add to calendar' })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe('waymark-IOE0999000555.ics');
  const ics = readFileSync((await download.path())!, 'utf8');
  expect(ics).toContain('SUMMARY:Biometrics appointment');
  expect(ics).toContain(`DTSTART;VALUE=DATE:${when.toISOString().slice(0, 10).replace(/-/g, '')}`);
  expect(ics).toContain('DESCRIPTION:I-485 IOE0999000555');
});

test('copies the receipt number from the case page', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  await page.getByRole('button', { name: 'Copy receipt number' }).click();
  await expect(snackbar(page, 'Copied MSC0000000003.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('MSC0000000003');
});

test('groups closed cases and searches once there are six or more', async ({ page }) => {
  await loadExample(page);
  await expect(page.getByRole('searchbox', { name: 'Find a case' })).toHaveCount(0);
  for (const [i, receipt] of ['LIN0999000001', 'LIN0999000002', 'LIN0999000003'].entries()) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'New case' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add case' });
    await dialog.getByRole('textbox', { name: 'Receipt number' }).fill(receipt);
    await dialog.getByLabel('Received date').fill('2025-06-01');
    await dialog.getByRole('textbox', { name: 'Name' }).fill(`Person ${i + 1}`);
    if (i === 0) await dialog.getByLabel('Current status').selectOption('delivered');
    await dialog.getByRole('button', { name: 'Add case' }).click();
    await page.goto('./#/cases');
  }
  const closed = page.getByRole('region', { name: /Closed \(1\)/ });
  await expect(closed).toBeVisible();
  await expect(closed.locator('a.card')).toHaveCount(0);
  await closed.getByRole('button', { name: 'Show closed cases' }).click();
  await expect(closed.locator('a.card')).toHaveCount(1);

  const search = page.getByRole('searchbox', { name: 'Find a case' });
  await search.fill('person 2');
  await expect(page.locator('a.card')).toHaveCount(1);
  await search.fill('lin-0999000001');
  await expect(page.locator('a.card', { hasText: 'Person 1' })).toBeVisible();
  await search.fill('zzz');
  await expect(page.getByText('No case matches "zzz".')).toBeVisible();
});

test('exports open deadlines to the calendar from the cases list', async ({ page }) => {
  await loadExample(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Add 2 deadlines to calendar' }).click(),
  ]);
  const ics = readFileSync((await download.path())!, 'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
});

test('settings explains how to install', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByRole('region', { name: 'Install on this phone' })).toContainText(
    'Add to Home screen',
  );
});
