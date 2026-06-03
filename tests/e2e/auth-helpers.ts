import { Page } from '@playwright/test';

export async function signIn(page: Page) {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL || 'test@example.com';
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || 'password';

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait briefly for navigation to a protected route (dashboard or root)
  await page.waitForURL(/(dashboard|\/$)/, { timeout: 10_000 }).catch(() => {});
}
