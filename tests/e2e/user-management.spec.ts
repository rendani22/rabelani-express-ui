import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('user management (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders user management page', async ({ page }) => {
    await page.goto('/user-management');
    await expect(page.getByRole('heading', { name: /user management|users/i })).toBeVisible();
  });
});
