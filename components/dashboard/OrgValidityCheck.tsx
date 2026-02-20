'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function OrgValidityCheck() {
    const router = useRouter();

    useEffect(() => {
        // Only run on authenticated app areas; avoid running on auth pages
        // like /sign-in where a reload would look like a redirect loop.
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const isAppArea = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
        if (!isAppArea) return;

        // Only run the check if Clerk is enabled (user could be signed in)
        const clerkEnabled = typeof window !== 'undefined' && (window as Window & { __CLERK_ENABLED?: boolean }).__CLERK_ENABLED;
        if (!clerkEnabled) return;

        const start = Date.now();
        const MAX_WAIT_MS = 5000;
        const POLL_MS = 250;
        let cancelled = false;

        const checkValidity = async () => {
            try {
                // Only call the endpoint when we have a real signed-in Clerk user.
                // This avoids unauthenticated requests (and noisy logs) on public pages.
                const clerkUserId = (window as unknown as { Clerk?: { user?: { id?: string } } })?.Clerk?.user?.id;
                if (!clerkUserId) {
                    if (!cancelled && Date.now() - start < MAX_WAIT_MS) {
                        window.setTimeout(checkValidity, POLL_MS);
                    }
                    return;
                }

                const res = await fetch('/api/user/validate-org-access', {
                    method: 'POST',
                });

                if (!res.ok) return;

                const data = await res.json();

                // If valid is explicitly false, it means the org was dismantled
                if (data.valid === false) {
                    // Avoid reload loops in case the backend keeps reporting invalid.
                    // Use a short cooldown stored in sessionStorage.
                    const RELOAD_KEY = 'org-validity:reloaded-at';
                    const COOLDOWN_MS = 15000;
                    try {
                        const last = sessionStorage.getItem(RELOAD_KEY);
                        const lastNum = last ? Number.parseInt(last, 10) : 0;
                        if (Number.isFinite(lastNum) && lastNum > 0 && Date.now() - lastNum < COOLDOWN_MS) {
                            return;
                        }
                        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
                    } catch {
                        // ignore storage errors; proceed with a single reload attempt
                    }

                    if (document.visibilityState === 'visible') {
                        router.refresh();
                    }
                }
            } catch (err) {
                // Silent fail - don't disrupt user experience if check fails
                console.error('Org validity check failed', err);
            }
        };

        // Run check on mount
        checkValidity();

        return () => {
            cancelled = true;
        };
    }, [router]);

    return null; // This component renders nothing
}
