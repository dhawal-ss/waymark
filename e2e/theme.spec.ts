import { expect, test } from '@playwright/test';
import { cssVar, open, setPrefs } from './helpers';

test('switches theme with the connected button group and keeps it after reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, '/settings');
  const lightSurface = await cssVar(page, '--surface');

  await page
    .getByRole('radiogroup', { name: 'Theme' })
    .getByRole('radio', { name: 'Dark' })
    .click();
  const darkSurface = await cssVar(page, '--surface');
  expect(darkSurface).not.toBe(lightSurface);

  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
  expect(await cssVar(page, '--surface')).toBe(darkSurface);
  await expect(
    page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('moves between theme options with arrow keys', async ({ page }) => {
  await open(page, '/settings');
  const group = page.getByRole('radiogroup', { name: 'Theme' });
  await group.getByRole('radio', { name: 'System' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Light' })).toBeFocused();
  await expect(group.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
});

test('follows the system color scheme in System mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, '/settings');
  const light = await cssVar(page, '--surface');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => cssVar(page, '--surface')).not.toBe(light);
});

test('changes the primary color from a seed preset', async ({ page }) => {
  await open(page, '/settings');
  const before = await cssVar(page, '--primary');
  await page.getByRole('radio', { name: 'Rose' }).click();
  await expect(page.getByRole('radio', { name: 'Rose' })).toHaveAttribute('aria-checked', 'true');
  expect(await cssVar(page, '--primary')).not.toBe(before);
});

test('high contrast strengthens outlines', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, '/settings');
  const before = await cssVar(page, '--outline');
  await page.getByRole('switch', { name: 'High contrast' }).check();
  expect(await cssVar(page, '--outline')).not.toBe(before);
});

test('applies the cached theme before the app script runs', async ({ page }) => {
  await setPrefs(page, { theme: 'dark' });
  await open(page, '/cases');
  const css = await page.evaluate(() => localStorage.getItem('waymark:theme-css'));
  expect(css).toContain('color-scheme:dark');
  const html = await (await page.request.get('./')).text();
  expect(html).toContain("localStorage.getItem('waymark:theme-css')");
});
