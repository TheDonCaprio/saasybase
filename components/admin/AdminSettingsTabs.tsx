"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AdminSettingsForm from './AdminSettingsForm';
import { EditableSettings, EnvironmentSettingsList } from './EditableSettings';
import { PaymentProvidersPanel } from './PaymentProvidersPanel';
import { MODERATOR_SECTIONS, type ModeratorPermissions, type ModeratorSection } from '../../lib/moderator-shared';
import { showToast } from '../ui/Toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faCog, faShieldAlt, faServer, faClock, faCreditCard, faBell, faEnvelope, faFileExport, faFileImport } from '@fortawesome/free-solid-svg-icons';

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

const ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY = 'ADMIN_ACTION_NOTIFICATION_ACTIONS';
const ADMIN_ALERT_EMAIL_TYPES_KEY = 'ADMIN_ALERT_EMAIL_TYPES';
const SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY = 'SUPPORT_EMAIL_NOTIFICATION_TYPES';

const ADMIN_ACTION_NOTIFICATION_OPTIONS = [
  {
    pattern: 'user.*',
    label: 'User management actions',
    description: 'Role changes, profile updates, token adjustments, and organization management.'
  },
  {
    pattern: 'plan.*',
    label: 'Plan actions',
    description: 'Plan create/update/activate/deactivate/delete events.'
  },
  {
    pattern: 'coupon.*',
    label: 'Coupon actions',
    description: 'Coupon create, edit, and delete operations.'
  },
  {
    pattern: 'payment.*',
    label: 'Payment actions',
    description: 'Refunds and other payment-level admin operations.'
  },
  {
    pattern: 'subscription.*',
    label: 'Subscription actions',
    description: 'Force-cancel, schedule-cancel, and other subscription management.'
  },
  {
    pattern: 'support.*',
    label: 'Support actions',
    description: 'Ticket status changes, replies, and admin-created tickets.'
  },
  {
    pattern: 'settings.*',
    label: 'Settings actions',
    description: 'Configuration and platform setting updates.'
  },
  {
    pattern: 'billing.*',
    label: 'Billing sync actions',
    description: 'Provider sync and billing management operations.'
  },
  {
    pattern: 'maintenance.*',
    label: 'Maintenance actions',
    description: 'Backfills and maintenance cleanup operations.'
  },
  {
    pattern: 'notification.*',
    label: 'Admin notification actions',
    description: 'Manual sends and broadcasts triggered by admins.'
  }
] as const;

const ADMIN_ALERT_EMAIL_OPTIONS = [
  { value: 'refund', label: 'Refund alerts', description: 'Emails when refunds are processed.' },
  { value: 'new_purchase', label: 'New purchase alerts', description: 'Emails for new one-time or subscription purchases.' },
  { value: 'renewal', label: 'Renewal alerts', description: 'Emails for subscription renewal events.' },
  { value: 'upgrade', label: 'Upgrade alerts', description: 'Emails when subscriptions are upgraded.' },
  { value: 'downgrade', label: 'Downgrade alerts', description: 'Emails when subscriptions are downgraded.' },
  { value: 'payment_failed', label: 'Payment failure alerts', description: 'Emails when a payment or invoice fails.' },
  { value: 'dispute', label: 'Dispute alerts', description: 'Emails when payment disputes are filed/updated.' },
  { value: 'other', label: 'Other admin alerts', description: 'Emails for uncategorized admin notification events.' },
] as const;

const SUPPORT_EMAIL_OPTIONS = [
  {
    value: 'new_ticket_to_admin',
    label: 'New support ticket to support inbox',
    description: 'Send support inbox email when a user opens a new support ticket.'
  },
  {
    value: 'admin_reply_to_user',
    label: 'Admin reply to user',
    description: 'Send email to user when admin/moderator replies to a support ticket. Users who have opted out of emails will not receive them regardless.'
  },
  {
    value: 'user_reply_to_admin',
    label: 'User reply to support inbox',
    description: 'Send email to the support inbox when a user replies to an existing support ticket.'
  }
] as const;

function PaidTokenOperationsPanel() {
  const [loading, setLoading] = useState(false);
  const [expiryOneTime, setExpiryOneTime] = useState<boolean | null>(null);
  const [expiryRecurring, setExpiryRecurring] = useState<boolean | null>(null);
  const [renewalOneTime, setRenewalOneTime] = useState<boolean | null>(null);
  const [renewalRecurring, setRenewalRecurring] = useState<boolean | null>(null);
  const [graceHoursRaw, setGraceHoursRaw] = useState<string>('');
  const [lastSavedGraceHours, setLastSavedGraceHours] = useState<string>('');

  const fetchValue = async (key: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const j = await res.json();
      return j?.value ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const [e1, eR, r1, rR, gH] = await Promise.all([
          fetchValue('TOKENS_RESET_ON_EXPIRY_ONE_TIME'),
          fetchValue('TOKENS_RESET_ON_EXPIRY_RECURRING'),
          fetchValue('TOKENS_RESET_ON_RENEWAL_ONE_TIME'),
          fetchValue('TOKENS_RESET_ON_RENEWAL_RECURRING'),
          fetchValue('TOKENS_NATURAL_EXPIRY_GRACE_HOURS')
        ]);
        if (!mounted) return;
        setExpiryOneTime(e1 === 'true');
        setExpiryRecurring(eR === 'true');
        setRenewalOneTime(r1 === 'true');
        setRenewalRecurring(rR === 'true');
        const nextGrace = (gH ?? '').trim();
        setGraceHoursRaw(nextGrace);
        setLastSavedGraceHours(nextGrace);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const save = async (key: string, value: boolean) => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: value ? 'true' : 'false' })
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Setting saved', 'success');
    } catch (err) {
      void err;
      showToast('Failed to save setting', 'error');
    }
  };

  const saveRaw = async (key: string, value: string) => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (!res.ok) throw new Error('Failed');
      showToast('Setting saved', 'success');
    } catch (err) {
      void err;
      showToast('Failed to save setting', 'error');
    }
  };

  const commitGraceHoursIfValid = async () => {
    const trimmed = graceHoursRaw.trim();
    if (trimmed === lastSavedGraceHours) return;
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) {
      setGraceHoursRaw(lastSavedGraceHours);
      showToast('Grace hours must be a non-negative integer', 'error');
      return;
    }
    const canonical = String(n);
    setGraceHoursRaw(canonical);
    setLastSavedGraceHours(canonical);
    await saveRaw('TOKENS_NATURAL_EXPIRY_GRACE_HOURS', canonical);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Natural-expiry grace period (hours)</div>
            <div className="text-sm text-slate-600">Wait this long after a subscription naturally expires before clearing paid tokens and dismantling team organizations. Use 0 for immediate cleanup.</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="w-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              value={graceHoursRaw}
              disabled={loading}
              onChange={(e) => setGraceHoursRaw(e.target.value)}
              onBlur={() => { void commitGraceHoursIfValid(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Natural expiry grace hours"
            />
          </div>
        </div>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input type="checkbox" className="mt-1" checked={!!expiryOneTime} disabled={loading || expiryOneTime === null} onChange={async (e) => { setExpiryOneTime(e.target.checked); await save('TOKENS_RESET_ON_EXPIRY_ONE_TIME', e.target.checked); }} />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on expiry — one-time plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared when a one-time (non-recurring) purchase expires.</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input type="checkbox" className="mt-1" checked={!!expiryRecurring} disabled={loading || expiryRecurring === null} onChange={async (e) => { setExpiryRecurring(e.target.checked); await save('TOKENS_RESET_ON_EXPIRY_RECURRING', e.target.checked); }} />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on expiry — recurring plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared when a recurring subscription expires (cancelled/ended).</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input type="checkbox" className="mt-1" checked={!!renewalOneTime} disabled={loading || renewalOneTime === null} onChange={async (e) => { setRenewalOneTime(e.target.checked); await save('TOKENS_RESET_ON_RENEWAL_ONE_TIME', e.target.checked); }} />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on renewal — one-time plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared when a one-time plan purchase is renewed (if applicable).</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input type="checkbox" className="mt-1" checked={!!renewalRecurring} disabled={loading || renewalRecurring === null} onChange={async (e) => { setRenewalRecurring(e.target.checked); await save('TOKENS_RESET_ON_RENEWAL_RECURRING', e.target.checked); }} />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on renewal — recurring plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared whenever a recurring subscription renews (e.g., monthly renewal).</div>
          </div>
        </label>
      </fieldset>
    </div>
  );
}

function parseActionPatternList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    const patterns = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(patterns));
  } catch {
    return [];
  }
}

function AdminActionNotificationPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY)}`);
      if (res.ok) {
        const payload = await res.json();
        setSelectedPatterns(parseActionPatternList(payload?.value));
      } else {
        setSelectedPatterns([]);
      }
    } catch {
      setSelectedPatterns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  const togglePattern = useCallback(async (pattern: string) => {
    if (loading) return;
    const wasSelected = selectedPatterns.includes(pattern);
    const nextPatterns = wasSelected
      ? selectedPatterns.filter((entry) => entry !== pattern)
      : [...selectedPatterns, pattern];

    const prev = selectedPatterns;
    setSelectedPatterns(nextPatterns);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ADMIN_ACTION_NOTIFICATION_ACTIONS_KEY, value: JSON.stringify(nextPatterns) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Admin action notification preferences updated', 'success');
    } catch {
      setSelectedPatterns(prev);
      showToast('Failed to update admin action notifications', 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, selectedPatterns]);

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
            <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Admin action alerts</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">
              Choose which admin action groups should trigger in-app notifications for other admins.
            </div>
          </div>
        </div>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {ADMIN_ACTION_NOTIFICATION_OPTIONS.map((option) => {
          const enabled = selectedPatterns.includes(option.pattern);
          return (
            <label
              key={option.pattern}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={loading}
                onChange={() => { void togglePattern(option.pattern); }}
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-sm text-slate-600 dark:text-neutral-400">{option.description}</div>
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

function EmailAlertSettingsPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(ADMIN_ALERT_EMAIL_TYPES_KEY)}`);
      if (!res.ok) {
        setSelectedTypes([]);
        return;
      }
      const payload = await res.json();
      setSelectedTypes(parseActionPatternList(payload?.value));
    } catch {
      setSelectedTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  const toggleType = useCallback(async (value: string) => {
    if (loading) return;
    const wasSelected = selectedTypes.includes(value);
    const next = wasSelected
      ? selectedTypes.filter((entry) => entry !== value)
      : [...selectedTypes, value];

    setSelectedTypes(next);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ADMIN_ALERT_EMAIL_TYPES_KEY, value: JSON.stringify(next) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Admin alert email settings updated', 'success');
    } catch {
      setSelectedTypes(selectedTypes);
      showToast('Failed to update admin alert email settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, selectedTypes]);

  const allSelected = ADMIN_ALERT_EMAIL_OPTIONS.every(opt => selectedTypes.includes(opt.value));

  const toggleAll = useCallback(async () => {
    if (loading) return;
    const next = allSelected ? [] : ADMIN_ALERT_EMAIL_OPTIONS.map(opt => opt.value);
    setSelectedTypes(next);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ADMIN_ALERT_EMAIL_TYPES_KEY, value: JSON.stringify(next) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Admin alert email settings updated', 'success');
    } catch {
      void loadValue();
      showToast('Failed to update admin alert email settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [allSelected, loading, loadValue]);

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Admin alert emails</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">
              Choose which billing and admin events trigger emails to the support inbox. Requires the <code className="text-xs bg-slate-100 dark:bg-neutral-800 px-1 rounded">SEND_ADMIN_BILLING_EMAILS=true</code> environment variable.
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
          disabled={loading}
          onClick={() => { void toggleAll(); }}
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {ADMIN_ALERT_EMAIL_OPTIONS.map((option) => {
          const enabled = selectedTypes.includes(option.value);
          return (
            <label
              key={option.value}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={loading}
                onChange={() => {
                  void toggleType(option.value);
                }}
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-sm text-slate-600 dark:text-neutral-400">{option.description}</div>
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

function SupportEmailSettingsPanel() {
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const loadValue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/settings?key=${encodeURIComponent(SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY)}`);
      if (!res.ok) {
        setSelectedTypes([]);
        return;
      }
      const payload = await res.json();
      setSelectedTypes(parseActionPatternList(payload?.value));
    } catch {
      setSelectedTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadValue();
  }, [loadValue]);

  const toggleType = useCallback(async (value: string) => {
    if (loading) return;
    const wasSelected = selectedTypes.includes(value);
    const next = wasSelected
      ? selectedTypes.filter((entry) => entry !== value)
      : [...selectedTypes, value];

    setSelectedTypes(next);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SUPPORT_EMAIL_NOTIFICATION_TYPES_KEY, value: JSON.stringify(next) })
      });
      if (!response.ok) throw new Error('Request failed');
      showToast('Support email settings updated', 'success');
    } catch {
      setSelectedTypes(selectedTypes);
      showToast('Failed to update support email settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, selectedTypes]);

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Support emails</div>
            <div className="text-sm text-slate-600 dark:text-neutral-400">
              Control which support-related emails are sent automatically.
            </div>
          </div>
        </div>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        {SUPPORT_EMAIL_OPTIONS.map((option) => {
          const enabled = selectedTypes.includes(option.value);
          return (
            <label
              key={option.value}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={enabled}
                disabled={loading}
                onChange={() => {
                  void toggleType(option.value);
                }}
              />
              <div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-sm text-slate-600 dark:text-neutral-400">{option.description}</div>
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
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

interface SystemBadgeProps {
  label: string;
  value: string;
  tone?: 'emerald' | 'amber' | 'blue' | 'violet' | 'slate';
}

// Use a loose string index here to avoid narrowing issues when `tone` may be undefined.
const toneMap: Record<string, string> = {
  emerald: 'from-emerald-100 to-emerald-50 border-emerald-200 text-emerald-700 shadow-sm dark:from-emerald-500/15 dark:to-emerald-500/5 dark:border-emerald-500/30 dark:text-emerald-100 dark:shadow-inner',
  amber: 'from-amber-100 to-amber-50 border-amber-200 text-amber-700 shadow-sm dark:from-amber-500/15 dark:to-amber-500/5 dark:border-amber-500/30 dark:text-amber-100 dark:shadow-inner',
  blue: 'from-sky-100 to-sky-50 border-sky-200 text-sky-700 shadow-sm dark:from-sky-500/15 dark:to-sky-500/5 dark:border-sky-500/30 dark:text-sky-100 dark:shadow-inner',
  violet: 'from-violet-100 to-violet-50 border-violet-200 text-violet-700 shadow-sm dark:from-violet-500/15 dark:to-violet-500/5 dark:border-violet-500/30 dark:text-violet-100 dark:shadow-inner',
  slate: 'from-slate-100 to-white border-slate-200 text-slate-700 shadow-sm dark:from-slate-500/15 dark:to-slate-500/5 dark:border-slate-500/30 dark:text-slate-100 dark:shadow-inner'
};

function SystemBadge({ label, value, tone = 'slate' }: SystemBadgeProps) {
  return (
    <div className={cx('rounded-2xl border bg-gradient-to-br p-4', toneMap[tone])}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}
