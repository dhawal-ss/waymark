import { expect, test, type Locator, type Page } from '@playwright/test';
import { fakeSyncServer, officialCase, SYNC_URL } from './fake-sync-server';
import {
  addCaseManually,
  dismissSnackbar,
  expectNoAxeViolations,
  loadExample,
  openImport,
  setPrefs,
  snackbar,
} from './helpers';

const timeline = (page: Page) => page.locator('section[aria-labelledby="timeline-title"]');
const activity = (page: Page) => page.locator('section[aria-labelledby="activity-title"]');

/** The example I-485 case has three notices and seven background updates. */
async function openExampleCase(page: Page) {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'IOE0000000001' }).click();
  await expect(page.locator('main h1')).toHaveText('Alex');
}

const eventButton = (page: Page, label: string) =>
  timeline(page).getByRole('button', { name: label, exact: true });

async function region(page: Page, button: Locator): Promise<Locator> {
  const id = await button.getAttribute('aria-controls');
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('explains an event with the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExampleCase(page);
  const button = eventButton(page, 'Interview scheduled');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const panel = await region(page, button);
  await expect(panel).toBeHidden();

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  for (const heading of ['What it is', 'Why it happens', 'Its purpose', 'What comes next']) {
    await expect(panel.getByText(heading, { exact: true })).toBeVisible();
  }
  await expect(panel.getByText('Community documented, not from USCIS.')).toBeVisible();
  await expect(panel.locator('.t-mono', { hasText: /^FI$/ })).toBeVisible();
  await expect(panel).toContainText('interview');

  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
});

test('marks each event as a notice or a background update with text and an icon', async ({
  page,
}) => {
  await openExampleCase(page);
  const rows = timeline(page).getByRole('listitem');
  const received = rows.filter({
    has: page.getByRole('button', { name: 'Case received', exact: true }),
  });
  await expect(received.getByText('Notice', { exact: true })).toBeVisible();
  const hold = rows.filter({
    has: page.getByRole('button', { name: 'Case on hold or pending review', exact: true }),
  });
  await expect(hold.getByText('Background', { exact: true })).toBeVisible();
  // Both tags carry an icon next to the word.
  await expect(hold.locator('.signal svg')).toHaveCount(1);
  await expect(received.locator('.signal svg')).toHaveCount(1);

  const button = eventButton(page, 'Case on hold or pending review');
  await button.click();
  const panel = await region(page, button);
  await expect(panel).toContainText('waiting inside USCIS');
  await expect(panel.getByText(/Community documented, not from USCIS\. Code/)).toBeVisible();
});

test('shows the case activity section with a table for every chart', async ({ page }) => {
  await openExampleCase(page);
  const section = activity(page);
  await expect(section.getByRole('heading', { name: 'Case activity', level: 2 })).toBeVisible();

  // Journey bar: an image summary and a visually hidden table.
  const journey = section.getByRole('img', { name: /Journey through the stages/ });
  await expect(journey).toBeVisible();
  await expect(journey).toHaveAccessibleName(/Current stage: Officer review/);
  const stages = section.getByRole('table', { name: 'Days in each stage, in order' });
  await expect(stages.getByRole('row')).toHaveCount(6);
  await expect(stages.getByRole('columnheader')).toHaveText([
    'Stage',
    'From',
    'To',
    'Days',
    'Current',
  ]);
  await expect(section.getByText('Current stage', { exact: true })).toBeVisible();

  // Signal split with counts, and no callout when the newest event is a notice.
  await expect(
    section.getByText('3 of 10 events are notices and 7 are background updates.'),
  ).toBeVisible();
  await expect(section.getByText(/since your last notice/)).toHaveCount(0);

  // Events per month: a chart with keyboard support and a table twin.
  const plot = section.getByRole('group', { name: /Events per month\. Use the left and right/ });
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  await expect(plot.locator('[aria-live="polite"]')).toHaveText(
    /^[A-Z][a-z]{2} \d{4}: \d+ notices?, \d+ background updates?$/,
  );
  await section.getByRole('radio', { name: 'Table' }).click();
  const months = section.getByRole('table', {
    name: 'Events per month, notices and background updates',
  });
  await expect(months.getByRole('row').nth(1)).toBeVisible();
  expect(await months.getByRole('row').count()).toBeGreaterThanOrEqual(7);
  await noHorizontalScroll(page);
});

/** Import a case with the given [code, instant] events. The case opens by itself. */
async function importCase(page: Page, receipt: string, events: [string, string][]) {
  await openImport(page);
  const json = JSON.stringify({
    receiptNumber: receipt,
    formType: 'I485',
    events: events.map(([eventCode, createdAtTimestamp]) => ({ eventCode, createdAtTimestamp })),
  });
  const dialog = page.getByRole('dialog', { name: 'Import USCIS case JSON' });
  await dialog.getByLabel('Case JSON').fill(json);
  await dialog.getByRole('button', { name: 'Import JSON' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.hero').getByText(receipt)).toBeVisible();
}

test('says how many background updates followed the last notice', async ({ page }) => {
  await importCase(page, 'IOE0999000222', [
    ['IAF', '2025-02-14T03:31:00.000Z'],
    ['FNA', '2025-03-01T15:00:00.000Z'],
    ['FTA0', '2025-03-20T12:00:00.000Z'],
    ['FT0', '2025-04-10T12:00:00.000Z'],
    ['FS', '2025-05-05T12:00:00.000Z'],
  ]);

  const section = activity(page);
  await expect(
    section.getByText(
      '3 background updates since your last notice on Mar 1, 2025. Background updates are usually routine while a case is in review.',
    ),
  ).toBeVisible();
  await expect(
    section.getByText('2 of 5 events are notices and 3 are background updates.'),
  ).toBeVisible();
  // Gap months are filled: February to May is four columns in the table.
  await section.getByRole('radio', { name: 'Table' }).click();
  const months = section.getByRole('table', {
    name: 'Events per month, notices and background updates',
  });
  await expect(months.getByRole('row')).toHaveCount(5);
  await expect(months.getByRole('row').nth(1)).toContainText('Feb 2025');
  await expect(months.getByRole('row').nth(4)).toContainText('May 2025');
});

test('degrades for a case with a single event', async ({ page }) => {
  await importCase(page, 'IOE0999000444', [['IAF', '2025-02-14T03:31:00.000Z']]);
  const section = activity(page);
  await expect(section.getByText('The only event is a notice.')).toBeVisible();
  await expect(section.getByText('Only one stage so far.')).toBeVisible();
  await expect(section.getByText('All events so far fall in one month.')).toBeVisible();
  await expect(section.getByText(/since your last notice/)).toHaveCount(0);
  await noHorizontalScroll(page);
});

test('does not guess for an event the dictionary does not describe', async ({ page }) => {
  await importCase(page, 'IOE0999000666', [['ZZZ9', '2025-02-14T03:31:00.000Z']]);
  const section = activity(page);
  await expect(section.getByText(/The journey needs events that Waymark recognizes/)).toBeVisible();
  await expect(section.getByText('The only event is a background update.')).toBeVisible();
  await expect(section.getByText(/no notices in the case data/)).toBeVisible();

  const button = eventButton(page, 'Unrecognized event');
  await button.click();
  const panel = await region(page, button);
  await expect(panel).toContainText('does not describe');
  await expect(panel).toContainText('often background activity');
  await expect(panel).toContainText('Not in the community dictionary, and not from USCIS.');
  await expect(panel.locator('.t-mono', { hasText: /^ZZZ9$/ })).toBeVisible();
});

test('explains what is missing when there are no USCIS events', async ({ page }) => {
  // A status of "Other update" has no stage, so nothing can be drawn yet.
  await addCaseManually(page, { receipt: 'IOE0999000333', date: '2025-01-15', status: 'other' });
  const section = activity(page);
  await expect(section.getByText(/No USCIS events yet\./)).toBeVisible();
  await section.getByRole('button', { name: 'Import USCIS events' }).click();
  await expect(page.getByRole('dialog', { name: 'Import USCIS case JSON' })).toBeVisible();
});

test('builds a journey from logged statuses and asks for USCIS events for the rest', async ({
  page,
}) => {
  await loadExample(page);
  await page.locator('a.card', { hasText: 'MSC0000000003' }).click();
  const section = activity(page);
  await expect(section.getByText('Built from the statuses you logged.')).toBeVisible();
  await expect(section.getByRole('img', { name: /Journey through the stages/ })).toBeVisible();
  await expect(
    section.getByText(/Notices, background updates, and events per month come from USCIS events/),
  ).toBeVisible();
  await expect(section.getByRole('button', { name: 'Import USCIS events' })).toBeVisible();
  await noHorizontalScroll(page);
});

test('labels official API events and notes that background updates are missing', async ({
  page,
}) => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const receipt = 'IOE0999000888';
  await fakeSyncServer(page, {
    cases: {
      [receipt]: officialCase(receipt, [
        ['Case Was Received', daysAgo(400)],
        ['Case Is Being Actively Reviewed By USCIS', daysAgo(60)],
        ['Case Was Approved', daysAgo(2)],
      ]),
    },
  });
  await page.goto('./#/settings');
  const settings = page.getByRole('region', { name: 'Automatic checks' });
  await settings.getByLabel('Server address').fill(SYNC_URL);
  await settings.getByRole('button', { name: 'Turn on automatic checks' }).click();
  await expect(settings.getByText(/^On\. /)).toBeVisible();
  await dismissSnackbar(page);
  await page.goto('./#/cases');
  await page.getByRole('button', { name: 'Add case' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  await dialog.getByRole('textbox', { name: 'Receipt number' }).fill(receipt);
  await dialog.getByRole('button', { name: 'Add case' }).click();
  await expect(dialog).toBeHidden();
  await expect(snackbar(page, `Added case ${receipt}.`)).toBeVisible();

  const button = eventButton(page, 'Case Was Approved');
  await button.click();
  const panel = await region(page, button);
  await expect(panel.getByText('From the official USCIS Case Status API.')).toBeVisible();
  await expect(panel.getByText(/Community documented/)).toHaveCount(0);
  await expect(panel).toContainText('USCIS approved the case.');

  const section = activity(page);
  await expect(
    section.getByText(/These events come from the official Case Status API/),
  ).toBeVisible();
  await expect(
    section.getByText('3 of 3 events are notices and 0 are background updates.'),
  ).toBeVisible();
});

const VARIANTS = [
  { name: 'light', prefs: { theme: 'light' } },
  { name: 'dark', prefs: { theme: 'dark' } },
  { name: 'light high contrast', prefs: { theme: 'light', highContrast: true } },
  { name: 'dark high contrast', prefs: { theme: 'dark', highContrast: true } },
];

for (const variant of VARIANTS) {
  test(`axe: case page with explained events in ${variant.name}`, async ({ page }) => {
    await setPrefs(page, variant.prefs);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openExampleCase(page);
    for (const label of ['Interview scheduled', 'Case on hold or pending review']) {
      const button = eventButton(page, label);
      await button.click();
      await expect(await region(page, button)).toBeVisible();
    }
    await expectNoAxeViolations(page);
    await activity(page).getByRole('radio', { name: 'Table' }).click();
    await expectNoAxeViolations(page);
    await noHorizontalScroll(page);
  });
}
