# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: inventory.spec.ts >> inventory (authenticated) >> renders inventory page
- Location: tests/e2e/inventory.spec.ts:9:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /inventory/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /inventory/i })

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
  4  | test.describe('inventory (authenticated)', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await signIn(page);
  7  |   });
  8  | 
  9  |   test('renders inventory page', async ({ page }) => {
  10 |     await page.goto('/inventory');
> 11 |     await expect(page.getByRole('heading', { name: /inventory/i })).toBeVisible();
     |                                                                     ^ Error: expect(locator).toBeVisible() failed
  12 |   });
  13 | });
  14 | 
```