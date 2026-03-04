"use client";

import { useCallback, useMemo, useState, useRef } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AdminSettingsForm from './AdminSettingsForm';
import { EditableSettings, EnvironmentSettingsList } from './EditableSettings';
import { PaymentProvidersPanel } from './PaymentProvidersPanel';
import { MODERATOR_SECTIONS, type ModeratorPermissions, type ModeratorSection } from '../../lib/moderator-shared';
import { showToast } from '../ui/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faCog, faShieldAlt, faServer, faClock, faCreditCard, faFileExport, faFileImport } from '@fortawesome/free-solid-svg-icons';
import { PaidTokenOperationsPanel } from './settings/panels/PaidTokenOperationsPanel';
import { AdminActionNotificationPanel } from './settings/panels/AdminActionNotificationPanel';
import { EmailAlertSettingsPanel } from './settings/panels/EmailAlertSettingsPanel';
import { SupportEmailSettingsPanel } from './settings/panels/SupportEmailSettingsPanel';
import { SystemBadge } from './settings/SystemBadge';

interface Setting {
  key: string;
  value: string;
  description?: string;
}

interface AdminSettingsTabsProps {
  databaseSettings: Setting[];
  environmentSettings: Setting[];
  moderatorPermissions: ModeratorPermissions;
}

const cx = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));

// Panels extracted into `components/admin/settings/panels/*`.
const MODERATOR_SECTION_LABELS: Record<ModeratorSection, { label: string; description: string }> = {
  users: {
    label: 'User management',
    description: 'View accounts, reset balances, and modify subscriptions.'
  },
  transactions: {
    label: 'Transactions',
    description: 'Review Stripe transactions and export payment data.'
  },
  purchases: {
    label: 'One-time purchases',
    description: 'Audit ad-hoc sales and resend receipts when needed.'
  },
  subscriptions: {
    label: 'Subscriptions',
    description: 'Inspect recurring plans, statuses, and expirations.'
  },
  support: {
    label: 'Support inbox',
    description: 'Collaborate on customer tickets and replies.'
  },
  notifications: {
    label: 'Notifications',
    description: 'Draft and send in-app alerts to users.'
  },
  blog: {
    label: 'Blog publishing',
    description: 'Draft content, edit stories, and manage categories.'
  },
  analytics: {
    label: 'Analytics dashboard',
    description: 'Monitor revenue momentum and growth trends.'
  },
  traffic: {
    label: 'Traffic insights',
    description: 'Track visits, page views, and engagement metrics.'
  },
  organizations: {
    label: 'Organization management',
    description: 'Review org profiles, edit limits, and inspect member rosters.'
  }
};

export function AdminSettingsTabs({ databaseSettings, environmentSettings, moderatorPermissions }: AdminSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('branding');
  const [moderatorAccess, setModeratorAccess] = useState<ModeratorPermissions>(moderatorPermissions);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [savingSections, setSavingSections] = useState<Record<ModeratorSection, boolean>>(() => {
    return MODERATOR_SECTIONS.reduce<Record<ModeratorSection, boolean>>((acc, section) => {
      acc[section] = false;
      return acc;
    }, {} as Record<ModeratorSection, boolean>);
  });

  const stripeMode = environmentSettings.find((setting) => setting.key === 'STRIPE_MODE')?.value ?? 'UNKNOWN';
  const databaseType = environmentSettings.find((setting) => setting.key === 'DATABASE_TYPE')?.value ?? 'N/A';
  const clerkDomain = environmentSettings.find((setting) => setting.key === 'CLERK_DOMAIN')?.value ?? 'N/A';
  const nodeEnv = environmentSettings.find((setting) => setting.key === 'NODE_ENV')?.value ?? 'development';

  const updateModeratorAccess = useCallback(async (section: ModeratorSection, nextValue: boolean) => {
    const previousValue = moderatorAccess[section];
    const nextState: ModeratorPermissions = { ...moderatorAccess, [section]: nextValue };
    setModeratorAccess(nextState);
    setSavingSections((prev) => ({ ...prev, [section]: true }));

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'MODERATOR_PERMISSIONS',
          value: JSON.stringify(nextState)
        })
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      showToast('Moderator permissions updated', 'success');
    } catch (error) {
      void error;
      setModeratorAccess((prev) => ({ ...prev, [section]: previousValue }));
      showToast('Failed to update moderator permissions', 'error');
    } finally {
      setSavingSections((prev) => ({ ...prev, [section]: false }));
    }
  }, [moderatorAccess]);

  const handleExportSettings = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch('/api/admin/settings/export');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        showToast(err?.error || 'Failed to export settings', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      a.download = match?.[1] || `settings-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Settings exported successfully', 'success');
    } catch {
      showToast('Unexpected error exporting settings', 'error');
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  const handleImportSettings = useCallback(async (file: File) => {
    if (importing) return;
    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showToast('Invalid JSON file', 'error');
        return;
      }
      const res = await fetch('/api/admin/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({ error: 'Import failed' }));
      if (!res.ok) {
        showToast(data?.error || 'Failed to import settings', 'error');
        return;
      }
      showToast(`Imported ${data.imported} settings. Reload to see changes.`, 'success');
    } catch {
      showToast('Unexpected error importing settings', 'error');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, [importing]);

  const tabs = useMemo(
    () => [
      {
        id: 'branding',
        label: 'Brand & Messaging',
        icon: faPalette,
        description: 'Logos, site name, and announcement banner',
        content: (
          <div className="space-y-6">
            <EditableSettings
              databaseSettings={databaseSettings}
              editableKeys={['SITE_NAME', 'ANNOUNCEMENT_MESSAGE', 'SUPPORT_EMAIL', 'SITE_LOGO_HEIGHT', 'SITE_LOGO', 'SITE_LOGO_LIGHT', 'SITE_LOGO_DARK', 'SITE_FAVICON']}
              showHeading={false}
              showEnvironment={false}
            />
          </div>
        )
      },
      {
        id: 'operations',
        label: 'Operational Controls',
        icon: faCog,
        description: 'Maintenance, free quotas, and support touchpoints',
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Paid token operations</h3>
              <div className="mt-3">
                <PaidTokenOperationsPanel />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Admin action notifications</h3>
              <div className="mt-3">
                <AdminActionNotificationPanel />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Admin alert emails</h3>
              <div className="mt-3">
                <EmailAlertSettingsPanel />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-neutral-100">Support emails</h3>
              <div className="mt-3">
                <SupportEmailSettingsPanel />
              </div>
            </div>
            <EditableSettings
              databaseSettings={databaseSettings}
              editableKeys={[
                'MAINTENANCE_MODE',
                'FREE_PLAN_TOKEN_LIMIT',
                'FREE_PLAN_RENEWAL_TYPE',
                'FREE_PLAN_TOKEN_NAME',
                'DEFAULT_TOKEN_LABEL',
                'ENABLE_RECURRING_PRORATION'
              ]}
              showHeading={false}
              showEnvironment={false}
            />
          </div>
        )
      },
      {
        id: 'payments',
        label: 'Payment Providers',
        icon: faCreditCard,
        description: 'View and configure payment gateway integrations',
        content: (
          <div className="space-y-6">
            <PaymentProvidersPanel />
          </div>
        )
      },
      {
        id: 'formatting',
        label: 'Locale & Scheduling',
        icon: faClock,
        description: 'Date formatting presets and timezone defaults',
        content: (
          <div className="space-y-6">
            <div className="mb-4 text-sm text-slate-700 dark:text-neutral-200">
              <AdminSettingsForm />
            </div>
          </div>
        )
      },
      {
        id: 'permissions',
        label: 'Roles & Access',
        icon: faShieldAlt,
        description: 'Configure what moderators can manage inside admin tools',
        content: (
          <div className="space-y-6">
            <div className="mb-4 text-sm text-slate-700 dark:text-neutral-200">
              <p className="mt-3 text-xs tracking-wide text-slate-500 dark:text-neutral-500">{Object.values(moderatorAccess).some(Boolean) ? 'At least one section is enabled for moderators.' : 'Moderators currently have no admin access.'}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {MODERATOR_SECTIONS.map((section) => {
                const meta = MODERATOR_SECTION_LABELS[section];
                const enabled = moderatorAccess[section];
                const saving = savingSections[section];
                return (
                  <div
                    key={section}
                    className={cx(
                      'rounded-2xl border p-5 shadow-sm transition-colors',
                      enabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-100'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{meta.label}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">{meta.description}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => updateModeratorAccess(section, !enabled)}
                        disabled={saving}
                        className={cx(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition',
                          enabled ? 'bg-emerald-500' : 'bg-slate-300',
                          saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                        )}
                      >
                        <span
                          className={cx(
                            'inline-block h-5 w-5 transform rounded-full bg-white transition',
                            enabled ? 'translate-x-5' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      },
      {
        id: 'system',
        label: 'System Status',
        icon: faServer,
        description: 'Runtime environment, integrations, and infrastructure snapshot',
        content: (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SystemBadge label="Stripe mode" value={stripeMode} tone={stripeMode === 'LIVE' ? 'emerald' : 'amber'} />
              <SystemBadge label="Database" value={databaseType} tone="blue" />
              <SystemBadge label="Clerk domain" value={clerkDomain} tone="violet" />
              <SystemBadge label="Node env" value={nodeEnv} tone="slate" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:shadow-lg">
              <EnvironmentSettingsList
                settings={environmentSettings}
                title="Platform configuration"
                description="Live diagnostics pulled from environment variables and runtime flags."
                badgeText="Immutable"
              />
            </div>
          </div>
        )
      }
    ],
    [
      databaseSettings,
      environmentSettings,
      stripeMode,
      databaseType,
      clerkDomain,
      nodeEnv,
      moderatorAccess,
      savingSections,
      updateModeratorAccess
    ]
  );

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6">
      {/* Mobile: Dropdown selector */}
      <div className="block md:hidden">
        <label htmlFor="settings-tab-select" className="sr-only">Select settings section</label>
        <div className="relative">
          <select
            id="settings-tab-select"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] px-4 py-3.5 pr-10 text-sm font-semibold text-slate-900 shadow-lg focus:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.45))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:text-neutral-100"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
            <svg className="h-5 w-5 text-[rgb(var(--accent-primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {/* Active tab description on mobile */}
        <p className="mt-2 text-xs text-slate-600 dark:text-neutral-400 px-1">
          {activeContent.description}
        </p>
      </div>

      {/* Desktop: Horizontal tabs */}
      <div
        className="relative hidden md:flex overflow-hidden rounded-2xl border border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.25))] bg-[linear-gradient(135deg,var(--theme-tabs-gradient-from),var(--theme-tabs-gradient-via),var(--theme-tabs-gradient-to))] shadow-[0_12px_45px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.12))] transition-shadow dark:border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] dark:shadow-[0_0_40px_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18))]"
        role="tablist"
        aria-label="Admin settings sections"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.18)),_transparent_65%)] dark:bg-[radial-gradient(circle_at_top,_rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.28)),_transparent_60%)]" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              'relative z-10 flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all lg:px-6',
              activeTab === tab.id
                ? 'bg-white text-[rgb(var(--accent-primary))] shadow-md dark:bg-black dark:text-[rgb(var(--accent-primary))]'
                : 'text-slate-700/85 hover:bg-white/60 hover:text-slate-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-neutral-50'
            )}
          >
            <FontAwesomeIcon icon={tab.icon} className="w-4 h-4" />
            <span className="hidden lg:inline">{tab.label}</span>
            <span className="lg:hidden">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`${activeContent.id}-tab`}
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6 dark:border-neutral-800 dark:bg-neutral-950/60"
      >
        {activeContent.content}
      </div>

      {/* Export / Import actions */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportSettings(file);
          }}
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={importing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <FontAwesomeIcon icon={faFileImport} className="h-4 w-4" />
          {importing ? 'Importing…' : 'Import settings'}
        </button>
        <button
          type="button"
          onClick={handleExportSettings}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <FontAwesomeIcon icon={faFileExport} className="h-4 w-4" />
          {exporting ? 'Exporting…' : 'Export settings'}
        </button>
      </div>
    </div>
  );
}
