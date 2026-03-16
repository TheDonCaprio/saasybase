'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { refreshVisibleRoute } from '@/lib/client-route-revalidation';

const LAST_RUN_KEY = 'user:expiry-cleanup:last-run-at';
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function TokenExpiryCleanupPing() {
  const router = useRouter();

  useEffect(() => {
    // Only run on authenticated app areas; avoid running on auth pages
    // like /sign-in where a reload would look like a redirect loop.
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isAppArea = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
    if (!isAppArea) return;
    const initialPathname = pathname;

    // Only run the check if Clerk is enabled (user could be signed in)
    const clerkEnabled = typeof window !== 'undefined' && (window as Window & { __CLERK_ENABLED?: boolean }).__CLERK_ENABLED;
    if (!clerkEnabled) return;

    try {
      const lastRunRaw = localStorage.getItem(LAST_RUN_KEY);
      const lastRun = lastRunRaw ? Number.parseInt(lastRunRaw, 10) : 0;
      if (Number.isFinite(lastRun) && lastRun > 0 && Date.now() - lastRun < RUN_INTERVAL_MS) {
        return;
      }
    } catch {
      // Ignore storage failures; proceed with a single attempt.
    }

    const start = Date.now();
    const MAX_WAIT_MS = 5000;
    const POLL_MS = 250;
    let cancelled = false;

    const ping = async () => {
      try {
        const clerkUserId = (window as unknown as { Clerk?: { user?: { id?: string } } })?.Clerk?.user?.id;
        if (!clerkUserId) {
          if (!cancelled && Date.now() - start < MAX_WAIT_MS) {
            window.setTimeout(ping, POLL_MS);
          }
          return;
        }

        // Throttle as soon as we have a signed-in user to avoid repeated requests.
        try {
          localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
        } catch {
          // ignore
        }

        const res = await fetch('/api/user/ping-expiry-cleanup', {
          method: 'POST',
        });

        if (!res.ok) return;

        const data = (await res.json()) as { cleared?: boolean };

        // If tokens were cleared, refresh route data without forcing a full-page reload.
        if (data.cleared === true) {
          refreshVisibleRoute(router, 'token-expiry', initialPathname);
        }
      } catch {
        // Silent fail - don't disrupt user experience if check fails
      }
    };

    ping();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
