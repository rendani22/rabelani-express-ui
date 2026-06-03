import { chromium } from '@playwright/test';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4200';
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (!email || !password) {
    console.error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD must be set for globalSetup');
    await browser.close();
    return;
  }

  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email Address').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for a protected route to load
  await page.waitForURL(/(dashboard|\/)/, { timeout: 15_000 }).catch(() => {});

  await context.storageState({ path: 'tests/e2e/storageState.json' });
  await browser.close();
}
