# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: orders.spec.ts >> orders (authenticated) >> renders orders list
- Location: tests/e2e/orders.spec.ts:9:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /orders/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /orders/i })

```

```yaml
- main:
  - link "Go to homepage":
    - /url: /
    - text: RabelaniExpress Logistics Solutions
  - heading "Welcome back!" [level=1]
  - text: Email Address
  - textbox "Email Address":
    - /placeholder: you@example.com
  - text: Password
  - textbox "Password":
    - /placeholder: Enter your password
  - button "Show password":
    - img
  - link "Forgot Password?":
    - /url: /reset-password
  - button "Sign In"
  - paragraph: Don't have an account? Request access from your administrator.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { signIn } from './auth-helpers';
  3  | 
  4  | test.describe('orders (authenticated)', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await signIn(page);
  7  |   });
  8  | 
  9  |   test('renders orders list', async ({ page }) => {
  10 |     await page.goto('/orders');
> 11 |     await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
     |                                                                  ^ Error: expect(locator).toBeVisible() failed
  12 |   });
  13 | 
  14 |   test('opens and closes create package modal', async ({ page }) => {
  15 |     await page.goto('/orders');
  16 | 
  17 |     await page.getByRole('button', { name: /add order/i }).click();
  18 |     await expect(page.getByRole('heading', { name: 'Create New Package' })).toBeVisible();
  19 | 
  20 |     await page.getByRole('button', { name: 'Cancel' }).click();
  21 |     await expect(page.getByRole('heading', { name: 'Create New Package' })).not.toBeVisible();
  22 |   });
  23 | 
  24 |   test('updates the status filter label when a status is selected', async ({ page }) => {
  25 |     await page.goto('/orders');
  26 | 
  27 |     const statusFilterButton = page.getByRole('button', { name: /all statuses/i });
  28 |     await statusFilterButton.click();
  29 | 
  30 |     await page.getByRole('button', { name: 'Pending' }).click();
  31 |     await expect(page.getByRole('button', { name: /pending/i })).toBeVisible();
  32 |   });
  33 | 
  34 |   test('navigates to completed orders and back to orders', async ({ page }) => {
  35 |     await page.goto('/orders');
  36 | 
  37 |     await page.getByRole('button', { name: /completed/i }).click();
  38 |     await expect(page).toHaveURL(/\/orders\/completed/);
  39 |     await expect(page.getByRole('heading', { name: 'Completed Orders' })).toBeVisible();
  40 | 
  41 |     await page.getByRole('link', { name: /back to orders/i }).click();
  42 |     await expect(page).toHaveURL(/\/orders$/);
  43 |     await expect(page.getByRole('heading', { name: /^orders$/i })).toBeVisible();
  44 |   });
  45 | 
  46 |   test('allows entering a search query', async ({ page }) => {
  47 |     await page.goto('/orders');
  48 | 
  49 |     const searchInput = page.getByPlaceholder('Search by PO number or receiver name...');
  50 |     await searchInput.fill('PO-123');
  51 |     await expect(searchInput).toHaveValue('PO-123');
  52 |   });
  53 | });
  54 | 
```