'use client';

import Script from 'next/script';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    // Paddle.js v2 attaches itself to window.Paddle
    Paddle?: {
      Initialize?: (opts: Record<string, unknown>) => void;
      Environment?: {
        set?: (env: string) => void;
      };
      Checkout?: {
        open?: (opts: Record<string, unknown>) => void;
      };
    };
  }
}

export default function PaddlePayClient() {
  const params = useSearchParams();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const initializedRef = useRef(false);

  const transactionId = useMemo(() => {
    const raw = params.get('_ptxn');
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }, [params]);

  const publicToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const publicEnv = (process.env.NEXT_PUBLIC_PADDLE_ENV || '').toLowerCase();
  const tokenImpliesSandbox = typeof publicToken === 'string' && publicToken.startsWith('test_');
  const isSandbox = publicEnv === 'sandbox' || process.env.NEXT_PUBLIC_PADDLE_SANDBOX === '1' || tokenImpliesSandbox;

  useEffect(() => {
    if (!scriptLoaded) return;
    if (!window.Paddle?.Initialize) return;
    if (!publicToken) return;
    if (initializedRef.current) return;

    // Paddle.js defaults to live unless you explicitly set sandbox.
    // If you use a sandbox token against live endpoints (or vice-versa), checkout fails to retrieve a JWT.
    if (window.Paddle?.Environment?.set) {
      window.Paddle.Environment.set(isSandbox ? 'sandbox' : 'live');
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const successUrl = origin ? `${origin}/dashboard?purchase=success` : undefined;

    // Paddle docs: checkout auto-opens when _ptxn is present.
    // Initialize is still required so Paddle.js knows your token/environment.
    // Paddle.js environment is determined by the token/account (sandbox vs live).
    window.Paddle.Initialize({
      token: publicToken,
      checkout: {
        settings: {
          ...(successUrl ? { successUrl } : {}),
        },
      },
      eventCallback: (evt: unknown) => {
        // Helpful diagnostics for "Something went wrong" overlay.
        // (The overlay is often triggered by domain approval/token mismatch.)
        // eslint-disable-next-line no-console
        console.log('[Paddle event]', evt);
      },
    });

    initializedRef.current = true;
  }, [scriptLoaded, publicToken, isSandbox]);

  const isValidTransactionId = typeof transactionId === 'string' && transactionId.startsWith('txn_');

  // Minimal UX: this page exists primarily for Paddle to redirect to.
  // Paddle.js will open checkout automatically when _ptxn is present.
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      {!transactionId ? (
        <div className="text-center py-10">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm opacity-70">
            We couldn&apos;t find your checkout session. Please try again or contact support if this persists.
          </p>
        </div>
      ) : !isValidTransactionId ? (
        <div className="text-center py-10">
          <h1 className="text-xl font-semibold">Invalid checkout session</h1>
          <p className="mt-2 text-sm opacity-70">
            This checkout link appears to be invalid. Please go back and try again.
          </p>
        </div>
      ) : !publicToken ? (
        <div className="text-center py-10">
          <h1 className="text-xl font-semibold">Payments unavailable</h1>
          <p className="mt-2 text-sm opacity-70">
            The payment system is currently unavailable. Please contact support.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
          <svg
            className="h-10 w-10 animate-spin text-blue-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <h1 className="text-xl font-semibold">Preparing your checkout…</h1>
          <p className="text-sm opacity-70">
            Please wait while we set up your payment. This should only take a moment.
          </p>
        </div>
      )}
    </main>
  );
}
