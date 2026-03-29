import { test, expect, type Page } from '@playwright/test';

const adminEmail = process.env.PLAYWRIGHT_E2E_ADMIN_EMAIL || 'admin@saasybase.com';
const adminPassword = process.env.PLAYWRIGHT_E2E_ADMIN_PASSWORD || 'password';
const demoReadOnlyEnabled = process.env.PLAYWRIGHT_DEMO_READ_ONLY === 'true';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');

  const identifier = page.locator('input[name="identifier"], input[name="emailAddress"], input[type="email"]').first();
  await expect(identifier).toBeVisible();
  await identifier.fill(email);

  const continueButton = page.getByRole('button', { name: /continue|next|sign in/i }).first();
  await continueButton.click();

  const passwordField = page.locator('input[name="password"], input[type="password"]').first();
  await expect(passwordField).toBeVisible();
  await passwordField.fill(password);

  const signInButton = page.getByRole('button', { name: /sign in|continue/i }).last();
  await signInButton.click();
}

test.describe('Demo read-only admin regression', () => {
  test.skip(!demoReadOnlyEnabled, 'Set PLAYWRIGHT_DEMO_READ_ONLY=true to run demo read-only e2e checks.');

  test('allows admin UI access but blocks admin writes', async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ key: 'SITE_NAME', value: 'Should Not Persist' }),
      });

      const body = await res.json().catch(() => ({}));
      return {
        status: res.status,
        demoHeader: res.headers.get('X-Demo-Read-Only'),
        error: typeof body?.error === 'string' ? body.error : null,
      };
    });

    expect(response.status).toBe(403);
    expect(response.demoHeader).toBe('true');
    expect(response.error).toMatch(/read-only/i);
  });
});
