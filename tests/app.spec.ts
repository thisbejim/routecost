import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('RouteCost planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Road trip cost planner' })).toBeVisible();
  });

  test('shows a complete sample budget and updates from user input', async ({ page }) => {
    await expect(page.getByText('Estimated total')).toBeVisible();
    await expect(page.locator('.total-amount')).not.toHaveText('AUD 0');

    const distance = page.locator('input[data-field="leg:leg-1.distance"]');
    await distance.fill('500');
    await expect(page.locator('.inline-note')).toContainText('580 km one way');
    await expect(page.locator('.total-amount')).toHaveText(/(?:A\$|AUD)/);
  });

  test('switches to EV, adds a leg, and keeps comparison visible', async ({ page }) => {
    await page.getByRole('button', { name: /Electric vehicle/ }).click();
    await expect(page.getByText('Efficiency (kWh / 100 km)')).toBeVisible();
    await page.getByRole('button', { name: 'Add another leg' }).click();
    await expect(page.locator('#legs-list .leg-row')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Compare vehicle energy' })).toBeVisible();
  });

  test('supports imperial conversion and share-link state', async ({ page }) => {
    await page.getByRole('button', { name: /US \/ imperial/ }).click();
    await expect(page.locator('input[data-field="leg:leg-1.distance"]')).toHaveValue(/217/);
    await expect(page.locator('.inline-note')).toContainText('mi one way');
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page).toHaveURL(/#share=/);
  });

  test('has no detectable accessibility violations on the main view', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
