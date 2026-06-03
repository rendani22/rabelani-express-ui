import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('delivery locations (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders delivery locations page', async ({ page }) => {
    await page.goto('/delivery-locations');
    await expect(page.getByRole('heading', { name: /delivery locations|locations/i })).toBeVisible();
  });
});
