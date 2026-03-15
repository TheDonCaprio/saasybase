'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/lib/auth-provider/client';
import { dashboardMutedPanelClass, dashboardPanelClass, dashboardPillClass } from '@/components/dashboard/dashboardSurfaces';

type Bucket = 'auto' | 'paid' | 'free' | 'shared';

type ProfilePayload = {
  paidTokens?: { tokenName?: string; remaining?: number };
  freeTokens?: { tokenName?: string; remaining?: number };
  sharedTokens?: { tokenName?: string; remaining?: number } | null;
  planSource?: 'PERSONAL' | 'ORGANIZATION' | 'FREE';
};

type Operation = {
  id: string;
  label: string;
  cost: number;
  description?: string;
  feature?: string;
};

type SpendEvent = {
  id: string;
  at: number;
  label: string;
  bucket: Bucket;
  cost: number;
  remaining: number;
};

const STORAGE_KEY = 'sassyapp_simulator_v1';

const OPERATIONS: Operation[] = [
  { id: 'preview', label: 'Generate preview', cost: 2, description: 'Simulates a lightweight operation.', feature: 'preview' },
  { id: 'export1', label: 'Export image (1x)', cost: 5, description: 'Simulates a standard export.', feature: 'export_1x' },
  { id: 'export4', label: 'Export image (4x)', cost: 12, description: 'Simulates a heavier export.', feature: 'export_4x' },
  { id: 'batch', label: 'Batch export', cost: 25, description: 'Simulates a batch job.', feature: 'batch_export' },
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
  if (profile.planSource === 'PERSONAL') return 'paid';
  if (profile.planSource === 'ORGANIZATION') return 'shared';
  return 'free';
}

function resolveBucket(bucket: Bucket, profile: ProfilePayload | null): Exclude<Bucket, 'auto'> {
  if (bucket !== 'auto') return bucket;
  const fallback = defaultBucketForProfile(profile);
  return fallback === 'auto' ? 'free' : fallback;
}

function getBucketAvailable(resolved: Exclude<Bucket, 'auto'>, profile: ProfilePayload | null) {
  const value =
    resolved === 'paid'
      ? profile?.paidTokens?.remaining
      : resolved === 'free'
      ? profile?.freeTokens?.remaining
      : profile?.sharedTokens?.remaining;

  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

export default function SassyAppClient() {
  const { orgId } = useAuthSession();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<Bucket>('auto');
  const [simulatedBalance, setSimulatedBalance] = useState<number>(0);
  const [events, setEvents] = useState<SpendEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [customLabel, setCustomLabel] = useState('Custom operation');
  const [customCost, setCustomCost] = useState('10');

  const resolvedBucket = useMemo(() => resolveBucket(bucket, profile), [bucket, profile]);
  const bucketAvailable = useMemo(() => getBucketAvailable(resolvedBucket, profile), [resolvedBucket, profile]);
  const tokenName = useMemo(() => getBucketTokenName(resolvedBucket, profile), [resolvedBucket, profile]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch('/api/user/profile', { method: 'GET' });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `Request failed (${res.status})`);
        }
        const data = (await res.json()) as ProfilePayload;
        if (!cancelled) setProfile(data);
      } catch (err: unknown) {
        if (cancelled) return;
        setProfileError(err instanceof Error ? err.message : 'Failed to fetch profile');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Load simulator state from localStorage (best-effort)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        bucket?: Bucket;
        balance?: unknown;
        events?: SpendEvent[];
      };

      if (parsed.bucket) setBucket(parsed.bucket);
      const loadedBalance = safeInt(parsed.balance);
      if (loadedBalance != null && loadedBalance >= 0) setSimulatedBalance(loadedBalance);
      if (Array.isArray(parsed.events)) setEvents(parsed.events.slice(0, 100));
    } catch {
      // ignore
    }
  }, []);

  // If we have no balance yet, initialize it from real tokens.
  useEffect(() => {
    if (!profile) return;

    setBucket((prev) => (prev === 'auto' ? defaultBucketForProfile(profile) : prev));

    setSimulatedBalance((prev) => {
      if (prev > 0) return prev;
      const initialBucket = resolveBucket(bucket, profile);
      return getBucketAvailable(initialBucket, profile);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Persist simulator state.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bucket,
          balance: simulatedBalance,
          events,
        })
      );
    } catch {
      // ignore
    }
  }, [bucket, simulatedBalance, events]);

  function spend(cost: number, label: string, spendBucket: Bucket) {
    setMessage(null);
    const normalizedCost = Math.max(0, Math.floor(cost));

    if (!Number.isFinite(normalizedCost) || normalizedCost <= 0) {
      setMessage('Cost must be a positive integer.');
      return;
    }

    setSimulatedBalance((current) => {
      if (current < normalizedCost) {
        setMessage(`Insufficient simulated balance. Need ${normalizedCost} ${tokenName}.`);
        return current;
      }

      const next = current - normalizedCost;
      setEvents((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          at: Date.now(),
          label,
          bucket: spendBucket,
          cost: normalizedCost,
          remaining: next,
        },
        ...prev,
      ].slice(0, 100));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={dashboardMutedPanelClass('space-y-2 lg:col-span-2')}>
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Real balances (read-only)</p>
          {profileError ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{profileError}</p>
          ) : profile ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={dashboardPanelClass('p-4')}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Paid</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">
                  {profile.paidTokens?.remaining ?? 0}
                </p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.paidTokens?.tokenName ?? 'tokens'}</p>
              </div>
              <div className={dashboardPanelClass('p-4')}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Free</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">
                  {profile.freeTokens?.remaining ?? 0}
                </p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.freeTokens?.tokenName ?? 'tokens'}</p>
              </div>
              <div className={dashboardPanelClass('p-4')}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Shared</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">
                  {profile.sharedTokens?.remaining ?? 0}
                </p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">{profile.sharedTokens?.tokenName ?? 'tokens'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-neutral-300">Loading profile…</p>
          )}
        </section>

        <aside className={dashboardMutedPanelClass('space-y-3')}>
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Simulator</p>

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
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as Bucket)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="auto">Auto</option>
              <option value="paid">Paid</option>
              <option value="free">Free</option>
              <option value="shared">Shared</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Real available for this bucket: <span className="font-semibold">{bucketAvailable}</span>
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                onClick={() => setSimulatedBalance(bucketAvailable)}
              >
                Load from real
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  setEvents([]);
                  setSimulatedBalance(bucketAvailable);
                  setMessage(null);
                }}
              >
                Reset log
              </button>
            </div>
          </div>

          <div className={dashboardPanelClass('p-4 space-y-1')}>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Simulated balance</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">
              {simulatedBalance} <span className="text-sm font-medium text-slate-500 dark:text-neutral-400">{tokenName}</span>
            </p>
            {message ? <p className="text-sm text-rose-600 dark:text-rose-300">{message}</p> : null}
          </div>
        </aside>
      </div>

      <section className={dashboardPanelClass('space-y-4')}>
        <header className="space-y-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Operations</p>
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            Click an operation to spend from the simulated balance. This does not mutate real balances.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map((op) => (
            <button
              key={op.id}
              type="button"
              className={clsx(
                'group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-emerald-500/40',
              )}
              onClick={() => spend(op.cost, op.label, bucket)}
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
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Operation label"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <input
              value={customCost}
              onChange={(e) => setCustomCost(e.target.value)}
              inputMode="numeric"
              placeholder="Cost"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-neutral-100"
              onClick={() => {
                const cost = safeInt(customCost);
                spend(cost ?? 0, customLabel || 'Custom operation', bucket);
              }}
            >
              Spend
            </button>
          </div>
        </div>
      </section>

      <section className={dashboardPanelClass('space-y-3')}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Recent simulated spends</p>
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            onClick={() => {
              setEvents([]);
              setMessage(null);
            }}
          >
            Clear
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-neutral-300">No simulated spends yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-neutral-800">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-neutral-100 truncate">{e.label}</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    {new Date(e.at).toLocaleString()} • bucket: {resolveBucket(e.bucket, profile)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-neutral-100">-{e.cost}</p>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">remaining: {e.remaining}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
