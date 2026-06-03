import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('dashboard (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });
});
