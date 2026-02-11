"use client";
import React, { useEffect, useState, useRef } from 'react';
import ActivatePendingButton from './ActivatePendingButton';

export default function SubscriptionBadge() {
  const [loading, setLoading] = useState(true); // only true for very first fetch
  const [data, setData] = useState<unknown>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightId = useRef(0);
  const stoppedRef = useRef(false);

  const devLog = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.log('[SubscriptionBadge]', ...args);
  };

  useEffect(() => {
    let mounted = true;
    const controllerRef: { current: AbortController | null } = { current: null };

    async function load(opts: { initial?: boolean } = {}) {
      if (!mounted || stoppedRef.current) return;
      // Avoid showing spinner again after first successful load
      if (opts.initial && data) return; // already have data
      const fetchId = ++inFlightId.current;
      const ctrl = new AbortController();
      controllerRef.current?.abort(); // cancel prior fetch
      controllerRef.current = ctrl;
      if (opts.initial && !data) setLoading(true);
      devLog('Fetching subscription... id=', fetchId);
      try {
        const r = await fetch('/api/subscription', { signal: ctrl.signal, cache: 'no-store' });
  const j = await r.json().catch(() => null) as unknown;
        if (!mounted || fetchId !== inFlightId.current) return; // stale
  setData(j);
  devLog('Response', r.status, j);
  const jRec = (typeof j === 'object' && j !== null) ? j as Record<string, unknown> : null;
  if (jRec && jRec.ok === true && jRec.active === true && intervalRef.current) {
          // Once active, stop polling to reduce noise
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            stoppedRef.current = true;
            devLog('Active subscription found; stopped polling');
        }
      } catch (e: unknown) {
        const err = e as { name?: string } | null;
        if (err?.name === 'AbortError') return;
        devLog('Error', e);
      } finally {
        if (mounted && fetchId === inFlightId.current) {
          if (loading) setLoading(false);
        }
      }
    }

    load({ initial: true });
    intervalRef.current = setInterval(() => load(), 7000); // slightly slower cadence

    function onUpdated() {
      devLog('subscription:updated event');
      // Force immediate refresh even if polling stopped
      stoppedRef.current = false;
      load();
    }
    window.addEventListener('subscription:updated', onUpdated as EventListener);
    return () => {
      mounted = false;
      controllerRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('subscription:updated', onUpdated as EventListener);
    };
  // deliberately exclude data from deps to avoid re-trigger loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    devLog('Data changed', data);
  }, [data]);

  if (loading) return <div className="text-sm text-gray-400">Checking subscription…</div>;
  const rec = (typeof data === 'object' && data !== null) ? data as Record<string, unknown> : null;
  if (!rec || rec.ok !== true) return <div className="text-sm text-gray-400">No subscription</div>;
  if (rec.active !== true) {
    // If there's a pending subscription, show an Activate button with clearer copy
    const pending = rec.pending as Record<string, unknown> | undefined;
    if (pending) {
      const planName = typeof pending.plan === 'string' ? pending.plan : 'Pro';
      const subscriptionId = typeof pending.id === 'string' ? pending.id : String(pending.id ?? '');
      return (
        <div className="inline-flex items-center gap-3">
          <div className="text-sm text-gray-300">
            Pending ({planName}) — this purchase is queued and will not overlap your current plan unless you activate it now.
          </div>
          <ActivatePendingButton subscriptionId={subscriptionId} />
        </div>
      );
    }
    return <div className="text-sm text-gray-400">No active Pro</div>;
  }
  const planLabel = typeof rec.plan === 'string' ? rec.plan : 'Pro';
  return <div className="inline-block rounded bg-emerald-600/20 px-2 py-1 text-sm text-emerald-200">Pro ({planLabel})</div>;
}
