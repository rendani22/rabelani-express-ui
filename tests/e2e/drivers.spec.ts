import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('drivers (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders drivers page', async ({ page }) => {
    await page.goto('/drivers');
    await expect(page.getByRole('heading', { name: /drivers?/i })).toBeVisible();
  });
});
