'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CHECKOUT_COMPONENT_REGISTRY } from '@/components/checkout/registry';
import { PaymentProviderBadge } from '@/components/ui/PaymentProviderBadge';

// Redirect confirmation data for external checkout (e.g., Paystack subscriptions)
interface RedirectCheckoutData {
    url: string;
    sessionId?: string;
    provider: string;
    amount?: number;
    currency?: string;
    planName?: string;
    email?: string;
    tokenLimit?: number;
    tokenName?: string;
    durationHours?: number;
    shortDescription?: string;
}

function EmbeddedCheckoutContent() {
    const searchParams = useSearchParams();
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [provider, setProvider] = useState<string>('stripe');
    const [email, setEmail] = useState<string | null>(null);
    const [amount, setAmount] = useState<number | null>(null);
    const [currency, setCurrency] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [dedupeKey] = useState(() => crypto.randomUUID());
    // For external redirect flow (Paystack subscriptions)
    const [redirectData, setRedirectData] = useState<RedirectCheckoutData | null>(null);
    const [externalWaiting, setExternalWaiting] = useState(false);
    const [externalStatus, setExternalStatus] = useState<'idle' | 'waiting' | 'active' | 'timeout' | 'error'>('idle');
    const [externalMessage, setExternalMessage] = useState<string>('');
    const [externalSinceMs, setExternalSinceMs] = useState<number | null>(null);
    const [externalSessionId, setExternalSessionId] = useState<string | null>(null);
    const [externalProvider, setExternalProvider] = useState<string | null>(null);
    const pollStopRef = useRef<(() => void) | null>(null);
    const externalLaunchRef = useRef(false);
    // Prevent double-fetch in React StrictMode
    const fetchedRef = useRef(false);

    const stopExternalPoll = () => {
        if (pollStopRef.current) {
            pollStopRef.current();
            pollStopRef.current = null;
        }
    };

    const startExternalPoll = (opts?: { immediate?: boolean; sinceMs?: number; sessionId?: string | null }) => {
        stopExternalPoll();
        setExternalStatus('waiting');
        setExternalMessage('Waiting for payment confirmation... (this may take a moment after you pay)');

        const since = typeof opts?.sinceMs === 'number' ? opts.sinceMs : externalSinceMs;
        if (typeof since === 'number' && Number.isFinite(since)) {
            setExternalSinceMs(since);
        }

        const sessionId = typeof opts?.sessionId === 'string' ? opts.sessionId : externalSessionId;
        if (typeof sessionId === 'string' && sessionId.trim()) {
            setExternalSessionId(sessionId);
        }

        let cancelled = false;
        const startedAt = Date.now();
        const maxMs = 2 * 60 * 1000;
        const intervalMs = 3000;

        const tick = async () => {
            if (cancelled) return;
            try {
                const effectiveSessionId = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
                const effectiveSince = typeof since === 'number' && Number.isFinite(since) ? since : null;

                // Prefer session_id-based confirmation when we have it.
                // This allows redirect-only providers (e.g. Razorpay) to confirm even if webhooks
                // are delayed/missed.
                const url = effectiveSessionId
                    ? `/api/checkout/confirm?session_id=${encodeURIComponent(effectiveSessionId)}`
                    : (effectiveSince
                        ? `/api/checkout/confirm?recent=1&since=${encodeURIComponent(String(effectiveSince))}`
                        : '/api/checkout/confirm?recent=1');
                const res = await fetch(url);
                const data = await res.json().catch(() => null) as unknown;

                // When polling a hosted checkout, avoid the false-positive "active subscription" case.
                // Instead, wait for a new Payment row created after we started polling.
                const completed = typeof data === 'object' && data !== null && (data as { completed?: unknown }).completed === true;
                const okActive = typeof data === 'object' && data !== null && (data as { ok?: unknown; active?: unknown }).ok === true && (data as { active?: unknown }).active === true;

                if (res.ok && (completed || okActive)) {
                    setExternalStatus('active');
                    setExternalMessage('Payment confirmed. Redirecting you back to the app...');
                    const payload = (typeof data === 'object' && data !== null) ? data as { paymentId?: string } : {};
                    const nextParams = new URLSearchParams();
                    nextParams.set('purchase', 'success');
                    if (externalProvider) nextParams.set('provider', externalProvider);
                    if (payload.paymentId) nextParams.set('payment_id', payload.paymentId);
                    window.location.href = `/dashboard?${nextParams.toString()}`;
                    return;
                }
            } catch {
                // ignore transient errors; keep polling until timeout
            }

            if (Date.now() - startedAt > maxMs) {
                setExternalStatus('timeout');
                setExternalMessage('If you completed payment, return to the dashboard and refresh. Activation may take a moment.');
                stopExternalPoll();
                return;
            }

            setTimeout(tick, intervalMs);
        };

        pollStopRef.current = () => {
            cancelled = true;
        };

        if (opts?.immediate) {
            void tick();
        } else {
            setTimeout(tick, 1000);
        }
    };

    useEffect(() => {
        // Guard against double-invocation in StrictMode
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const params = new URLSearchParams(searchParams?.toString());
        params.set('dedupeKey', dedupeKey);
        fetch('/api/checkout/embedded' + (params.toString() ? `?${params.toString()}` : ''))
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    setError(data.error);
                } else if (data.redirect && data.url) {
                    // For Paystack subscriptions, show confirmation modal before redirect
                    setRedirectData({
                        url: data.url,
                        sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
                        provider: data.provider || 'paystack',
                        amount: data.amount,
                        currency: data.currency,
                        planName: data.planName || data.metadata?.planId,
                        email: data.email,
                        tokenLimit: data.tokenLimit,
                        tokenName: data.tokenName,
                        durationHours: data.durationHours,
                        shortDescription: data.shortDescription,
                    });
                } else {
                    setClientSecret(data.clientSecret);
                    setProvider(data.provider || 'stripe');
                    setEmail(data.email || null);
                    setAmount(typeof data.amount === 'number' ? data.amount : null);
                    setCurrency(typeof data.currency === 'string' ? data.currency : null);
                    setMetadata(data.metadata && typeof data.metadata === 'object' ? data.metadata : null);
                }
            })
            .catch((err) => setError(err.message || 'An unexpected error occurred'))
            .finally(() => setLoading(false));

        return () => {
            stopExternalPoll();
        };
    }, [searchParams, dedupeKey]);

    // Format currency helper
    const formatCurrencyValue = (value: number, code: string) => {
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(value / 100);
        } catch {
            return `${(value / 100).toFixed(2)} ${code}`;
        }
    };

    // External checkout confirmation modal
    if (redirectData) {
        const providerName = String(redirectData.provider || '').toLowerCase();
        const shouldOpenInNewTab = providerName === 'razorpay';

        const beginExternalWaitingFlow = () => {
            if (externalLaunchRef.current) return;
            externalLaunchRef.current = true;

            const started = Date.now();
            setExternalSinceMs(started);
            if (typeof redirectData.sessionId === 'string' && redirectData.sessionId.trim()) {
                setExternalSessionId(redirectData.sessionId.trim());
            }
            if (redirectData.provider) {
                setExternalProvider(redirectData.provider);
            }
            setExternalWaiting(true);
            startExternalPoll({ immediate: false, sinceMs: started, sessionId: redirectData.sessionId || null });
        };

        const openExternalCheckout = () => {
            // For providers like Razorpay, prefer opening in a new tab so we can keep polling here.
            if (shouldOpenInNewTab) {
                window.open(redirectData.url, '_blank', 'noopener,noreferrer');
                beginExternalWaitingFlow();
                return;
            }
            window.location.href = redirectData.url;
        };

        if (externalWaiting) {
            return (
                <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 min-h-screen flex items-center justify-center mx-auto max-w-[1440px]">
                    <div className="w-full max-w-xl">
                        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-slate-200/20 dark:shadow-slate-950/40 overflow-hidden">
                            <div className="px-8 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
                                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Complete payment in Razorpay</h1>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                    Razorpay doesn’t always redirect back after subscription checkout. Keep this tab open — we’ll detect activation.
                                </p>
                            </div>
                            <div className="px-8 py-6 space-y-4">
                                <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-teal-600 dark:border-t-teal-400" />
                                    <span>{externalMessage || 'Waiting for payment confirmation...'}</span>
                                </div>

                                {externalStatus === 'timeout' ? (
                                    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                                        Activation can take a moment after payment. You can safely go back to the dashboard and refresh.
                                    </div>
                                ) : null}

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <a
                                        href={redirectData.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => beginExternalWaitingFlow()}
                                        className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-semibold transition-all duration-200 text-center"
                                    >
                                        Open Razorpay Checkout
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => startExternalPoll({ immediate: true, sinceMs: externalSinceMs ?? Date.now(), sessionId: externalSessionId })}
                                        className="flex-1 px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
                                    >
                                        I completed payment
                                    </button>
                                </div>

                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    If you closed the Razorpay tab by accident, use “Open Razorpay Checkout” again.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Helper functions
        const formatDuration = (hours: number) => {
            if (hours < 24) return `${hours} hours`;
            if (hours < 24 * 7) return `${Math.round(hours / 24)} days`;
            if (hours < 24 * 30) return `${Math.round(hours / (24 * 7))} weeks`;
            if (hours < 24 * 365) return `${Math.round(hours / (24 * 30))} months`;
            return `${Math.round(hours / (24 * 365))} years`;
        };

        const getTokenDisplay = () => {
            if (!redirectData.tokenLimit) return null;
            const tokenName = redirectData.tokenName || 'tokens';
            if (redirectData.tokenLimit === -1) return `Unlimited ${tokenName}`;
            return `${redirectData.tokenLimit.toLocaleString()} ${tokenName}`;
        };

        return (
            <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 flex items-center justify-center mx-auto max-w-[1440px]">
                <div className="w-full max-w-2xl">
                    <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-slate-200/20 dark:shadow-slate-950/40 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 px-8 py-6 border-b border-slate-200/60 dark:border-slate-800/60">
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 shadow-lg shadow-teal-500/30 dark:shadow-teal-500/20 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-white bg-clip-text text-transparent">
                                        Confirm Your Subscription
                                    </h1>
                                    <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                                        Review your plan details before proceeding to secure payment
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Plan Details */}
                        <div className="p-8">
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Left Column - Plan Info */}
                                <div className="space-y-6">
                                    {/* Plan Name & Price */}
                                    <div className="text-center md:text-left">
                                        {redirectData.planName && (
                                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                                                {redirectData.planName}
                                            </h2>
                                        )}
                                        {redirectData.amount && redirectData.currency && (
                                            <div className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-500 dark:to-emerald-500 bg-clip-text text-transparent">
                                                {formatCurrencyValue(redirectData.amount, redirectData.currency)}
                                            </div>
                                        )}
                                        {redirectData.shortDescription && (
                                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                                                {redirectData.shortDescription}
                                            </p>
                                        )}
                                    </div>

                                    {/* Plan Features */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">
										What&apos;s Included
                                        </h3>
                                        
                                        <div className="space-y-3">
                                            {/* Duration */}
                                            {redirectData.durationHours && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                            {formatDuration(redirectData.durationHours)} of access
                                                        </p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">Full Pro features</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Tokens */}
                                            {getTokenDisplay() && (
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                            {getTokenDisplay()}
                                                        </p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">Added to your account</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Premium Features */}
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                        All Pro features
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">Advanced tools & capabilities</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Payment Details */}
                                <div className="space-y-6">
                                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-6">
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 uppercase tracking-wide">
                                            Payment Details
                                        </h3>
                                        
                                        <div className="space-y-4">
                                            {redirectData.email && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600 dark:text-slate-400">Email</span>
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[200px] ml-2">
                                                        {redirectData.email}
                                                    </span>
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600 dark:text-slate-400">Currency</span>
                                                <span className="text-sm font-medium text-slate-900 dark:text-white uppercase">
                                                    {redirectData.currency || 'NGN'}
                                                </span>
                                            </div>
                                            
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                                <span className="text-sm text-slate-600 dark:text-slate-400">Payment via</span>
                                                <PaymentProviderBadge provider={redirectData.provider} size="sm" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Security Notice */}
                                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/50 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                                                    Secure Payment
                                                </p>
                                                <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
										You&apos;ll be redirected to {redirectData.provider === 'paystack' ? 'Paystack' : redirectData.provider}{"'"}s secure, encrypted checkout page to complete your payment.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => window.history.back()}
                                    className="flex-1 px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Go Back
                                </button>
                                {shouldOpenInNewTab ? (
                                    <a
                                        href={redirectData.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => beginExternalWaitingFlow()}
                                        className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                                    >
                                        Open Secure Payment (New Tab)
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => openExternalCheckout()}
                                        className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                                    >
                                        Continue to Secure Payment
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 min-h-screen flex items-center justify-center mx-auto max-w-[1440px]">
                <div className="w-full flex items-center justify-center">
                    <div className="relative">
                        <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-blue-600 dark:border-t-blue-500"></div>
                        <div className="absolute inset-0 h-16 w-16 animate-pulse rounded-full bg-blue-500/10"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 min-h-screen flex items-center justify-center mx-auto my-auto max-w-[1440px]">
                <div className="w-full flex items-center justify-center">
                    <div className="max-w-md w-full">
                        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 shadow-xl shadow-red-100/50 dark:shadow-red-950/50 overflow-hidden">
                            <div className="bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 px-6 py-4 border-b border-red-200 dark:border-red-900/50">
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-red-600 dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Checkout Unavailable</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">Unable to load payment form</p>
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4">
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const CheckoutComponent = CHECKOUT_COMPONENT_REGISTRY[provider];

    const formatCurrency = (value: number, code: string) => {
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(value / 100);
        } catch {
            return `${(value / 100).toFixed(2)} ${code}`;
        }
    };

    const planId = metadata?.planId || metadata?.plan_id;
    const priceId = metadata?.priceId || metadata?.planPriceId || metadata?.price_id;
    const summary = {
        planId: planId || '—',
        priceId: priceId || '—',
        amount: amount ?? 0,
        currency: currency || 'NGN',
        provider: provider || 'paystack',
    };

    if (!clientSecret || !CheckoutComponent) {
        return (
            <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 min-h-screen flex items-center justify-center mx-auto max-w-[1440px]">
                <div className="w-full flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                            <svg className="w-8 h-8 text-slate-400 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                            {!clientSecret ? 'Missing payment information' : `Unsupported payment provider: ${provider}`}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-4 sm:px-6 lg:px-8 min-h-screen mx-auto max-w-[1440px]">
            <div>
                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20 mb-4">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-white bg-clip-text text-transparent mb-2">
                        Secure Checkout
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-md mx-auto flex items-center justify-center gap-2 flex-wrap">
                        <span>Complete your purchase securely with</span>
                        <PaymentProviderBadge provider={provider} variant="logo" size="md" />
                    </p>
                </div>

                {/* Main Content */}
                <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
                    {/* Order Summary */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 overflow-hidden">
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-900/50 px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Order Summary
                                </h2>
                            </div>
                            
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Amount</span>
                                    <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 bg-clip-text text-transparent">
                                        {formatCurrency(summary.amount, summary.currency)}
                                    </span>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                            </svg>
                                            Currency
                                        </span>
                                        <span className="font-medium text-slate-900 dark:text-white uppercase">{summary.currency}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                            </svg>
                                            Plan
                                        </span>
                                        <span className="font-medium text-slate-900 dark:text-white">{summary.planId}</span>
                                    </div>

                                    <div className="flex items-start justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                            <svg className="w-4 h-4 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                            </svg>
                                            Price ID
                                        </span>
                                        <span className="font-mono text-xs text-slate-900 dark:text-white text-right max-w-[220px] break-all">{summary.priceId}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            Payment Provider
                                        </span>
                                        <PaymentProviderBadge provider={summary.provider} variant="badge" size="sm" />
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">Tokens Included</p>
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                                                    Your tokens will be automatically added to your account after successful payment.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Security Badge */}
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Secure 256-bit SSL encrypted payment</span>
                        </div>
                    </div>

                    {/* Payment Form */}
                    <div className="lg:col-span-3">
                        <div className="rounded-3xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 overflow-hidden">
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-900/50 px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    Payment Details
                                </h2>
                            </div>
                            
                            <div className="p-6 sm:p-8">
                                <CheckoutComponent
                                    clientSecret={clientSecret}
                                    email={email || undefined}
                                    amount={amount ?? undefined}
                                    currency={currency || undefined}
                                    metadata={metadata || undefined}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function EmbeddedCheckoutPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading checkout...</div>}>
            <EmbeddedCheckoutContent />
        </Suspense>
    );
}
