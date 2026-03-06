'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function CheckoutReturnClient() {
  const params = useSearchParams();
  const provider = (params?.get('provider') || '').toLowerCase() || 'payment';
  const status = (params?.get('status') || '').toLowerCase() || 'success';
  const sessionId = params?.get('session_id') || params?.get('sessionId') || '';
  const paymentId = params?.get('payment_id') || params?.get('paymentId') || '';
  const sinceParam = params?.get('since') || '';

  const [closeAttempted, setCloseAttempted] = useState(false);
  const [closeSucceeded, setCloseSucceeded] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'timeout'>('idle');

  const isSuccess = status === 'success' || status === 'paid' || status === 'completed';
  const providerLabel = useMemo(() => {
    if (!provider || provider === 'payment') return 'Payment';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }, [provider]);
  const sinceDate = useMemo(() => {
    const ms = Number(sinceParam);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  }, [sinceParam]);
  const title = useMemo(() => {
    if (isSuccess) return 'Finalizing payment';
    if (status === 'cancelled' || status === 'canceled') return 'Payment cancelled';
    return 'Payment status';
  }, [isSuccess, status]);

  const subtitle = useMemo(() => {
    if (isSuccess) {
      return 'Please keep this page open while we confirm your payment.';
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
    const hasPaymentId = Boolean(paymentId);
    const maxMs = 2 * 60 * 1000;
    const intervalMs = 3000;
    const startedAt = Date.now();

    setConfirmStatus('waiting');

    const tick = async () => {
      if (cancelled) return;
      try {
        const qp = new URLSearchParams();
        if (hasSession) qp.set('session_id', sessionId);
        if (hasPaymentId) qp.set('payment_id', paymentId);
        if (hasSince) qp.set('since', String(sinceMs));
        if (!hasSession && !hasPaymentId) qp.set('recent', '1');
        const url = `/api/checkout/confirm?${qp.toString()}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => null) as {
          completed?: boolean;
          ok?: boolean;
          active?: boolean;
          paymentId?: string;
          requiresOrganizationSetup?: boolean;
          setupUrl?: string;
        } | null;
        const completed = Boolean(data?.completed) || (Boolean(data?.ok) && Boolean(data?.active));
        if (res.ok && completed) {
          if (data?.requiresOrganizationSetup) {
            const setupDestination = data.setupUrl || '/dashboard/team?fromCheckout=1&provision=1';
            window.location.href = setupDestination;
            return;
          }

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
    if (isSuccess) return;
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
  }, [isSuccess]);

  const dashboardHref = isSuccess
    ? `/dashboard?purchase=success&provider=${encodeURIComponent(provider)}`
    : '/pricing?canceled=1';

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-6 px-4 min-h-[80vh] flex items-center justify-center mx-auto max-w-[1440px]">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-slate-200/20 dark:shadow-slate-950/40 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
          </div>

          <div className="px-8 py-6 space-y-4">
            {closeAttempted && !closeSucceeded ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/20 p-4 text-sm text-slate-700 dark:text-slate-300">
                If this tab didn’t close automatically, you can close it now.
              </div>
            ) : null}

            {isSuccess ? (
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-950/20 p-5 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-teal-600 dark:border-t-teal-400" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Finalizing your payment</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Please keep this page open until we finish.</div>
                  </div>
                </div>
              </div>
            ) : null}

            {confirmStatus === 'timeout' ? (
              <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                This is taking longer than usual, but it can still complete. You can keep this page open.
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/60 p-4 text-sm text-slate-700 dark:text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Details</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Provider</div>
                  <div className="font-medium text-slate-900 dark:text-white">{providerLabel}</div>
                </div>
                {sessionId ? (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Session</div>
                    <div className="font-medium text-slate-900 dark:text-white break-all">{sessionId}</div>
                  </div>
                ) : null}
                {paymentId ? (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Payment</div>
                    <div className="font-medium text-slate-900 dark:text-white break-all">{paymentId}</div>
                  </div>
                ) : null}
                {sinceDate ? (
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Started</div>
                    <div className="font-medium text-slate-900 dark:text-white">{sinceDate}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/20 p-4 text-sm text-slate-700 dark:text-slate-300">
              We will keep checking for confirmation. You can safely close this tab and we will update your dashboard as soon as it is finalized.
            </div>

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
