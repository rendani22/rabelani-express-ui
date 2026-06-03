import { test, expect } from '@playwright/test';
import { signIn } from './auth-helpers';

test.describe('email templates (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders email templates page', async ({ page }) => {
    await page.goto('/email-templates');
    await expect(page.getByRole('heading', { name: /email templates|templates/i })).toBeVisible();
  });
});
