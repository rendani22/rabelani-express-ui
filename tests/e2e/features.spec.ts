import { expect, test } from '@playwright/test';

/**
 * E2E tests for protected routes.
 *
 * All routes except /login require authentication.
 * An unauthenticated visitor should be redirected to the login page.
 */
test.describe('protected routes — unauthenticated redirect', () => {
  const protectedRoutes = [
    '/dashboard',
    '/orders',
    '/orders/completed',
    '/orders/deleted',
    '/customers',
    '/drivers',
    '/user-management',
    '/settings',
    '/inventory',
    '/inventory/movements',
    '/delivery-locations',
    '/email-templates',
    '/pods/bulk-downloads',
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to /login when not authenticated`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { name: 'Welcome back!' })).toBeVisible();
    });
  }
});

/**
 * E2E tests for the login page (public route).
 */
test.describe('login page', () => {
  test('shows required validation errors on empty submit', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows invalid email error for malformed email', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email Address').fill('not-an-email');
    await page.locator('#password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('toggles password field visibility', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#password').fill('mysecret');
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();

    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  });

  test('shows error for short password', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email Address').fill('user@example.com');
    await page.locator('#password').fill('abc');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The sign-in button should still be visible (form is invalid, no navigation)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('the root path redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login/);
  });
});
