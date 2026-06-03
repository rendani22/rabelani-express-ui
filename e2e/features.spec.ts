import { expect, Page, test } from '@playwright/test';

const SUPABASE_URL = 'https://udsigrijzqgmtmkilluv.supabase.co';
const USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'rendani@email.com',
};

const SESSION = {
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'test-refresh-token',
  user: USER,
};

async function mockSupabase(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-tour-completed-v1', 'true');
    localStorage.setItem('onboarding-tour-orders-completed-v1', 'true');
  });

  await page.route(`${SUPABASE_URL}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.startsWith('/auth/v1/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) });
      return;
    }

    if (path.startsWith('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) });
      return;
    }

    if (path.startsWith('/auth/v1/logout') || path.startsWith('/auth/v1/recover')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1]?.split('/')[0] ?? '';
      const acceptHeader = (await request.headerValue('accept')) ?? '';
      const wantsObject = acceptHeader.includes('application/vnd.pgrst.object+json');

      let payload: unknown = [];

      switch (table) {
        case 'staff_profiles':
          payload = wantsObject
            ? { id: 'staff-1', user_id: USER.id, email: USER.email, role: 'admin', first_name: 'Test', last_name: 'Admin' }
            : [{ id: 'staff-1', user_id: USER.id, email: USER.email, role: 'admin', first_name: 'Test', last_name: 'Admin' }];
          break;
        case 'email_templates':
          payload = [{
            id: 'template-1',
            key: 'order_created',
            name: 'Order Created',
            description: 'Template for new order notifications',
            subject: 'Order {{reference}} created',
            html_body: '<p>Hello {{receiver_name}}</p>',
            sample_data: { reference: 'REF-001', receiver_name: 'Receiver' },
            cc: [],
            bcc: [],
            version: 1,
            updated_at: new Date().toISOString(),
          }];
          break;
        default:
          payload = [];
          break;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
      return;
    }

    if (path.startsWith('/functions/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(USER.email);
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('covers login form behavior', async ({ page }) => {
  await mockSupabase(page);

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back!' })).toBeVisible();

  const passwordInput = page.locator('#password');
  await expect(passwordInput).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'text');

  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email Address').fill(USER.email);
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('covers main navigation features and route actions', async ({ page }) => {
  await mockSupabase(page);
  await login(page);

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: /^Filter$/ }).click();
  await expect(page.getByText('Filters')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();

  await page.getByRole('link', { name: 'Orders' }).click();
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page).toHaveURL(/\/orders\/completed$/);
  await expect(page.locator('h1', { hasText: 'Completed Orders' })).toBeVisible();

  await page.getByRole('link', { name: 'Drivers' }).click();
  await expect(page.getByRole('heading', { name: 'Driver Management' })).toBeVisible();
  await page.getByRole('button', { name: /List View|Map View/ }).click();

  await page.getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await page.getByLabel('Search customers').fill('test customer');

  await page.getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  await page.getByPlaceholder('Search users...').fill('test user');
});

test('covers additional feature pages and core interactions', async ({ page }) => {
  await mockSupabase(page);
  await login(page);

  await page.goto('/delivery-locations');
  await expect(page.getByRole('heading', { name: 'Delivery Points' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Delivery Point' }).click();
  await expect(page.getByText('New Delivery Point')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).first().click();

  await page.goto('/email-templates');
  await expect(page.getByRole('heading', { name: 'Email Templates' })).toBeVisible();
  await page.getByRole('button', { name: 'Order Created' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByText('Saved!')).toBeVisible();

  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Item' }).click();
  await expect(page.getByText('New Inventory Item')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).first().click();

  await page.goto('/inventory/movements');
  await expect(page.getByRole('heading', { name: 'Recent Movements' })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh' }).click();

  await page.goto('/pods/bulk-downloads');
  await expect(page.getByRole('heading', { name: 'Bulk POD Downloads' })).toBeVisible();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();

  await page.goto('/orders/deleted');
  await expect(page.getByRole('heading', { name: 'Deleted orders' })).toBeVisible();

  await page.goto('/orders/completed');
  await expect(page.locator('h1', { hasText: 'Completed Orders' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
