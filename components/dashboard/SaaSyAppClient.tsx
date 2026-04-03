'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthSession } from '@/lib/auth-provider/client';
import {
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

function formatEventTime(at: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
}

export default function SaaSyAppClient() {
  const { orgId, isLoaded, isSignedIn } = useAuthSession();
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
    if (!isLoaded) return;
    if (!isSignedIn) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    refreshProfile().catch((err: unknown) => {
      setProfileError(err instanceof Error ? err.message : 'Failed to fetch profile');
    });
  }, [isLoaded, isSignedIn, orgId]);

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
  const paidRemaining = profile?.paidTokens?.remaining ?? 0;
  const balanceItems = [
    {
      key: 'paid',
      label: 'Paid',
      value: formatBucketDisplay(paidRemaining, profile?.paidTokens?.isUnlimited),
      tokenLabel: profile?.paidTokens?.tokenName ?? 'tokens',
      accent: 'bg-emerald-500',
      mutedAccent: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
    },
    {
      key: 'free',
      label: 'Free',
      value: formatBucketDisplay(freeRemaining),
      tokenLabel: profile?.freeTokens?.tokenName ?? 'tokens',
      accent: 'bg-sky-500',
      mutedAccent: 'bg-sky-500/12 text-sky-700 dark:text-sky-200',
    },
    {
      key: 'shared',
      label: 'Shared',
      value: formatBucketDisplay(sharedRemaining),
      tokenLabel: profile?.sharedTokens?.tokenName ?? 'tokens',
      accent: 'bg-violet-500',
      mutedAccent: 'bg-violet-500/12 text-violet-700 dark:text-violet-200',
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.75))] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,250,252,0.96))] shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,rgba(10,14,24,0.96),rgba(14,18,28,0.98))] dark:shadow-[0_30px_90px_rgba(2,6,23,0.48)]">
      <WarningsModal
        isOpen={warningOpen}
        warnings={warningPayload?.warnings ?? []}
        context={warningContext}
        onClose={() => {
          setWarningOpen(false);
          setWarningPayload(null);
        }}
      />
      <WarningsModal
        isOpen={Boolean(message)}
        title="Action failed"
        description="{message ?? undefined}"
        warnings={message ? [{ code: 'error', message }] : []}
        acknowledgeLabel="Close"
        onClose={() => setMessage(null)}
      />
        <section className="border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.75))] bg-[linear-gradient(135deg,rgba(250,250,255,0.92),rgba(239,246,255,0.72))] px-4 py-4 dark:bg-[linear-gradient(135deg,rgba(32,23,60,0.5),rgba(8,15,28,0.3))] sm:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] xl:items-end">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white shadow-sm">
                  Demo Token Operations
                </span>
                <span className={dashboardPillClass('bg-white/70 dark:bg-white/5')}>
                  Bucket <span className="font-semibold uppercase text-slate-900 dark:text-neutral-100">{resolvedBucket}</span>
                </span>
                <span className={dashboardPillClass('bg-white/70 dark:bg-white/5')}>
                  Unit <span className="font-semibold text-slate-900 dark:text-neutral-100">{tokenName}</span>
                </span>
              </div>

              {profileError ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{profileError}</p>
              ) : profile ? (
                <div className="grid grid-cols-3 gap-2 xl:max-w-3xl">
                  {balanceItems.map((item) => (
                    <div
                      key={item.key}
                      className="min-w-0 rounded-2xl border border-white/60 bg-white/80 px-2.5 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.04] sm:flex sm:items-center sm:gap-3 sm:px-3 sm:py-3"
                    >
                      <span className={clsx('mb-2 block h-1.5 w-8 rounded-full sm:mb-0 sm:h-10 sm:w-1.5', item.accent)} />
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-neutral-400 sm:text-[11px] sm:tracking-[0.22em]">{item.label}</p>
                        <div className="mt-1 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                          <span className="text-sm font-semibold tracking-[-0.03em] text-slate-950 dark:text-white sm:text-lg">{item.value}</span>
                          <span className={clsx('max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2', item.mutedAccent)}>{item.tokenLabel}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-neutral-300">Loading balances…</p>
              )}
            </div>

            <div className="w-full rounded-[24px] border border-white/70 bg-white/85 p-3 shadow-[0_16px_32px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-black/20 lg:p-4 xl:max-w-xl xl:justify-self-end">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-neutral-400">Preferred bucket</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Pick a source bucket, run a real spend action, and experiment with token operations.</p>
                </div>
                <button
                  type="button"
                  className="h-8 whitespace-nowrap rounded-2xl border border-violet-700 bg-violet-600 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(124,58,237,0.22)] transition hover:bg-violet-500 disabled:opacity-70 dark:border-violet-400 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400"
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

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {['auto', 'paid', 'free', 'shared'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy || (option === 'shared' && !profile?.sharedTokens)}
                    onClick={() => setBucket(option as Bucket)}
                    className={clsx(
                      'rounded-2xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50',
                      bucket === option
                        ? 'bg-violet-600 text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] dark:bg-violet-500 dark:text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10'
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </section>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <section className="min-w-0 border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.75))] px-4 py-4 dark:border-b-white/10 xl:border-b-0 xl:border-r xl:px-5">

            <div className="overflow-hidden rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-white/70 dark:bg-white/[0.03]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.6))] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
                <span>Action</span>
              </div>
              <div className="divide-y divide-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))]">
                {OPERATIONS.map((op) => (
                  <div key={op.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{op.label}</p>
                      {op.description ? <p className="truncate text-xs text-slate-500 dark:text-neutral-400">{op.description}</p> : null}
                    </div>
                    <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                      {op.cost} {tokenName}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-100 dark:hover:border-violet-500/50 dark:hover:text-violet-200"
                      onClick={() => spend(op.cost, op.label, bucket, op.feature)}
                    >
                      Run
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <section className="mt-4 overflow-hidden rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.7))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
              <div className="border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.6))] px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-neutral-400">Quick composer</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">Custom operation</h3>
              </div>
              <div className="px-4 py-4">
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                <input
                  suppressHydrationWarning
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Operation label"
                  disabled={busy}
                  className="h-10 min-w-[10rem] flex-[1.6] rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-950/80 dark:text-neutral-100"
                />
                <input
                  suppressHydrationWarning
                  value={customCost}
                  onChange={(e) => setCustomCost(e.target.value)}
                  inputMode="numeric"
                  placeholder="Cost"
                  disabled={busy}
                  className="h-10 w-24 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-950/80 dark:text-neutral-100"
                />
                <button
                  type="button"
                  disabled={busy}
                  className="h-10 shrink-0 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-70"
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
          </section>

          <aside className="min-w-0 px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-[24px] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-white/70 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3 border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.6))] px-4 py-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-neutral-400">Recent operations</p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-800 disabled:opacity-70 dark:text-neutral-400 dark:hover:text-white"
                    disabled={busy}
                    onClick={() => setEvents([])}
                  >
                    Clear
                  </button>
                </div>

                {events.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-600 dark:text-neutral-300">No operations yet.</p>
                ) : (
                  <ul className="divide-y divide-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))]">
                    {events.map((e) => (
                      <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-sm">
                        <span
                          className={clsx(
                            'mt-1 h-2.5 w-2.5 rounded-full',
                            e.ok ? 'bg-emerald-500' : 'bg-rose-500'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate font-semibold text-slate-950 dark:text-white">{e.label}</p>
                            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-neutral-500">{formatEventTime(e.at)}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-neutral-400">
                            {resolveBucket(e.bucket, profile)} bucket • {e.ok ? 'completed' : 'failed'}
                            {e.detail ? ` • ${e.detail}` : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/5 dark:text-neutral-200">
                          -{e.cost}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </div>
    </div>
  );
}
