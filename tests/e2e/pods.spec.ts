import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('pods (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders bulk pods downloads page', async ({ page }) => {
    await page.goto('/pods/bulk-downloads');
    await expect(page.getByRole('heading', { name: /bulk/i })).toBeVisible();
  });
});
