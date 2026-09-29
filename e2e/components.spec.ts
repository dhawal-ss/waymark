import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.beforeEach(async ({ page }) => {
  await open(page, '/settings/design');
});

test('sheet opens as a modal, closes with Escape, and returns focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open sheet' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Add case' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('snackbar shows an action that runs', async ({ page }) => {
  await page.getByRole('button', { name: 'Show snackbar' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Imported 4 events' });
  await expect(status).toBeVisible();
  await status.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Import undone.' })).toBeVisible();
});

test('FAB menu opens, moves focus to the first item, and closes with Escape', async ({ page }) => {
  const fab = page.getByRole('button', { name: 'Add', exact: true });
  await fab.click();
  await expect(page.getByRole('button', { name: 'New case' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Import JSON' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'New case' })).toBeHidden();
  await expect(fab).toBeFocused();
});

test('split button menu opens from the keyboard', async ({ page }) => {
  const menuButton = page.getByRole('button', { name: 'Quick statuses' });
  await menuButton.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Quick statuses' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Interview scheduled' })).toBeVisible();
  await expect(menuButton).toBeFocused();
});

test('floating toolbar uses arrow keys between buttons', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Case actions' });
  await toolbar.getByRole('button', { name: 'Edit case' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Add deadline' })).toBeFocused();
});

test('filter chips toggle aria-pressed', async ({ page }) => {
  const chip = page.getByRole('button', { name: 'Data' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
});

test('text field shows a precise error for an invalid receipt', async ({ page }) => {
  const section = page.locator('#ds-inputs');
  const field = section.getByRole('textbox', { name: 'Receipt number' });
  await field.fill('IOE123');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(/Enter 3 letters and 10 digits/);
  await field.fill('ioe-0912345678');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});

test('chart switches to an accessible table view', async ({ page }) => {
  await page
    .getByRole('radiogroup', { name: /Processing time, demo offices view/ })
    .getByRole('radio', { name: 'Table' })
    .click();
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Office A (months)' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(8);
});

test('chart announces values from the keyboard', async ({ page }) => {
  const plot = page.getByRole('group', { name: /Use the left and right arrow keys/ });
  await plot.focus();
  await page.keyboard.press('Home');
  await expect(plot.locator('[aria-live]')).toContainText(
    'Jan 1, 2025: Office A 10.5 months, Office B 8 months',
  );
});

test('labels demo data', async ({ page }) => {
  await expect(page.getByText('Demo data')).toBeVisible();
});
