import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('inventory (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders inventory page', async ({ page }) => {
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: /inventory/i })).toBeVisible();
  });
});
