import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminPageAccess } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import { toError } from '../../../../lib/runtime-guards';
import { AdminSettingsTabs } from '../../../../components/admin/AdminSettingsTabs';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../../../../lib/settings';
import { fetchModeratorPermissions } from '../../../../lib/moderator';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSliders } from '@fortawesome/free-solid-svg-icons';
import { Logger } from '../../../../lib/logger';
import { getAdminEnvironmentSettings } from '../../../../lib/admin-system-snapshot';
import { getTrafficAnalyticsProviderHealth } from '../../../../lib/traffic-analytics-config';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Settings',
    description: 'Update branding, operations, and localization preferences for your site. Changes apply instantly across the platform.',
    audience: 'admin',
  });
}

export default async function AdminSettingsPage() {
  // Redirect non-admins to sign-in (or error page)
  await requireAdminPageAccess('/admin/settings');

  // Also ensure admin identity for auditing if needed
  try {
    await requireAdminPageAccess('/admin/settings');
  } catch (err: unknown) {
    // requireAdminPageAccess already redirected, so just swallow here
    // but log unexpected errors for observability
    const e = toError(err);
    Logger.warn('Admin settings: requireAdmin check failed or redirected', { error: e?.message });
  }

  // Get database settings
  const settings = await prisma.setting.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, value: true },
  }) as Array<{ key: string; value: string }>;
  const moderatorPermissions = await fetchModeratorPermissions();
  const trafficAnalyticsHealth = await getTrafficAnalyticsProviderHealth();

  // Environment settings (read-only)
  // NOTE: SITE_NAME is intentionally not listed here so it can be edited and persisted via the Admin UI.
  const envSettings = await getAdminEnvironmentSettings();

  const readSetting = (key: string, fallback = '') => {
    const value = settings.find((setting) => setting.key === key)?.value;
    if (typeof value !== 'string') {
      return fallback;
    }

    return value.trim() === '' ? fallback : value;
  };

  const effectiveEditableSettings = [
    { key: 'MAINTENANCE_MODE', value: readSetting('MAINTENANCE_MODE', SETTING_DEFAULTS[SETTING_KEYS.MAINTENANCE_MODE]) },
    { key: 'FREE_PLAN_TOKEN_LIMIT', value: readSetting('FREE_PLAN_TOKEN_LIMIT', SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT]) },
    { key: 'FREE_PLAN_RENEWAL_TYPE', value: readSetting('FREE_PLAN_RENEWAL_TYPE', SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]) },
    {
      key: 'FREE_PLAN_TOKEN_NAME',
      value: (() => {
        const customName = readSetting('FREE_PLAN_TOKEN_NAME', SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_NAME]).trim();
        if (customName) return customName;
        return readSetting('DEFAULT_TOKEN_LABEL', SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL]).trim() || SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL];
      })(),
    },
    {
      key: 'DEFAULT_TOKEN_LABEL',
      value: (() => {
        const label = readSetting('DEFAULT_TOKEN_LABEL', SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL]).trim();
        return label || SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL];
      })(),
    },
    { key: 'ENABLE_RECURRING_PRORATION', value: readSetting('ENABLE_RECURRING_PRORATION', SETTING_DEFAULTS[SETTING_KEYS.ENABLE_RECURRING_PRORATION]) },
    { key: 'SUPPORT_EMAIL', value: readSetting('SUPPORT_EMAIL', process.env.SUPPORT_EMAIL || SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL]) },
    { key: 'ANNOUNCEMENT_MESSAGE', value: readSetting('ANNOUNCEMENT_MESSAGE', SETTING_DEFAULTS[SETTING_KEYS.ANNOUNCEMENT_MESSAGE]) },
    { key: 'SITE_NAME', value: readSetting('SITE_NAME', process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]) },
    { key: 'SITE_LOGO_HEIGHT', value: readSetting('SITE_LOGO_HEIGHT', String(SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_HEIGHT])) },
    { key: 'SITE_LOGO', value: readSetting('SITE_LOGO', SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO]) },
    { key: 'SITE_LOGO_LIGHT', value: readSetting('SITE_LOGO_LIGHT', SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_LIGHT]) },
    { key: 'SITE_LOGO_DARK', value: readSetting('SITE_LOGO_DARK', SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_DARK]) },
    { key: 'SITE_FAVICON', value: readSetting('SITE_FAVICON', SETTING_DEFAULTS[SETTING_KEYS.SITE_FAVICON]) },
    { key: 'PRICING_MAX_COLUMNS', value: readSetting('PRICING_MAX_COLUMNS', SETTING_DEFAULTS[SETTING_KEYS.PRICING_MAX_COLUMNS]) },
    { key: 'PRICING_CENTER_UNEVEN', value: readSetting('PRICING_CENTER_UNEVEN', SETTING_DEFAULTS[SETTING_KEYS.PRICING_CENTER_UNEVEN]) },
  ].map((setting) => {
    const existing = settings.find((entry) => entry.key === setting.key);
    if (existing) {
      return { ...existing, value: setting.value };
    }

    return {
      key: setting.key,
      value: setting.value,
    };
  });

  const siteName = readSetting('SITE_NAME', process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
  const databaseType = envSettings.find((setting) => setting.key === 'DATABASE_TYPE')?.value ?? 'N/A';
  const nodeEnv = envSettings.find((setting) => setting.key === 'NODE_ENV')?.value ?? 'development';

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Control"
        eyebrowIcon={<FontAwesomeIcon icon={faSliders} />}
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
        databaseSettings={effectiveEditableSettings}
        moderatorPermissions={moderatorPermissions}
        trafficAnalyticsHealth={trafficAnalyticsHealth}
      />
    </div>
  );
}
