'use client';

import { useEffect, useMemo, useState } from 'react';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import { useAuthSession } from '@/lib/auth-provider/client';
import {
  dashboardPanelClass,
  dashboardMutedPanelClass,
  dashboardPillClass,
} from '@/components/dashboard/dashboardSurfaces';
import { WarningsModal, type AppWarning, type SharedCapContext } from '@/components/ui/WarningsModal';
import { emitTokenBalancesUpdated } from '@/lib/token-balance-sync';

type Bucket = 'auto' | 'paid' | 'free' | 'shared';

type ProfilePayload = {
  paidTokens?: { tokenName?: string; remaining?: number; isUnlimited?: boolean };
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

type SpendResponseOk = {
  ok: true;
  amount: number;
  bucket: Exclude<Bucket, 'auto'>;
  organizationId?: string | null;
  warnings?: AppWarning[];
  sharedCap?: SharedCapContext;
  balances: {
    paid: number;
    free: number;
    shared: number | null;
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

function applyBalanceSnapshot(profile: ProfilePayload | null, balances: SpendResponseOk['balances']) {
  if (!profile) {
    return profile;
  }

  return {
    ...profile,
    paidTokens: profile.paidTokens
      ? {
          ...profile.paidTokens,
          remaining: balances.paid,
        }
      : profile.paidTokens,
    freeTokens: profile.freeTokens
      ? {
          ...profile.freeTokens,
          remaining: balances.free,
        }
      : profile.freeTokens,
    sharedTokens: profile.sharedTokens && typeof balances.shared === 'number'
      ? {
          ...profile.sharedTokens,
          remaining: balances.shared,
        }
      : profile.sharedTokens,
  };
}

function defaultBucketForProfile(profile: ProfilePayload | null, isTeamWorkspace: boolean): Bucket {
  if (!profile) return 'auto';

  if (isTeamWorkspace) {
    // In team workspace, only the shared bucket is usable
    return 'shared';
  }

  // In personal workspace, only paid and free are usable
  const paidRemaining = Math.max(0, Number(profile.paidTokens?.remaining ?? 0));
  const paidUnlimited = profile.paidTokens?.isUnlimited === true;
  const freeRemaining = Math.max(0, Number(profile.freeTokens?.remaining ?? 0));

  if (paidUnlimited || paidRemaining > 0) return 'paid';
  if (freeRemaining > 0) return 'free';
  return 'paid';
}

function resolveBucket(bucket: Bucket, profile: ProfilePayload | null, isTeamWorkspace = false): Exclude<Bucket, 'auto'> {
  if (bucket !== 'auto') return bucket;
  const fallback = defaultBucketForProfile(profile, isTeamWorkspace);
  return fallback === 'auto' ? (isTeamWorkspace ? 'shared' : 'free') : fallback;
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

export default function SaaSyAppClient({ isTeamWorkspace }: { isTeamWorkspace: boolean }) {
  const { orgId, isLoaded, isSignedIn } = useAuthSession();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<Bucket>('auto');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<SpendEvent[]>([]);

  const [warningOpen, setWarningOpen] = useState(false);
  const [warningPayload, setWarningPayload] = useState<{
    warnings: AppWarning[];
    sharedCap?: SharedCapContext;
    tokenName: string;
  } | null>(null);

  const [customLabel, setCustomLabel] = useState('Custom operation');
  const [customCost, setCustomCost] = useState('10');

  const resolvedBucket = useMemo(() => resolveBucket(bucket, profile, isTeamWorkspace), [bucket, profile, isTeamWorkspace]);
  const tokenName = useMemo(() => getBucketTokenName(resolvedBucket, profile), [resolvedBucket, profile]);

  // Bucket options available in the current workspace
  const availableBuckets: Bucket[] = isTeamWorkspace
    ? ['shared']
    : ['paid', 'free'];

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
      // If the selected bucket is no longer valid for this workspace, reset
      if (isTeamWorkspace && prev !== 'shared') return 'shared';
      if (!isTeamWorkspace && prev === 'shared') return defaultBucketForProfile(profile, isTeamWorkspace);
      return prev;
    });
  }, [profile, isTeamWorkspace]);

  async function spend(cost: number, label: string, spendBucket: Bucket, feature?: string) {
    setMessage(null);

    // Resolve auto to a concrete bucket before validation
    const resolved = resolveBucket(spendBucket, profile, isTeamWorkspace);

    // Enforce workspace bucket restrictions
    if (isTeamWorkspace && resolved !== 'shared') {
      setMessage('Only the shared (organization) bucket is available in a team workspace.');
      return;
    }
    if (!isTeamWorkspace && resolved === 'shared') {
      setMessage('The shared bucket is only available in a team workspace.');
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

      setProfile((current) => applyBalanceSnapshot(current, payload.balances));
      emitTokenBalancesUpdated({
        bucket: payload.bucket,
        organizationId: payload.organizationId ?? null,
        balances: payload.balances,
      });
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
  // keep these referenced so lint doesn't flag them as unused (used by event log display)
  void freeRemaining;
  void sharedRemaining;
  void paidRemaining;

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
      <WarningsModal
        isOpen={Boolean(message)}
        title="Action failed"
        description={message ?? undefined}
        warnings={message ? [{ code: 'error', message }] : []}
        acknowledgeLabel="Close"
        onClose={() => setMessage(null)}
      />

        {/* Controls bar */}
        <section className={dashboardPanelClass('p-4 sm:p-5')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[color:rgb(var(--accent-rgb))] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white shadow-sm">
                {isTeamWorkspace ? 'Team workspace' : 'Personal workspace'}
              </span>
              <span className={dashboardPillClass()}>
                Bucket <span className="font-semibold uppercase text-slate-900 dark:text-neutral-100">{resolvedBucket}</span>
              </span>
              <span className={dashboardPillClass()}>
                Unit <span className="font-semibold text-slate-900 dark:text-neutral-100">{tokenName}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {profileError ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{profileError}</p>
              ) : null}

              <div className="flex gap-2 rounded-full border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-white/70 p-1 shadow-sm dark:bg-white/5">
                {availableBuckets.map((option) => {
                  const isActive = bucket === option || (bucket === 'auto' && resolvedBucket === option);

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isActive}
                      disabled={busy}
                      onClick={() => setBucket(option)}
                      className={clsx(
                        'rounded-full border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition duration-200 disabled:cursor-not-allowed disabled:opacity-50',
                        isActive
                          ? 'border-[color:rgb(var(--accent-rgb))] bg-[color:rgb(var(--accent-rgb))] text-white shadow-[0_0_0_1px_rgb(var(--accent-rgb)_/_0.18),0_10px_24px_rgb(var(--accent-rgb)_/_0.24)]'
                          : 'border-transparent bg-transparent text-slate-500 hover:border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.85))] hover:bg-slate-100 hover:text-slate-800 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white'
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Refresh balances"
                title="Refresh balances"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.8))] bg-[color:rgb(var(--surface-card))] text-slate-600 shadow-sm transition duration-200 hover:border-[color:rgb(var(--accent-rgb)_/_0.55)] hover:text-[color:rgb(var(--accent-rgb))] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200"
                disabled={busy || refreshing}
                onClick={() => {
                  setRefreshing(true);
                  refreshProfile()
                    .catch((err: unknown) =>
                      setMessage(err instanceof Error ? err.message : 'Refresh failed')
                    )
                    .finally(() => setRefreshing(false));
                }}
              >
                <FontAwesomeIcon
                  icon={faArrowsRotate}
                  className={clsx('h-3.5 w-3.5 transition-transform duration-200', refreshing && 'animate-spin')}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Main area: operations + event log */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <section className="min-w-0 space-y-4">

            {/* Operations table */}
            <div className={dashboardPanelClass('p-0 overflow-hidden')}>
              <div className="border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.6))] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-400">
                <span>Actions</span>
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
                      className="rounded-full border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-card))] px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[color:rgb(var(--accent-rgb)_/_0.5)] hover:text-[color:rgb(var(--accent-rgb))] disabled:opacity-70 dark:text-neutral-100"
                      onClick={() => spend(op.cost, op.label, bucket, op.feature)}
                    >
                      Run
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick composer */}
            <div className={dashboardMutedPanelClass('p-0 overflow-hidden')}>
              <div className="border-b border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.6))] px-4 py-3">
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
                  className="h-10 min-w-[8rem] flex-[1.6] rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-card))] px-3 text-sm text-slate-900 shadow-sm focus:border-[color:rgb(var(--accent-rgb))] focus:outline-none focus:ring-2 focus:ring-[color:rgb(var(--accent-rgb)_/_0.15)] disabled:opacity-70 dark:text-neutral-100"
                />
                <input
                  suppressHydrationWarning
                  value={customCost}
                  onChange={(e) => setCustomCost(e.target.value)}
                  inputMode="numeric"
                  placeholder="Cost"
                  disabled={busy}
                  className="h-10 w-16 shrink-0 rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.7))] bg-[color:rgb(var(--surface-card))] px-3 text-sm text-slate-900 shadow-sm focus:border-[color:rgb(var(--accent-rgb))] focus:outline-none focus:ring-2 focus:ring-[color:rgb(var(--accent-rgb)_/_0.15)] disabled:opacity-70 dark:text-neutral-100"
                />
                <button
                  type="button"
                  disabled={busy}
                  className="h-10 shrink-0 rounded-[var(--theme-surface-radius)] border border-[color:rgb(var(--accent-rgb))] bg-[color:rgb(var(--accent-rgb))] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgb(var(--accent-rgb)_/_0.24)] transition duration-200 hover:brightness-[1.03] hover:shadow-[0_16px_34px_rgb(var(--accent-rgb)_/_0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--accent-rgb)_/_0.22)] disabled:brightness-100 disabled:shadow-none disabled:opacity-70"
                  onClick={() => {
                    const cost = safeInt(customCost);
                    spend(cost ?? 0, customLabel || 'Custom operation', bucket, 'custom');
                  }}
                >
                  Spend
                </button>
                </div>
              </div>
            </div>
          </section>

          {/* Event log sidebar */}
          <aside className="min-w-0">
              <div className={dashboardPanelClass('p-0 overflow-hidden')}>
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
              </div>
          </aside>
        </div>
    </div>
  );
}
