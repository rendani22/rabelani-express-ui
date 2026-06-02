import { expect, test } from '@playwright/test';

test.describe('login page', () => {
  test('renders the login form and required validation messages', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back!' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('validates email input and toggles password visibility', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email Address').fill('invalid-email');
    await page.getByLabel('Password').fill('secret123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();

    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
  });
});
