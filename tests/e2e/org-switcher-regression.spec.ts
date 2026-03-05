import { test, expect } from '@playwright/test';

const email = process.env.PLAYWRIGHT_E2E_EMAIL;
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;
const fromOrg = process.env.PLAYWRIGHT_ORG_FROM || 'Leggo';
const toOrg = process.env.PLAYWRIGHT_ORG_TO || 'Lagga';

test.describe('Header org switcher regression', () => {
  test.skip(!email || !password, 'Set PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD to run org-switcher e2e.');

  test('switches active organization from header dropdown', async ({ page }) => {
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

    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Account menu' }).click();

    const workspaceRow = page.locator('p').filter({ hasText: 'Workspace' }).first();
    await expect(workspaceRow).toBeVisible();

    const switcherTrigger = page.locator('[class*="cl-organizationSwitcherTrigger"]').first();
    await expect(switcherTrigger).toBeVisible();
    await switcherTrigger.click();

    const targetOrgOption = page.getByText(new RegExp(`^${toOrg}$`, 'i')).first();
    await expect(targetOrgOption).toBeVisible();
    await targetOrgOption.click();

    await page.waitForTimeout(900);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText(new RegExp(`${toOrg}\\s*·`, 'i')).first()).toBeVisible();

    await expect(page.getByText(new RegExp(`${fromOrg}\\s*·`, 'i')).first()).toHaveCount(0);
  });
});
