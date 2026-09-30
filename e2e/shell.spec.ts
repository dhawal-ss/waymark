import { expect, test } from '@playwright/test';
import { loadExample, open, PAGES } from './helpers';

test('shows the footer notice on every page', async ({ page }) => {
  for (const p of PAGES) {
    await open(page, p.path);
    await expect(page.getByRole('contentinfo')).toHaveText(
      'Stored on this device only. Not legal advice. Not affiliated with USCIS.',
    );
  }
});

test('navigates between tabs and marks the current one', async ({ page }) => {
  await open(page, '/cases');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Insights', 'Updates', 'Tools', 'Settings', 'Cases']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.locator('main h1')).toHaveText(name);
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main h1')).toBeFocused();
  }
});

test('has no horizontal scroll', async ({ page }) => {
  for (const p of PAGES) {
    await open(page, p.path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, p.path).toBeLessThanOrEqual(0);
  }
});

test('uses a bottom bar on mobile and a rail from 840px', async ({ page }, info) => {
  await open(page, '/cases');
  const box = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
  expect(box).not.toBeNull();
  if (info.project.name === 'mobile-360') {
    expect(box!.y).toBeGreaterThan(600);
    expect(box!.width).toBe(360);
  } else {
    expect(box!.x).toBe(0);
    expect(box!.width).toBe(96);
  }
});

test('skip link moves focus to the main content', async ({ page }) => {
  await open(page, '/settings');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('makes no requests to other origins', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL!).origin) {
      external.push(req.url());
    }
  });
  for (const p of PAGES) await open(page, p.path);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
});

test('falls back to Cases for unknown routes', async ({ page }) => {
  await page.goto('./#/nope');
  await expect(page.locator('main h1')).toHaveText('Cases');
});

test('runs under the content security policy without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('./#/cases');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await loadExample(page);
  for (const p of PAGES) await open(page, p.path);
  expect(violations).toEqual([]);
});
