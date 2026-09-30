import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PAGES = [
  { path: '/cases', title: 'Cases' },
  { path: '/insights', title: 'Insights' },
  { path: '/updates', title: 'Updates' },
  { path: '/tools', title: 'Tools' },
  { path: '/settings', title: 'Settings' },
  { path: '/settings/design', title: 'Design system' },
] as const;

export async function open(page: Page, path: string): Promise<void> {
  await page.goto(`./#${path}`);
  await expect(page.locator('main h1')).toBeVisible();
}

export async function setPrefs(
  page: Page,
  prefs: Partial<{ theme: string; highContrast: boolean; seed: string }>,
): Promise<void> {
  await page.addInitScript((p) => {
    localStorage.setItem('waymark:prefs', JSON.stringify(p));
    localStorage.removeItem('waymark:theme-css');
  }, prefs);
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`),
  }));
  expect(summary).toEqual([]);
}

export async function cssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

export const FIXTURES = 'packages/core/test/fixtures';

export async function loadExample(page: Page): Promise<void> {
  await open(page, '/cases');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('a.card')).toHaveCount(3);
  await dismissSnackbar(page);
}

export async function dismissSnackbar(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.isVisible()) await dismiss.click();
}

export function snackbar(page: Page, text: string | RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}
