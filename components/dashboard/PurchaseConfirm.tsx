"use client";
import React, { useEffect, useState } from 'react';
import { useAuthSession } from '@/lib/auth-provider/client';
import { toError } from '../../lib/runtime-guards';

export default function PurchaseConfirm() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const { isLoaded: authLoaded, userId } = useAuthSession();

  const devLog = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.log('[PurchaseConfirm]', ...args);
  };

  // Ensure component is properly mounted before accessing browser APIs
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    devLog('PurchaseConfirm starting, authLoaded:', authLoaded, 'userId:', userId);

    // Wait for auth to be ready
    if (!authLoaded) {
      devLog('Waiting for auth to load...');
      return;
    }

    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const paymentIntentId = params.get('payment_intent');
    // Paystack appends reference & trxref to callback URL
    const paystackReference = params.get('reference') || params.get('trxref');
    const redirectStatus = params.get('redirect_status');
    const purchaseParam = params.get('purchase');
    const providerParam = params.get('provider');

    // Determine which reference to use
    const isPaystack = providerParam === 'paystack' || (!paymentIntentId && paystackReference);
    const referenceId = isPaystack ? (paystackReference || paymentIntentId) : paymentIntentId;

    devLog('URL params:', { purchase: purchaseParam, sessionId, paymentIntentId, paystackReference, referenceId, isPaystack, url: window.location.href });

    // Check if this is a purchase success return
    if (purchaseParam === 'success' && (sessionId || referenceId)) {
      // Check if already processed to avoid duplicates
      const idToProcess = sessionId || referenceId;
      const storageKey = `purchase-${idToProcess}`;
      if (sessionStorage.getItem(storageKey)) {
        devLog('Session already processed:', idToProcess);
        setStatus('done');
        setMessage('Purchase already confirmed');
        return;
      }

      devLog('Processing purchase session:', idToProcess);
      setStatus('checking');
      setMessage('Finalizing your purchase...');

      // Call the API to process the session
      // For Paystack, include the reference param; for Stripe, use payment_intent
      const apiEndpoint = sessionId
        ? `/api/checkout/confirm?session_id=${sessionId}`
        : isPaystack
          ? `/api/checkout/embedded/confirm?reference=${referenceId}&provider=paystack`
          : `/api/checkout/embedded/confirm?payment_intent=${referenceId}&redirect_status=${redirectStatus}`;

      fetch(apiEndpoint)
        .then(async (response) => {
          const data = await response.json();
          devLog('API response:', { ok: response.ok, data });

          if (!response.ok) {
            throw new Error(data.error || 'Failed to process purchase');
          }

          // Mark as processed
          sessionStorage.setItem(storageKey, 'true');

          // Show appropriate success message
          let successMessage = '';
          if (data.topup && data.active) {
            const tokensText = data.tokensAdded ? ` ${data.tokensAdded} tokens added to your account.` : '';
            successMessage = `💎 Token top-up successful! ${data.purchasedPlan} purchased.${tokensText} Your ${data.plan} subscription remains active.`;
          } else if (data.topup && data.pending) {
            successMessage = `⏳ Processing your ${data.purchasedPlan} token top-up. Your ${data.plan} subscription remains active.`;
          } else if (data.pending) {
            successMessage = `✨ ${data.plan} subscription pending! It will automatically activate when your current plan expires.`;
          } else if (data.active) {
            successMessage = `🎉 Pro activated: ${data.plan || 'Pro'}! You now have full access to all features.`;
          } else if (data.already) {
            successMessage = `✅ Payment confirmed for ${data.plan}. Your subscription time has been extended.`;
          } else {
            successMessage = `✅ Pro activated: ${data.plan || 'your subscription'}`;
          }

          setMessage(successMessage);
          setStatus('done');

          // Clean up URL after a delay
          setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('purchase');
            url.searchParams.delete('session_id');
            url.searchParams.delete('payment_intent');
            url.searchParams.delete('redirect_status');
            url.searchParams.delete('provider');
            // Paystack params
            url.searchParams.delete('reference');
            url.searchParams.delete('trxref');
            window.history.replaceState({}, '', url.toString());
            window.dispatchEvent(new CustomEvent('subscription:updated'));
          }, 3000);
        })
        .catch((error) => {
          devLog('Purchase processing error:', error);
          const e = toError(error);
          setMessage(`Error: ${e.message}`);
          setStatus('error');
        });
    } else if (purchaseParam === 'success') {
      // Some providers (e.g. hosted MoR checkouts) cannot redirect back with a session id.
      // Fall back to a short poll that checks for a newly-active subscription.
      devLog('Purchase success without session ID; using recent subscription poll');

      setStatus('checking');
      setMessage('Finalizing your purchase...');

      const storageKey = `purchase-recent-${Date.now()}`;
      if (sessionStorage.getItem(storageKey)) {
        setStatus('done');
        setMessage('Purchase already confirmed');
        return;
      }

      fetch('/api/checkout/confirm?recent=1')
        .then(async (response) => {
          const data = await response.json();
          devLog('Recent confirm response:', { ok: response.ok, data });

          if (!response.ok) {
            throw new Error(data.error || 'Failed to confirm purchase');
          }

          sessionStorage.setItem(storageKey, 'true');

          if (data.active) {
            setMessage(`🎉 Pro activated: ${data.plan || 'Pro'}! You now have full access to all features.`);
            setStatus('done');
          } else {
            setMessage('Purchase received. Your subscription may take a moment to activate.');
            setStatus('done');
          }

          setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('purchase');
            window.history.replaceState({}, '', url.toString());
            window.dispatchEvent(new CustomEvent('subscription:updated'));
          }, 3000);
        })
        .catch((error) => {
          devLog('Recent confirm error:', error);
          const e = toError(error);
          setMessage(`Error: ${e.message}`);
          setStatus('error');
        });
    }
    // If no purchase params, component stays idle (invisible)

    // mounted and authLoaded are intentional guards; avoid pulling in devLog or userId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, authLoaded]);

  // Only show component if there's something to display
  if (status === 'idle') return null;

  const containerClass = status === 'error'
    ? 'border border-red-500/60 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-100'
    : 'border border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-100';

  return (
    <div className={`rounded p-3 text-sm shadow-sm ${containerClass}`}>
      {status === 'checking' && (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          {message}
        </div>
      )}
      {(status === 'done' || status === 'error') && message}
    </div>
  );
}
