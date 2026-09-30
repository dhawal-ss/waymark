import { expect, test, type Page } from '@playwright/test';
import { fakeSyncServer, SYNC_URL, type PublicFixture } from './fake-sync-server';
import { expectNoAxeViolations, loadExample, snackbar } from './helpers';

const month = (offset: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

function fixture(): PublicFixture {
  return {
    times: [
      {
        form: 'I-485',
        office: 'NBC',
        subtype: '134A',
        label: 'Family-based adjustment applications',
        points: [
          { publishedDate: '2026-05-01', months: 12 },
          { publishedDate: '2026-07-25', months: 13.5 },
        ],
      },
      {
        form: 'I-765',
        office: 'PSC',
        subtype: 'C9',
        label: 'Based on a pending I-485',
        points: [{ publishedDate: '2026-07-25', months: 4 }],
      },
    ],
    bulletin: [
      {
        chart: 'final',
        preference: 'employment',
        category: 'EB2',
        country: 'INDIA',
        // Moves about a month per month, and one month is unavailable.
        points: Array.from({ length: 12 }, (_, i) => ({
          month: month(i - 11),
          cutoff: i === 5 ? 'U' : `2013-${String((i % 12) + 1).padStart(2, '0')}-01`,
        })),
      },
    ],
    stats: [
      {
        quarter: 'FY2026 Q1',
        form: 'I-485',
        office: 'National Benefits Center',
        received: 11000,
        approved: 7000,
        denied: 400,
        pending: 41000,
      },
      {
        quarter: 'FY2026 Q2',
        form: 'I-485',
        office: 'National Benefits Center',
        received: 12000,
        approved: 7500,
        denied: null,
        pending: 43000,
      },
    ],
  };
}

async function turnOnPublicData(page: Page) {
  await page.goto('./#/settings');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Public data' }),
  });
  await section.getByLabel('Sync server address').fill(SYNC_URL);
  await section.getByRole('switch', { name: 'Load public data from the sync server' }).check();
  await expect(section.getByText(/Processing times:\s*updated just now/)).toBeVisible();
}

test('public data is off by default and makes no requests', async ({ page }) => {
  const server = await fakeSyncServer(page, { public: fixture() });
  await loadExample(page);
  await page.goto('./#/insights');
  await expect(page.getByRole('region', { name: 'USCIS form data' })).toContainText(
    'Turn on public data in Settings',
  );
  expect(server.state.requests).toEqual([]);
});

test('links a series to USCIS processing times and refreshes it', async ({ page }) => {
  const server = await fakeSyncServer(page, { public: fixture() });
  await loadExample(page);
  await turnOnPublicData(page);
  expect(server.state.requests.some((r) => r.startsWith('POST /v1/accounts'))).toBe(false);

  await page.goto('./#/insights');
  await page.getByRole('button', { name: 'Add from USCIS data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add from USCIS data' });
  await expect(dialog.getByLabel('Form')).toHaveValue('I-485');
  await dialog.getByRole('radio', { name: /NBC, Family-based adjustment applications/ }).check();
  await dialog.getByRole('button', { name: 'Add series' }).click();
  await expect(
    snackbar(
      page,
      'Added I-485 NBC, Family-based adjustment applications from USCIS processing times.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'I-485 NBC, Family-based adjustment applications: Up 1.5 months (13%) since 2026-05-01.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Linked series follow the time USCIS publishes for 80% of cases/),
  ).toBeVisible();

  server.state.public.times[0]!.points.push({ publishedDate: '2026-09-20', months: 14 });
  await page.goto('./#/cases');
  await page.goto('./#/insights');
  await expect(
    page.getByText(
      'I-485 NBC, Family-based adjustment applications: Up 2 months (17%) since 2026-05-01.',
    ),
  ).toBeVisible();

  await page.getByText('Edit series and points').click();
  await page.getByRole('button', { name: 'Stop updating' }).first().click();
  await expect(snackbar(page, 'Stopped updating the series. Its points stay.')).toBeVisible();
});

test('loads projection cutoffs from the Visa Bulletin', async ({ page }) => {
  await fakeSyncServer(page, { public: fixture() });
  await loadExample(page);
  await turnOnPublicData(page);
  await page.goto('./#/insights');
  await page.getByLabel('Priority date', { exact: true }).fill('2014-06-01');
  await page.getByLabel('Priority date', { exact: true }).blur();
  await page.getByRole('button', { name: 'Load from Visa Bulletin' }).click();
  const dialog = page.getByRole('dialog', { name: 'Load from Visa Bulletin' });
  await expect(dialog.getByLabel('Category')).toHaveValue('EB2');
  await expect(dialog.getByLabel('Country of chargeability')).toHaveValue('INDIA');
  await dialog.getByRole('button', { name: 'Load cutoffs' }).click();
  await expect(
    snackbar(
      page,
      'Loaded 11 months from the Visa Bulletin; 1 month marked unavailable were left out.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Category and country')).toHaveValue(
    'EB-2: Advanced degrees or exceptional ability, India',
  );
  await expect(page.getByText(/Cutoffs from the\s+Visa Bulletin/)).toBeVisible();
  await expect(page.getByText(/^Estimated \w{3} \d{4}/)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Priority date projection' }).getByText('Demo data'),
  ).toHaveCount(0);
});

test('shows quarterly form data with a table view', async ({ page }) => {
  await fakeSyncServer(page, { public: fixture() });
  await loadExample(page);
  await turnOnPublicData(page);
  await page.goto('./#/insights');
  const chart = page.getByRole('figure', {
    name: 'I-485 cases per quarter, National Benefits Center',
  });
  await expect(chart).toBeVisible();
  await chart.getByRole('radio', { name: 'Table' }).click();
  await expect(chart.getByRole('row')).toHaveCount(3);
  await expect(chart.getByRole('columnheader', { name: 'Pending (cases)' })).toBeVisible();
  await expect(chart.getByRole('cell', { name: '43,000' })).toBeVisible();
});

test('axe: insights with public data', async ({ page }) => {
  await fakeSyncServer(page, { public: fixture() });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadExample(page);
  await turnOnPublicData(page);
  await expectNoAxeViolations(page);
  await page.goto('./#/insights');
  await expect(page.getByRole('figure', { name: /cases per quarter/ })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Load from Visa Bulletin' }).click();
  await expect(page.getByRole('dialog').getByLabel('Category')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('rejects an insecure public data address and leaves the switch off', async ({ page }) => {
  await page.goto('./#/settings');
  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Public data' }),
  });
  await section.getByLabel('Sync server address').fill('http://example.org');
  await section.getByRole('switch', { name: 'Load public data from the sync server' }).click();
  await expect(section.getByRole('alert')).toHaveText(
    'Enter the server address starting with https://.',
  );
  await expect(
    section.getByRole('switch', { name: 'Load public data from the sync server' }),
  ).not.toBeChecked();
});
