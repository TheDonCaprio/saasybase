import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { toError } from '../../../lib/runtime-guards';
import { AdminSettingsTabs } from '../../../components/admin/AdminSettingsTabs';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
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
  const databaseType = envSettings.find((setting) => setting.key === 'DATABASE_TYPE')?.value ?? 'N/A';
  const nodeEnv = envSettings.find((setting) => setting.key === 'NODE_ENV')?.value ?? 'development';

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Control"
        title="Settings"
        stats={[
          {
            label: 'Site',
            value: siteName,
            helper: 'Branding & localization',
            tone: 'purple'
          },
          {
            label: 'Environment',
            value: nodeEnv,
            helper: `${databaseType}`,
            tone: 'blue'
          }
        ]}
      />

      <AdminSettingsTabs
        databaseSettings={settings}
        environmentSettings={envSettings}
        moderatorPermissions={moderatorPermissions}
      />
    </div>
  );
}
