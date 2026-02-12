'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { showToast } from '../ui/Toast';

type PurchaseTone = 'success' | 'warning' | 'error';

type PurchaseMessage = {
  title: string;
  body: string;
  tone: PurchaseTone;
};

type PaymentLookup = {
  planName: string | null;
  tokenLimit: number | null;
  tokenName: string | null;
};

const buildToastMessage = (message: PurchaseMessage) => {
  return message.title ? `${message.title} ${message.body}`.trim() : message.body;
};

const stripPurchaseParams = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  ['purchase', 'payment_id', 'provider', 'status', 'since', 'plan'].forEach((key) => {
    next.delete(key);
  });
  return next;
};

export function PurchaseNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<PurchaseMessage | null>(null);
  const hasShownRef = useRef(false);

  const purchase = (params?.get('purchase') || '').toLowerCase();
  const status = (params?.get('status') || '').toLowerCase();
  const provider = (params?.get('provider') || '').toLowerCase();
  const paymentId = params?.get('payment_id') || null;

  const isSuccess = purchase === 'success' || status === 'success' || status === 'paid' || status === 'completed';
  const isCancelled = purchase === 'cancelled' || purchase === 'canceled' || status === 'cancelled' || status === 'canceled';
  const isFailure = purchase === 'failed' || status === 'failed' || status === 'error';

  const shouldShow = Boolean(purchase || status);

  const baseMessage = useMemo<PurchaseMessage | null>(() => {
    if (!shouldShow) return null;
    if (isSuccess) {
      return {
        title: 'Payment confirmed.',
        body: 'Your account is updating now.',
        tone: 'success',
      };
    }
    if (isCancelled) {
      return {
        title: 'Payment cancelled.',
        body: 'No charges were made.',
        tone: 'warning',
      };
    }
    if (isFailure) {
      return {
        title: 'Payment failed.',
        body: 'Please try again or contact support.',
        tone: 'error',
      };
    }
    return {
      title: 'Payment update.',
      body: 'Check your dashboard for the latest status.',
      tone: 'warning',
    };
  }, [shouldShow, isSuccess, isCancelled, isFailure]);

  useEffect(() => {
    if (!baseMessage || !shouldShow) return;

    let cancelled = false;
    const resolveMessage = async () => {
      if (!isSuccess || !paymentId) {
        if (!cancelled) setMessage(baseMessage);
        return;
      }

      try {
        const res = await fetch(`/api/dashboard/payments?search=${encodeURIComponent(paymentId)}&limit=1&count=false`);
        const data = await res.json().catch(() => null) as { payments?: Array<Record<string, unknown>> } | null;
        const payment = Array.isArray(data?.payments) && data?.payments.length > 0 ? data?.payments[0] : null;
        const plan = payment && typeof payment === 'object' ? (payment as { plan?: Record<string, unknown> }).plan : null;
        const lookup: PaymentLookup = {
          planName: plan && typeof plan.name === 'string' ? plan.name : null,
          tokenLimit: plan && typeof plan.tokenLimit === 'number' ? plan.tokenLimit : null,
          tokenName: plan && typeof plan.tokenName === 'string' ? plan.tokenName : null,
        };

        if (cancelled) return;

        const tokenLabel = lookup.tokenName || 'tokens';
        const tokenInfo = typeof lookup.tokenLimit === 'number'
          ? `${lookup.tokenLimit.toLocaleString()} ${tokenLabel}`
          : 'your tokens';
        const planInfo = lookup.planName ? ` for the ${lookup.planName} plan` : '';
        const providerInfo = provider ? ` Paid via ${provider}.` : '';

        setMessage({
          title: 'Payment confirmed.',
          body: `All set! We added ${tokenInfo} to your account${planInfo}.${providerInfo}`.trim(),
          tone: 'success',
        });
      } catch {
        if (!cancelled) setMessage(baseMessage);
      }
    };

    void resolveMessage();

    return () => {
      cancelled = true;
    };
  }, [baseMessage, isSuccess, paymentId, provider, shouldShow]);

  useEffect(() => {
    if (!message || hasShownRef.current) return;
    hasShownRef.current = true;
    const toastText = buildToastMessage(message);
    const toastType = message.tone === 'success' ? 'success' : message.tone === 'error' ? 'error' : 'info';
    showToast(toastText, toastType);

    const nextParams = stripPurchaseParams(new URLSearchParams(params?.toString() || ''));
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl);
  }, [message, params, pathname, router]);

  if (!message) return null;

  const toneClasses = message.tone === 'success'
    ? 'border-emerald-300/70 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100'
    : message.tone === 'error'
      ? 'border-rose-300/70 bg-rose-50/80 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100'
      : 'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100';

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm mb-4 ${toneClasses}`}>
      <span className="font-semibold">{message.title}</span> {message.body}
    </div>
  );
}
