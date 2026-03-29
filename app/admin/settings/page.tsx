import React from 'react';
export const dynamic = 'force-dynamic';
import os from 'os';
import { requireAdminAuth } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { toError } from '../../../lib/runtime-guards';
import { AdminSettingsTabs } from '../../../components/admin/AdminSettingsTabs';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../../../lib/settings';
import { fetchModeratorPermissions } from '../../../lib/moderator';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

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
    { key: 'NODE_ENV', value: process.env.NODE_ENV || 'development', description: 'Application environment' },
    { key: 'AUTH_PROVIDER', value: process.env.AUTH_PROVIDER || 'clerk', description: 'Active authentication provider' },
    { key: 'PAYMENT_PROVIDER', value: process.env.PAYMENT_PROVIDER || 'stripe', description: 'Active payment provider' },
    { key: 'DEMO_READ_ONLY_MODE', value: process.env.DEMO_READ_ONLY_MODE === 'true' ? 'ENABLED' : 'DISABLED', description: 'Global demo write protection' }
  ];

  const memoryUsage = process.memoryUsage();
  const runtimeSnapshot = {
    nodeVersion: process.version,
    runtime: process.release.name,
    deploymentTarget: process.env.VERCEL ? 'Vercel' : 'Node server',
    authProvider: process.env.AUTH_PROVIDER || 'clerk',
    paymentProvider: process.env.PAYMENT_PROVIDER || 'stripe',
    demoMode: process.env.DEMO_READ_ONLY_MODE === 'true' ? 'Enabled' : 'Disabled',
    platform: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpuCores: `${os.cpus().length} logical cores`,
    totalMemory: formatBytes(os.totalmem()),
    freeMemory: formatBytes(os.freemem()),
    rssMemory: formatBytes(memoryUsage.rss),
    heapUsed: formatBytes(memoryUsage.heapUsed),
    appUptime: formatDuration(process.uptime()),
    hostUptime: formatDuration(os.uptime()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };

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
        runtimeSnapshot={runtimeSnapshot}
      />
    </div>
  );
}
