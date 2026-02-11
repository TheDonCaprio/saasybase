'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function CheckoutReturnClient() {
  const params = useSearchParams();
  const provider = (params?.get('provider') || '').toLowerCase() || 'payment';
  const status = (params?.get('status') || '').toLowerCase() || 'success';
  const sessionId = params?.get('session_id') || params?.get('sessionId') || '';
  const sinceParam = params?.get('since') || '';

  const [closeAttempted, setCloseAttempted] = useState(false);
  const [closeSucceeded, setCloseSucceeded] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'timeout'>('idle');

  const isSuccess = status === 'success' || status === 'paid' || status === 'completed';
  const title = useMemo(() => {
    if (isSuccess) return 'Payment complete';
    if (status === 'cancelled' || status === 'canceled') return 'Payment cancelled';
    return 'Payment status';
  }, [isSuccess, status]);

  const subtitle = useMemo(() => {
    if (isSuccess) {
      if (confirmStatus === 'waiting') {
        return `Confirming your ${provider} payment now. This can take a moment.`;
      }
      return `You can close this tab. Your ${provider} payment will be reflected in the app shortly.`;
    }
    if (status === 'cancelled' || status === 'canceled') {
      return `No worries — you can return to the app and try again.`;
    }
    return `You can return to the app to continue.`;
  }, [confirmStatus, isSuccess, provider, status]);

  useEffect(() => {
    if (!isSuccess) return;

    let cancelled = false;
    const sinceMs = Number(sinceParam);
    const hasSince = Number.isFinite(sinceMs) && sinceMs > 0;
    const hasSession = Boolean(sessionId);
    const maxMs = 2 * 60 * 1000;
    const intervalMs = 3000;
    const startedAt = Date.now();

    setConfirmStatus('waiting');

    const tick = async () => {
      if (cancelled) return;
      try {
        const url = hasSession
          ? `/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`
          : (hasSince
            ? `/api/checkout/confirm?recent=1&since=${encodeURIComponent(String(sinceMs))}`
            : '/api/checkout/confirm?recent=1');
        const res = await fetch(url);
        const data = await res.json().catch(() => null) as { completed?: boolean; ok?: boolean; active?: boolean; paymentId?: string } | null;
        const completed = Boolean(data?.completed) || (Boolean(data?.ok) && Boolean(data?.active));
        if (res.ok && completed) {
          setConfirmStatus('confirmed');
          const nextParams = new URLSearchParams();
          nextParams.set('purchase', 'success');
          if (provider) nextParams.set('provider', provider);
          if (data?.paymentId) nextParams.set('payment_id', data.paymentId);
          window.location.href = `/dashboard?${nextParams.toString()}`;
          return;
        }
      } catch {
        // ignore transient errors
      }

      if (Date.now() - startedAt > maxMs) {
        setConfirmStatus('timeout');
        return;
      }

      setTimeout(tick, intervalMs);
    };

    setTimeout(tick, 600);

    return () => {
      cancelled = true;
    };
  }, [isSuccess, provider, sessionId, sinceParam]);

  useEffect(() => {
    // Best-effort: if this tab can close itself (usually only if opened via script), do so.
    // This reduces "double dashboard" noise when the original tab is already handling confirmation.
    const t = setTimeout(() => {
      setCloseAttempted(true);
      try {
        window.close();
        // In most browsers, if window.close is blocked, the tab remains open.
        // We can't reliably detect failure, but we can infer success if the page becomes hidden quickly.
        setTimeout(() => {
          if (document.hidden) setCloseSucceeded(true);
        }, 250);
      } catch {
        // ignore
      }
    }, 600);

    return () => clearTimeout(t);
  }, []);

  const dashboardHref = isSuccess
    ? `/dashboard?purchase=success&provider=${encodeURIComponent(provider)}`
    : '/pricing?canceled=1';

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-10 px-4 min-h-screen flex items-center justify-center mx-auto max-w-[1440px]">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-slate-200/20 dark:shadow-slate-950/40 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
          </div>

          <div className="px-8 py-6 space-y-4">
            {closeAttempted && !closeSucceeded ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/20 p-4 text-sm text-slate-700 dark:text-slate-300">
                If this tab didn’t close automatically, you can close it now.
              </div>
            ) : null}

            {confirmStatus === 'waiting' ? (
              <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-950/20 p-4 text-sm text-slate-700 dark:text-slate-300">
                Confirming your payment with {provider}. You can keep this tab open, or return to the dashboard.
              </div>
            ) : null}

            {confirmStatus === 'timeout' ? (
              <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                Confirmation is taking longer than usual. Your payment may still complete shortly.
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={dashboardHref}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-semibold transition-all duration-200 text-center"
              >
                Return to dashboard
              </Link>
              <button
                type="button"
                onClick={() => window.close()}
                className="flex-1 px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
              >
                Close this tab
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Tip: if you already have the app open in another tab, it may confirm automatically.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
