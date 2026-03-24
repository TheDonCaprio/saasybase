import { test, expect, type Browser, type Page } from '@playwright/test';

const userEmail = process.env.PLAYWRIGHT_E2E_EMAIL;
const userPassword = process.env.PLAYWRIGHT_E2E_PASSWORD;
const adminEmail = process.env.PLAYWRIGHT_E2E_ADMIN_EMAIL;
const adminPassword = process.env.PLAYWRIGHT_E2E_ADMIN_PASSWORD;
const targetOrg = process.env.PLAYWRIGHT_ORG_DELETE || process.env.PLAYWRIGHT_ORG_TO;
const recoveryToast = 'This workspace is no longer available. Switched you back to your personal workspace.';

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

async function switchToWorkspace(page: Page, workspaceName: string) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Account menu' }).click();

  const switcherTrigger = page.locator('[data-auth-org-switcher="account-menu"]').getByRole('button').first();
  await expect(switcherTrigger).toBeVisible();
  await switcherTrigger.click();

  const targetOrgOption = page.getByText(new RegExp(`^${workspaceName}$`, 'i')).first();
  await expect(targetOrgOption).toBeVisible();
  await targetOrgOption.click();

  await page.waitForTimeout(900);
  await page.goto('/dashboard/team');
  await expect(page).toHaveURL(/\/dashboard\/team(?:\?.*)?$/);
}

async function deleteOrganizationByName(page: Page, workspaceName: string) {
  const result = await page.evaluate(async (name) => {
    const listResponse = await fetch(`/api/admin/organizations?search=${encodeURIComponent(name)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!listResponse.ok) {
      return { ok: false, error: `List failed with ${listResponse.status}` };
    }

    const listPayload = await listResponse.json() as { data?: Array<{ id: string; name: string; slug: string }> };
    const organization = (listPayload.data ?? []).find((entry) => {
      const lowerName = entry.name.toLowerCase();
      const lowerSlug = entry.slug.toLowerCase();
      const lowerTarget = name.toLowerCase();
      return lowerName === lowerTarget || lowerSlug === lowerTarget;
    });

    if (!organization) {
      return { ok: false, error: `Organization ${name} not found` };
    }

    const deleteResponse = await fetch(`/api/admin/organizations/${organization.id}/delete`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!deleteResponse.ok) {
      const errorPayload = await deleteResponse.json().catch(() => ({}));
      const error = typeof errorPayload?.error === 'string' ? errorPayload.error : `Delete failed with ${deleteResponse.status}`;
      return { ok: false, error };
    }

    return { ok: true };
  }, workspaceName);

  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
}

async function expectWorkspaceFallback(page: Page, workspaceName: string) {
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(recoveryToast)).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText(new RegExp(`${workspaceName}\\s*·`, 'i')).first()).toHaveCount(0);
}

test.describe('Active workspace deletion recovery', () => {
  test.skip(
    !userEmail || !userPassword || !adminEmail || !adminPassword || !targetOrg,
    'Set PLAYWRIGHT_E2E_EMAIL, PLAYWRIGHT_E2E_PASSWORD, PLAYWRIGHT_E2E_ADMIN_EMAIL, PLAYWRIGHT_E2E_ADMIN_PASSWORD, and PLAYWRIGHT_ORG_DELETE to run workspace deletion recovery e2e.',
  );

  test('falls back to personal workspace and shows a toast when the active workspace is deleted elsewhere', async ({ browser }) => {
    const userContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const adminPage = await adminContext.newPage();

    try {
      await signIn(userPage, userEmail as string, userPassword as string);
      await switchToWorkspace(userPage, targetOrg as string);

      await signIn(adminPage, adminEmail as string, adminPassword as string);
      await deleteOrganizationByName(adminPage, targetOrg as string);

      await expectWorkspaceFallback(userPage, targetOrg as string);
    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });
});