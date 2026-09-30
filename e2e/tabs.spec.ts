import { expect, test } from '@playwright/test';
import { loadExample, open, snackbar } from './helpers';

test('insights shows wait bars and demo series with a table view', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/insights');
  await expect(
    page
      .getByText('55 days over')
      .or(page.getByText(/\d+ days over/))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /I-130 for Sam/ })).toBeVisible();
  await expect(page.getByText('Demo data').first()).toBeVisible();
  const chart = page.getByRole('figure', { name: 'Processing time in months' });
  await chart.getByRole('radio', { name: 'Table' }).click();
  await expect(chart.getByRole('table')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Range', exact: true })
    .getByRole('radio', { name: '3M' })
    .click();
  await expect(chart.getByRole('row')).toHaveCount(5);
});

test('paste CSV reports bad lines and imports good ones', async ({ page }) => {
  await open(page, '/insights');
  await page.getByRole('button', { name: 'Paste CSV' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Paste CSV' });
  await dialog.getByRole('textbox', { name: 'New series name' }).fill('My office');
  await dialog.getByLabel('Rows').fill('2025-01-01,12\nsoon,3\n02/01/2025,12.5');
  await dialog.getByRole('button', { name: 'Import rows' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Line 2: "soon" is not a date');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'My office' })).toBeVisible();
  await expect(page.getByText('My office: Up 0.5 months (4%) since 2025-01-01.')).toBeVisible();
});

test('projection reports an estimate with a retrogression caveat', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/insights');
  await expect(page.getByText(/^Estimated \w{3} \d{4}/)).toBeVisible();
  await expect(page.getByText(/retrogression/)).toBeVisible();
  await page.getByLabel('Priority date', { exact: true }).fill('2000-01-01');
  await page.getByLabel('Priority date', { exact: true }).blur();
  await expect(page.getByText(/Your priority date is current/)).toBeVisible();
});

test('priority date checker, planner, fees, and checklist work', async ({ page }) => {
  await open(page, '/tools');
  await page.getByLabel('Your priority date').fill('2020-01-01');
  await page.getByLabel('Cutoff date').fill('2020-01-02');
  await expect(page.getByText(/^Current\. Jan 1, 2020 is earlier than the cutoff/)).toBeVisible();
  await page.getByLabel('Cutoff date').fill('2020-01-01');
  await expect(page.getByText(/^Not current\./)).toBeVisible();
  await page.getByRole('checkbox', { name: 'C (current)' }).check();
  await expect(page.getByText(/every priority date is current/)).toBeVisible();

  await page.getByLabel('Received date').fill('2025-01-01');
  await page.getByLabel('Published time, months').fill('12');
  await expect(page.getByText('Published processing time ends')).toBeVisible();
  await expect(page.getByText('Jan 1, 2026')).toBeVisible();

  await page.getByRole('textbox', { name: 'Fee for' }).fill('Filing');
  await page.getByRole('textbox', { name: 'Amount, USD' }).fill('100.50');
  await page.getByRole('button', { name: 'Add fee' }).click();
  await page.getByRole('textbox', { name: 'Fee for' }).fill('Biometrics');
  await page.getByRole('textbox', { name: 'Amount, USD' }).fill('$1,000');
  await page.getByRole('button', { name: 'Add fee' }).click();
  await expect(page.getByText('$1,100.50')).toBeVisible();
  await page.getByRole('button', { name: 'Delete fee: Filing' }).click();
  await expect(page.getByText('$1,000.00').first()).toBeVisible();
  await snackbar(page, 'Deleted fee: Filing.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('$1,100.50')).toBeVisible();

  await page.getByLabel('Form', { exact: true }).selectOption('i90');
  await expect(page.getByText('0 of 5 ready')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Form I-90, completed and signed' }).check();
  await expect(page.getByText('1 of 5 ready')).toBeVisible();
  await page.reload();
  await page.getByLabel('Form', { exact: true }).selectOption('i90');
  await expect(page.getByText('1 of 5 ready')).toBeVisible();
  await expect(page.getByText('A starting point, not official instructions.')).toBeVisible();
});

test('updates filters sources and records checks', async ({ page }) => {
  await loadExample(page);
  await page.goto('./#/updates');
  await expect(page.getByRole('heading', { name: 'Relevant to your forms' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'I-485, Adjustment of status' })).toHaveAttribute(
    'href',
    'https://www.uscis.gov/i-485',
  );
  await page.getByRole('button', { name: 'Policy' }).click();
  await expect(page.getByRole('link', { name: /USCIS newsroom/ })).toBeHidden();
  await page.getByRole('button', { name: 'Mark as checked: Visa Bulletin' }).click();
  await expect(page.getByText(/Checked just now/)).toBeVisible();
});

test('settings states what sync can and cannot do', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText(/Reading your signed-in USCIS account automatically/)).toBeVisible();
  await expect(page.getByText(/the server can reach only the sandbox/)).toBeVisible();
});
