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
        <div>
          <h1 className="text-xl font-semibold">Missing transaction</h1>
          <p className="mt-2 text-sm opacity-80">
            This page is intended to be opened by Paddle with a <code>_ptxn</code> query parameter.
          </p>
        </div>
      ) : !isValidTransactionId ? (
        <div>
          <h1 className="text-xl font-semibold">Invalid transaction</h1>
          <p className="mt-2 text-sm opacity-80">
            Expected <code>_ptxn</code> to be a Paddle transaction ID starting with <code>txn_</code>.
          </p>
          <p className="mt-2 text-sm opacity-80">
            Received: <code>{transactionId}</code>
          </p>
        </div>
      ) : !publicToken ? (
        <div>
          <h1 className="text-xl font-semibold">Paddle is not configured</h1>
          <p className="mt-2 text-sm opacity-80">
            Set <code>NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code> (and optionally <code>NEXT_PUBLIC_PADDLE_ENV</code>) to enable Paddle.js.
          </p>
          <p className="mt-2 text-sm opacity-80">
            Transaction: <code>{transactionId}</code>
          </p>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-semibold">Opening checkout…</h1>
          <p className="mt-2 text-sm opacity-80">
            If checkout doesn’t open, ensure this domain is approved in Paddle and that this URL is set as your Default payment link.
          </p>
        </div>
      )}
    </main>
  );
}
