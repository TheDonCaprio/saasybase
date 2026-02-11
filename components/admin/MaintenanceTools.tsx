"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

type CacheStats = {
  prefix: string;
  total: number;
  pending: number;
  ready: number;
  stalePending: number;
  oldReady: number;
  invalid: number;
  scanned: number;
};

type Thresholds = {
  pendingOlderThanMinutes: number;
  readyOlderThanDays: number;
};

type GetResponse = {
  stats: CacheStats;
  thresholds: Thresholds;
  limits?: { maxScan?: number };
  error?: string;
};

type PostResponse = {
  dryRun: boolean;
  scanned: number;
  wouldDelete: number;
  deleted: number;
  thresholds: Thresholds;
  reasons: Record<string, number>;
  statsAfter: CacheStats;
  error?: string;
};

function StatPill({ label, value, tone }: { label: string; value: number; tone?: 'neutral' | 'warn' | 'danger' }) {
  const cls =
    tone === 'danger'
      ? 'bg-rose-500/10 text-rose-200 border-rose-500/20'
      : tone === 'warn'
        ? 'bg-amber-500/10 text-amber-200 border-amber-500/20'
        : 'bg-neutral-800 text-neutral-200 border-neutral-700';

  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

export function MaintenanceTools() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds>({ pendingOlderThanMinutes: 10, readyOlderThanDays: 90 });
  const [lastResult, setLastResult] = useState<PostResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        pendingOlderThanMinutes: String(thresholds.pendingOlderThanMinutes),
        readyOlderThanDays: String(thresholds.readyOlderThanDays),
      });
      const res = await fetch(`/api/admin/maintenance/discounted-subscription-price-cache?${qs.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as GetResponse | null;
      if (!res.ok) {
        setError(data?.error || 'Failed to load stats');
        setStats(null);
        return;
      }
      setStats(data?.stats ?? null);
      if (data?.thresholds) setThresholds(data.thresholds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [thresholds.pendingOlderThanMinutes, thresholds.readyOlderThanDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionableCount = useMemo(() => {
    if (!stats) return 0;
    return stats.stalePending + stats.oldReady + stats.invalid;
  }, [stats]);

  const runCleanup = useCallback(async (dryRun: boolean) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maintenance/discounted-subscription-price-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          pendingOlderThanMinutes: thresholds.pendingOlderThanMinutes,
          readyOlderThanDays: thresholds.readyOlderThanDays,
        }),
      });
      const data = (await res.json().catch(() => null)) as PostResponse | null;
      if (!res.ok) {
        setError(data?.error || 'Cleanup failed');
        return;
      }
      setLastResult(data ?? null);
      setStats(data?.statsAfter ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setRunning(false);
    }
  }, [thresholds.pendingOlderThanMinutes, thresholds.readyOlderThanDays]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-neutral-100">Discounted subscription price cache</h2>
            <p className="text-sm text-neutral-400">
              Cleans up internal dedupe keys stored in the database. This does not delete provider plans; it only controls reuse.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading || running}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-700 disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faRotateRight} className="h-4 w-4" />
              Refresh
            </button>

            <button
              onClick={() => void runCleanup(true)}
              disabled={loading || running}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/15 disabled:opacity-60"
              title="Preview what would be deleted"
            >
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
              Preview
            </button>

            <button
              onClick={() => void runCleanup(false)}
              disabled={loading || running || actionableCount === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/15 disabled:opacity-60"
              title={actionableCount === 0 ? 'Nothing eligible to delete' : 'Delete eligible keys now'}
            >
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
              Run cleanup
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatPill label="Total" value={stats?.total ?? 0} />
          <StatPill label="Ready" value={stats?.ready ?? 0} />
          <StatPill label="Pending" value={stats?.pending ?? 0} tone="warn" />
          <StatPill label="Stale pending" value={stats?.stalePending ?? 0} tone={(stats?.stalePending ?? 0) > 0 ? 'warn' : 'neutral'} />
          <StatPill label="Old ready" value={stats?.oldReady ?? 0} tone={(stats?.oldReady ?? 0) > 0 ? 'warn' : 'neutral'} />
          <StatPill label="Invalid" value={stats?.invalid ?? 0} tone={(stats?.invalid ?? 0) > 0 ? 'danger' : 'neutral'} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Stale pending threshold (minutes)</label>
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              value={thresholds.pendingOlderThanMinutes}
              disabled={loading || running}
              onChange={(e) => setThresholds((prev) => ({ ...prev, pendingOlderThanMinutes: Number(e.target.value) }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            />
            <p className="text-xs text-neutral-500">Pending keys are just locks. If a request crashed, this clears the stuck lock.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-400">Old ready threshold (days)</label>
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              value={thresholds.readyOlderThanDays}
              disabled={loading || running}
              onChange={(e) => setThresholds((prev) => ({ ...prev, readyOlderThanDays: Number(e.target.value) }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            />
            <p className="text-xs text-neutral-500">Ready keys enable reuse. Deleting old ones reduces DB clutter but may recreate provider plans later.</p>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-400">Loading…</p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-rose-200">{error}</p>
        ) : null}

        {lastResult ? (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Last run:</span>
              <span>{lastResult.dryRun ? 'Preview' : 'Cleanup'}</span>
              <span className="text-neutral-500">·</span>
              <span>Scanned {lastResult.scanned}</span>
              <span className="text-neutral-500">·</span>
              <span>Would delete {lastResult.wouldDelete}</span>
              {!lastResult.dryRun ? (
                <>
                  <span className="text-neutral-500">·</span>
                  <span>Deleted {lastResult.deleted}</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {stats?.prefix ? (
          <p className="mt-3 text-xs text-neutral-500">Key prefix: {stats.prefix}</p>
        ) : null}
      </div>
    </section>
  );
}
