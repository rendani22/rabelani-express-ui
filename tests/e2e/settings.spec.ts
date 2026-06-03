import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('settings (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });
});
