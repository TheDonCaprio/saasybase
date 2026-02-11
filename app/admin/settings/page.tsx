import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { toError } from '../../../lib/runtime-guards';
import { AdminSettingsTabs } from '../../../components/admin/AdminSettingsTabs';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../../../lib/settings';
import { fetchModeratorPermissions } from '../../../lib/moderator';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Settings',
    description: 'Update branding, operations, and localization preferences for your site. Changes apply instantly across the platform.',
    audience: 'admin',
  });
}

export default async function AdminSettingsPage() {
  // Redirect non-admins to sign-in (or error page)
  await requireAdminAuth('/admin/settings');

  // Also ensure admin identity for auditing if needed
  try {
    await requireAdminAuth('/admin/settings');
  } catch (err: unknown) {
    // requireAdminAuth already redirected, so just swallow here
    // but log unexpected errors for observability
    const e = toError(err);
    // eslint-disable-next-line no-console
    console.warn('Admin settings: requireAdmin check failed or redirected', e?.message);
  }

  // Get database settings
  const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } }) as Array<{ key: string; value: string }>;
  const moderatorPermissions = await fetchModeratorPermissions();

  // Environment settings (read-only)
  // NOTE: SITE_NAME is intentionally not listed here so it can be edited and persisted via the Admin UI.
  const envSettings = [
    { key: 'STRIPE_MODE', value: process.env.STRIPE_SECRET_KEY?.includes('_test_') ? 'TEST' : 'LIVE', description: 'Stripe environment mode' },
    { key: 'DATABASE_TYPE', value: process.env.DATABASE_URL?.includes('sqlite') ? 'SQLite' : 'PostgreSQL', description: 'Database engine' },
    { key: 'CLERK_DOMAIN', value: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.includes('_test_') ? 'TEST' : 'LIVE', description: 'Clerk environment' },
    { key: 'NODE_ENV', value: process.env.NODE_ENV || 'development', description: 'Application environment' }
  ];

  const readSetting = (key: string, fallback = '') => settings.find((setting) => setting.key === key)?.value ?? fallback;

  const siteName = readSetting('SITE_NAME', process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
  const supportEmail = readSetting('SUPPORT_EMAIL', 'support@example.com');
  const stripeMode = envSettings.find((setting) => setting.key === 'STRIPE_MODE')?.value ?? 'UNKNOWN';
  const databaseType = envSettings.find((setting) => setting.key === 'DATABASE_TYPE')?.value ?? 'N/A';
  const nodeEnv = envSettings.find((setting) => setting.key === 'NODE_ENV')?.value ?? 'development';

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-100 via-purple-50 to-white p-8 shadow-[0_12px_45px_rgba(15,23,42,0.12)] dark:border-neutral-800 dark:from-blue-500/15 dark:via-purple-600/10 dark:to-transparent dark:shadow-[0_0_40px_rgba(59,130,246,0.15)]">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_60%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_60%)]" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-100">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse dark:bg-blue-300" />
              Control center
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-neutral-50">Admin Settings</h1>
            <p className="text-sm text-slate-600 dark:text-neutral-200/80">
              Update branding, operations, and localization preferences for <span className="font-semibold text-slate-900 dark:text-neutral-100">{siteName}</span>. Changes apply instantly across the platform.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-slate-900 sm:grid-cols-2 lg:text-right dark:text-neutral-100">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:shadow-inner">
              <p className="text-xs uppercase tracking-wide text-blue-600/80 dark:text-blue-100/70">Stripe mode</p>
              <p className="mt-1 text-lg font-semibold text-blue-700 dark:text-blue-100">{stripeMode}</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 shadow-sm dark:border-purple-500/30 dark:bg-purple-500/10 dark:shadow-inner">
              <p className="text-xs uppercase tracking-wide text-purple-600/80 dark:text-purple-100/70">Runtime</p>
              <p className="mt-1 text-lg font-semibold text-purple-700 dark:text-purple-100">{nodeEnv}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:shadow-inner">
              <p className="text-xs uppercase tracking-wide text-emerald-600/80 dark:text-emerald-100/70">Support inbox</p>
              <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-100" title={supportEmail}>{supportEmail}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:shadow-inner">
              <p className="text-xs uppercase tracking-wide text-amber-600/80 dark:text-amber-100/70">Database</p>
              <p className="mt-1 text-lg font-semibold text-amber-700 dark:text-amber-100">{databaseType}</p>
            </div>
          </div>
        </div>
      </div>


      <AdminSettingsTabs
        databaseSettings={settings}
        environmentSettings={envSettings}
        moderatorPermissions={moderatorPermissions}
      />
    </div>
  );
}
