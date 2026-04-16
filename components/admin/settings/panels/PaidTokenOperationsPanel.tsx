"use client";

import { useEffect, useState } from 'react';
import { showToast } from '@/components/ui/Toast';

export function PaidTokenOperationsPanel() {
  const [loading, setLoading] = useState(false);
  const [expiryOneTime, setExpiryOneTime] = useState<boolean | null>(null);
  const [expiryRecurring, setExpiryRecurring] = useState<boolean | null>(null);
  const [renewalOneTime, setRenewalOneTime] = useState<boolean | null>(null);
  const [renewalRecurring, setRenewalRecurring] = useState<boolean | null>(null);
  const [graceHoursRaw, setGraceHoursRaw] = useState<string>('');
  const [lastSavedGraceHours, setLastSavedGraceHours] = useState<string>('');
  const [organizationExpiryMode, setOrganizationExpiryMode] = useState<'SUSPEND' | 'DISMANTLE'>('SUSPEND');

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
        const [e1, eR, r1, rR, gH, orgMode] = await Promise.all([
          fetchValue('TOKENS_RESET_ON_EXPIRY_ONE_TIME'),
          fetchValue('TOKENS_RESET_ON_EXPIRY_RECURRING'),
          fetchValue('TOKENS_RESET_ON_RENEWAL_ONE_TIME'),
          fetchValue('TOKENS_RESET_ON_RENEWAL_RECURRING'),
          fetchValue('TOKENS_NATURAL_EXPIRY_GRACE_HOURS'),
          fetchValue('ORGANIZATION_EXPIRY_MODE')
        ]);
        if (!mounted) return;
        setExpiryOneTime(e1 === 'true');
        setExpiryRecurring(eR === 'true');
        setRenewalOneTime(r1 === 'true');
        setRenewalRecurring(rR === 'true');
        const nextGrace = (gH ?? '').trim();
        setGraceHoursRaw(nextGrace);
        setLastSavedGraceHours(nextGrace);
        setOrganizationExpiryMode(orgMode === 'DISMANTLE' ? 'DISMANTLE' : 'SUSPEND');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
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
    } catch {
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
    } catch {
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
            <div className="text-sm text-slate-600">
              Wait this long after a subscription naturally expires before clearing paid tokens and dismantling team organizations. Use 0 for
              immediate cleanup.
            </div>
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
              onBlur={() => {
                void commitGraceHoursIfValid();
              }}
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
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Organization expiry policy</div>
            <div className="text-sm text-slate-600">After grace ends for a team plan, either suspend workspace access and preserve the local organization or dismantle it completely.</div>
          </div>
          <select
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            value={organizationExpiryMode}
            disabled={loading}
            onChange={async (e) => {
              const nextValue = e.target.value === 'DISMANTLE' ? 'DISMANTLE' : 'SUSPEND';
              setOrganizationExpiryMode(nextValue);
              await saveRaw('ORGANIZATION_EXPIRY_MODE', nextValue);
            }}
            aria-label="Organization expiry policy"
          >
            <option value="SUSPEND">Suspend workspace access</option>
            <option value="DISMANTLE">Dismantle the organization</option>
          </select>
        </div>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!expiryOneTime}
            disabled={loading || expiryOneTime === null}
            onChange={async (e) => {
              setExpiryOneTime(e.target.checked);
              await save('TOKENS_RESET_ON_EXPIRY_ONE_TIME', e.target.checked);
            }}
          />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on expiry — one-time plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared when a one-time (non-recurring) purchase expires.</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!expiryRecurring}
            disabled={loading || expiryRecurring === null}
            onChange={async (e) => {
              setExpiryRecurring(e.target.checked);
              await save('TOKENS_RESET_ON_EXPIRY_RECURRING', e.target.checked);
            }}
          />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on expiry — recurring plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared after the natural-expiry (and grace window) ends.</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!renewalOneTime}
            disabled={loading || renewalOneTime === null}
            onChange={async (e) => {
              setRenewalOneTime(e.target.checked);
              await save('TOKENS_RESET_ON_RENEWAL_ONE_TIME', e.target.checked);
            }}
          />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on renewal — one-time plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared when a one-time plan purchase is renewed (if applicable).</div>
          </div>
        </label>

        <label className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!renewalRecurring}
            disabled={loading || renewalRecurring === null}
            onChange={async (e) => {
              setRenewalRecurring(e.target.checked);
              await save('TOKENS_RESET_ON_RENEWAL_RECURRING', e.target.checked);
            }}
          />
          <div>
            <div className="text-sm font-medium">Reset paid tokens on renewal — recurring plans</div>
            <div className="text-sm text-slate-600">When enabled, paid tokens are cleared whenever a recurring subscription renews (e.g., monthly renewal).</div>
          </div>
        </label>
      </fieldset>
    </div>
  );
}
