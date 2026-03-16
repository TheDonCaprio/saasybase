import { test, expect, type Page } from '@playwright/test';

const email = process.env.PLAYWRIGHT_E2E_EMAIL;
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

async function signIn(page: Page) {
  await page.goto('/sign-in');

  const identifier = page.locator('input[name="identifier"], input[name="emailAddress"], input[type="email"]').first();
  await expect(identifier).toBeVisible();
  await identifier.fill(email as string);

  const continueButton = page.getByRole('button', { name: /continue|next|sign in/i }).first();
  await continueButton.click();

  const passwordField = page.locator('input[name="password"], input[type="password"]').first();
  await expect(passwordField).toBeVisible();
  await passwordField.fill(password as string);

  const signInButton = page.getByRole('button', { name: /sign in|continue/i }).last();
  await signInButton.click();
}

test.describe('Dashboard navigation smoke', () => {
  test.skip(!email || !password, 'Set PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD to run dashboard smoke e2e.');

  test('navigates between core dashboard routes from the authenticated UI', async ({ page }) => {
    await signIn(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    const billingLink = page.locator('a[href="/dashboard/billing"]').first();
    await expect(billingLink).toBeVisible();
    await billingLink.click();
    await expect(page).toHaveURL(/\/dashboard\/billing(?:\?.*)?$/);

    const notificationsLink = page.locator('a[href="/dashboard/notifications"]').first();
    await expect(notificationsLink).toBeVisible();
    await notificationsLink.click();
    await expect(page).toHaveURL(/\/dashboard\/notifications(?:\?.*)?$/);

    const dashboardLink = page.locator('a[href="/dashboard"]').first();
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.click();
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
  });
});