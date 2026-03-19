'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/lib/auth-provider/client';
import {
  dashboardMutedPanelClass,
  dashboardPanelClass,
  dashboardPillClass,
} from '@/components/dashboard/dashboardSurfaces';
import { WarningsModal, type AppWarning, type SharedCapContext } from '@/components/ui/WarningsModal';

type Bucket = 'auto' | 'paid' | 'free' | 'shared';

type ProfilePayload = {
  paidTokens?: { tokenName?: string; remaining?: number; isUnlimited?: boolean };
  freeTokens?: { tokenName?: string; remaining?: number };
  sharedTokens?: { tokenName?: string; remaining?: number } | null;
  planSource?: 'PERSONAL' | 'ORGANIZATION' | 'FREE';
};

function formatBucketDisplay(value: number | undefined, isUnlimited?: boolean) {
  if (isUnlimited) return 'Unlimited';
  return Math.max(0, Number(value ?? 0)).toLocaleString();
}

type Operation = {
  id: string;
  label: string;
  cost: number;
  description?: string;
  feature?: string;
};

type SpendResponseOk = {
  ok: true;
  amount: number;
  bucket: Exclude<Bucket, 'auto'>;
  warnings?: AppWarning[];
  sharedCap?: SharedCapContext;
  balances: {
    paid: number;
    free: number;
    sharedPool: number | null;
  };
};

type SpendResponseErr = {
  ok: false;
  error: string;
  bucket?: string;
  required?: number;
  available?: number;
};

type SpendEvent = {
  id: string;
  at: number;
  label: string;
  bucket: Bucket;
  cost: number;
  ok: boolean;
  detail?: string;
};

const OPERATIONS: Operation[] = [
  { id: 'preview', label: 'Generate output', cost: 2, description: 'Lightweight operation.', feature: 'preview' },
  { id: 'export1', label: 'Generate output (2x)', cost: 4, description: 'Standard output.', feature: 'export_1x' },
  { id: 'export4', label: 'Generate output (4x)', cost: 8, description: 'High-quality output.', feature: 'export_4x' },
  { id: 'batch', label: 'Batch output', cost: 25, description: 'Batch job.', feature: 'batch_export' },
];

function safeInt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function defaultBucketForProfile(profile: ProfilePayload | null): Bucket {
  if (!profile) return 'auto';
  const sharedRemaining = Math.max(0, Number(profile.sharedTokens?.remaining ?? 0));
  const paidRemaining = Math.max(0, Number(profile.paidTokens?.remaining ?? 0));
  const paidUnlimited = profile.paidTokens?.isUnlimited === true;
  const freeRemaining = Math.max(0, Number(profile.freeTokens?.remaining ?? 0));

  // Prefer buckets with available balance.
  if (sharedRemaining > 0) return 'shared';
  if (paidUnlimited || paidRemaining > 0) return 'paid';
  if (freeRemaining > 0) return 'free';

  // No remaining balance in any bucket: preserve legacy PERSONAL fallback.
  if (profile.planSource === 'PERSONAL') return 'paid';
  return 'free';
}

function resolveBucket(bucket: Bucket, profile: ProfilePayload | null): Exclude<Bucket, 'auto'> {
  if (bucket !== 'auto') return bucket;
  const fallback = defaultBucketForProfile(profile);
  return fallback === 'auto' ? 'free' : fallback;
}

function getBucketTokenName(resolved: Exclude<Bucket, 'auto'>, profile: ProfilePayload | null) {
  const name =
    resolved === 'paid'
      ? profile?.paidTokens?.tokenName
      : resolved === 'free'
      ? profile?.freeTokens?.tokenName
      : profile?.sharedTokens?.tokenName;

  return typeof name === 'string' && name.trim() ? name.trim() : 'tokens';
}

export default function SaaSyAppClient() {
  const { orgId } = useAuthSession();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<Bucket>('auto');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<SpendEvent[]>([]);

  const [warningOpen, setWarningOpen] = useState(false);
  const [warningPayload, setWarningPayload] = useState<{
    warnings: AppWarning[];
    sharedCap?: SharedCapContext;
    tokenName: string;
  } | null>(null);

  const [customLabel, setCustomLabel] = useState('Custom operation');
  const [customCost, setCustomCost] = useState('10');

  const resolvedBucket = useMemo(() => resolveBucket(bucket, profile), [bucket, profile]);
  const tokenName = useMemo(() => getBucketTokenName(resolvedBucket, profile), [resolvedBucket, profile]);

  async function refreshProfile() {
    setProfileError(null);
    const res = await fetch('/api/user/profile', { method: 'GET' });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Request failed (${res.status})`);
    }
    const data = (await res.json()) as ProfilePayload;
    setProfile(data);
  }

  useEffect(() => {
    refreshProfile().catch((err: unknown) => {
      setProfileError(err instanceof Error ? err.message : 'Failed to fetch profile');
    });
  }, [orgId]);

  useEffect(() => {
    if (!profile) return;
    setBucket((prev) => {
      if (prev === 'auto') return 'auto';
      if (prev === 'shared' && !profile.sharedTokens) return defaultBucketForProfile(profile);
      return prev;
    });
  }, [profile]);

  async function spend(cost: number, label: string, spendBucket: Bucket, feature?: string) {
    setMessage(null);

    if (spendBucket === 'shared' && !profile?.sharedTokens) {
      setMessage('Shared workspace tokens are not available in your current account context.');
      return;
    }

    const normalizedCost = Math.max(0, Math.floor(cost));
    if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) {
      setMessage('Cost must be a positive integer.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/user/spend-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: normalizedCost,
          bucket: spendBucket,
          feature: feature || 'operation',
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as SpendResponseOk | SpendResponseErr;

      if (!res.ok || !('ok' in payload) || payload.ok === false) {
        const errPayload = payload as SpendResponseErr;
        const retryAfter = (() => {
          if (res.status !== 429) return null;
          const header = res.headers.get('retry-after');
          const fromHeader = header ? safeInt(header) : null;
          if (typeof fromHeader === 'number' && fromHeader > 0) return fromHeader;

          const record = payload as unknown as { retryAfter?: unknown };
          const fromBody = safeInt(record?.retryAfter);
          if (typeof fromBody === 'number' && fromBody > 0) return fromBody;
          return null;
        })();

        const detail =
          errPayload.error === 'insufficient_tokens'
            ? `Insufficient tokens (need ${errPayload.required ?? normalizedCost}, available ${errPayload.available ?? 0}).`
            : res.status === 429
            ? `Rate limit exceeded${retryAfter ? `; retry in ~${retryAfter}s` : ''}.`
            : errPayload.error || `Request failed (${res.status})`;

        setEvents((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            at: Date.now(),
            label,
            bucket: spendBucket,
            cost: normalizedCost,
            ok: false,
            detail,
          },
          ...prev,
        ].slice(0, 100));

        setMessage(detail);
        return;
      }

      setEvents((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at: Date.now(),
          label,
          bucket: spendBucket,
          cost: normalizedCost,
          ok: true,
          detail: `Charged ${payload.bucket}`,
        },
        ...prev,
      ].slice(0, 100));

      if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        setWarningPayload({
          warnings: payload.warnings,
          sharedCap: payload.sharedCap,
          tokenName,
        });
        setWarningOpen(true);
      }

      await refreshProfile();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to spend tokens');
    } finally {
      setBusy(false);
    }
  }

  const warningContext = warningPayload
    ? {
        tokenName: warningPayload.tokenName,
        sharedCap: warningPayload.sharedCap,
      }
    : undefined;

  const freeRemaining = profile?.freeTokens?.remaining ?? 0;
  const sharedRemaining = profile?.sharedTokens?.remaining ?? 0;

  // (render continues below)

  return (
    <div className="space-y-6">
      <WarningsModal
        isOpen={warningOpen}
        warnings={warningPayload?.warnings ?? []}
        context={warningContext}
        onClose={() => {
          setWarningOpen(false);
          setWarningPayload(null);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={dashboardMutedPanelClass('space-y-2 lg:col-span-2')}>
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Current balances</p>
          {profileError ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{profileError}</p>
          ) : profile ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={dashboardPanelClass('p-4')}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Paid</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">{formatBucketDisplay(profile.paidTokens?.remaining, profile.paidTokens?.isUnlimited)}</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.paidTokens?.tokenName ?? 'tokens'}</p>
              </div>
              <div className={dashboardPanelClass('p-4')}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Free</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">{formatBucketDisplay(freeRemaining)}</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.freeTokens?.tokenName ?? 'tokens'}</p>
              </div>
              <div className={dashboardPanelClass('p-4')}>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Shared</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">{formatBucketDisplay(sharedRemaining)}</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.sharedTokens?.tokenName ?? 'tokens'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-neutral-300">Loading…</p>
          )}
        </section>

        <aside className={dashboardMutedPanelClass('space-y-3')}>
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Spend settings</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className={dashboardPillClass()}>
              Bucket: <span className="font-semibold">{resolvedBucket}</span>
            </span>
            <span className={dashboardPillClass()}>
              Token: <span className="font-semibold">{tokenName}</span>
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              Spend from
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                suppressHydrationWarning
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
                disabled={busy}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 sm:flex-1"
              >
                <option value="auto">Auto</option>
                <option value="paid">Paid</option>
                <option value="free">Free</option>
                <option value="shared" disabled={!profile?.sharedTokens}>Shared</option>
              </select>

              <button
                type="button"
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                disabled={busy}
                onClick={() =>
                  refreshProfile().catch((err: unknown) =>
                    setMessage(err instanceof Error ? err.message : 'Refresh failed')
                  )
                }
              >
                Refresh
              </button>
            </div>

            {message ? <p className="text-sm text-rose-600 dark:text-rose-300">{message}</p> : null}
          </div>
        </aside>
      </div>

      <section className={dashboardPanelClass('space-y-4')}>
        <header className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Operations</p>
          <p className="text-sm text-slate-600 dark:text-neutral-300">Run an operation to deduct tokens.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map((op) => (
            <button
              key={op.id}
              type="button"
              disabled={busy}
              className={clsx(
                'group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md disabled:opacity-70 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-emerald-500/40'
              )}
              onClick={() => spend(op.cost, op.label, bucket, op.feature)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{op.label}</p>
                  {op.description ? <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{op.description}</p> : null}
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                  -{op.cost}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className={dashboardMutedPanelClass('space-y-3')}>
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Custom operation</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              suppressHydrationWarning
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Operation label"
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <input
              suppressHydrationWarning
              value={customCost}
              onChange={(e) => setCustomCost(e.target.value)}
              inputMode="numeric"
              placeholder="Cost"
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
              onClick={() => {
                const cost = safeInt(customCost);
                spend(cost ?? 0, customLabel || 'Custom operation', bucket, 'custom');
              }}
            >
              Spend
            </button>
          </div>
        </div>
      </section>

      <section className={dashboardPanelClass('space-y-3')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Recent operations</p>
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 disabled:opacity-70 dark:text-neutral-400 dark:hover:text-neutral-200"
            disabled={busy}
            onClick={() => setEvents([])}
          >
            Clear
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-neutral-300">No operations yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-neutral-800">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-neutral-100 truncate">{e.label}</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    {new Date(e.at).toLocaleString()} • bucket: {resolveBucket(e.bucket, profile)} •{' '}
                    <span className={e.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
                      {e.ok ? 'OK' : 'FAILED'}
                    </span>
                    {e.detail ? ` • ${e.detail}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-neutral-100">-{e.cost}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
