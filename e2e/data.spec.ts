import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURES, loadExample, open, snackbar } from './helpers';

test('exports data as a Waymark JSON file', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^waymark-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file).toMatchObject({ app: 'waymark', schema: 3 });
  expect(file.data.cases).toHaveLength(3);
});

test('imports a v0.2 export, then deletes everything and undoes it', async ({ page }) => {
  await open(page, '/settings');
  await page.locator('input[type=file]').setInputFiles(`${FIXTURES}/v02-export.json`);
  await expect(
    snackbar(page, 'Imported 2 cases from Waymark v0.2. Skipped 2 invalid records.'),
  ).toBeVisible();
  await page.goto('./#/cases');
  await expect(page.locator('a.card')).toHaveCount(2);

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.goto('./#/cases');
  await expect(page.getByRole('heading', { name: 'No cases yet' })).toBeVisible();
  await snackbar(page, 'Deleted all cases and data.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('a.card')).toHaveCount(2);
});

test('rejects a file that is not Waymark data', async ({ page }) => {
  await open(page, '/settings');
  await page.locator('input[type=file]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByRole('alert')).toContainText('does not contain Waymark data');
});

test('offers v0.2 data found in this browser', async ({ page }) => {
  await page.addInitScript(
    (v02) => localStorage.setItem('waymark:v1', v02),
    readFileSync(`${FIXTURES}/v02-export.json`, 'utf8'),
  );
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Import v0.2 data' }).click();
  await expect(page.locator('a.card')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: 'Waymark v0.2 data found in this browser' }),
  ).toBeHidden();
});

test('keeps data after a reload', async ({ page }) => {
  await loadExample(page);
  await page.reload();
  await expect(page.locator('a.card')).toHaveCount(3);
});
