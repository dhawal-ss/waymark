import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, loadExample, open, PAGES, setPrefs } from './helpers';

const VARIANTS = [
  { name: 'light', prefs: { theme: 'light' } },
  { name: 'dark', prefs: { theme: 'dark' } },
  { name: 'light high contrast', prefs: { theme: 'light', highContrast: true } },
  { name: 'dark high contrast', prefs: { theme: 'dark', highContrast: true } },
  { name: 'marigold light', prefs: { theme: 'light', seed: '#eaa221' } },
];

for (const variant of VARIANTS) {
  for (const p of PAGES) {
    test(`axe: ${p.path} in ${variant.name}`, async ({ page }) => {
      await setPrefs(page, variant.prefs);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, p.path);
      await expectNoAxeViolations(page);
    });
  }
}

test('axe: open sheet and FAB menu', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '/settings/design');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open sheet' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('focus is visible on interactive elements', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('radio', { name: 'Light' }).focus();
  await page.keyboard.press('ArrowLeft');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).toBe('solid');
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test('reduced motion stops the loading indicator and shortens transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '/settings/design');
  const path = page
    .getByRole('progressbar', { name: 'Loading example', exact: true })
    .locator('path');
  const first = await path.getAttribute('d');
  await page.waitForTimeout(400);
  expect(await path.getAttribute('d')).toBe(first);
  const duration = await page
    .getByRole('button', { name: 'Filled' })
    .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(duration).toBeLessThan(0.01);
});

for (const variant of VARIANTS.slice(0, 3)) {
  test(`axe: screens with example data in ${variant.name}`, async ({ page }) => {
    await setPrefs(page, variant.prefs);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadExample(page);
    await expectNoAxeViolations(page);
    await page.locator('a.card').first().click();
    await expect(page.locator('main h1')).toHaveText('Alex');
    await expectNoAxeViolations(page);
    for (const path of ['/insights', '/updates', '/tools']) {
      await page.goto(`./#${path}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });
}

test('axe: add case and import sheets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Add case' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add case' }).click();
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Import USCIS JSON' }).click();
  await expectNoAxeViolations(page);
});
