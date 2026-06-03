import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('orders (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders orders list', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
  });
});
