'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { refreshVisibleRoute } from '@/lib/client-route-revalidation';
import { useAuthInstance, useAuthSession } from '@/lib/auth-provider/client';
import { showToast } from '../ui/Toast';

const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'clerk';
const IS_CLERK = AUTH_PROVIDER === 'clerk';
const RECOVERY_COOLDOWN_MS = 15000;
const RECOVERY_TOAST_KEY = 'org-validity:toast-message';
const RECOVERY_MESSAGE = 'This workspace is no longer available. Switched you back to your personal workspace.';

type OrgValidityResponse = {
    valid?: boolean;
    clearActiveOrg?: boolean;
};

function markRecoveryAttempt(key: string) {
    try {
        const last = sessionStorage.getItem(key);
        const lastNum = last ? Number.parseInt(last, 10) : 0;
        if (Number.isFinite(lastNum) && lastNum > 0 && Date.now() - lastNum < RECOVERY_COOLDOWN_MS) {
            return false;
        }
        sessionStorage.setItem(key, String(Date.now()));
        return true;
    } catch {
        return true;
    }
}

function getMissingOrgMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
        const maybeMessage = 'message' in error ? error.message : undefined;
        if (typeof maybeMessage === 'string') return maybeMessage;
        const maybeReason = 'reason' in error ? error.reason : undefined;
        if (typeof maybeReason === 'string') return maybeReason;
    }
    return '';
}

function isMissingOrganizationError(error: unknown) {
    const message = getMissingOrgMessage(error).toLowerCase();
    return message.includes('given organization not found') || message.includes('organization not found');
}

function queueRecoveryToast(message: string) {
    try {
        sessionStorage.setItem(RECOVERY_TOAST_KEY, message);
    } catch {
        // ignore storage failures
    }
}

function flushRecoveryToast() {
    try {
        const message = sessionStorage.getItem(RECOVERY_TOAST_KEY);
        if (!message) return;
        sessionStorage.removeItem(RECOVERY_TOAST_KEY);
        showToast(message, 'info');
    } catch {
        // ignore storage failures
    }
}

export function OrgValidityCheck() {
    const router = useRouter();
    const { isLoaded, isSignedIn, orgId } = useAuthSession();
    const auth = useAuthInstance();
    const recoveryInFlightRef = useRef(false);

    useEffect(() => {
        flushRecoveryToast();
    }, []);

    useEffect(() => {
        // Only run on authenticated app areas; avoid running on auth pages
        // like /sign-in where a reload would look like a redirect loop.
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const isAppArea = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
        if (!isAppArea || !isLoaded || !isSignedIn) return;
        const initialPathname = pathname;

        const start = Date.now();
        const MAX_WAIT_MS = 5000;
        const POLL_MS = 250;
        let cancelled = false;

        const clearStaleActiveOrg = async () => {
            if (!orgId || recoveryInFlightRef.current) {
                return false;
            }

            if (!markRecoveryAttempt('org-validity:clear-active-org-at')) {
                return false;
            }

            recoveryInFlightRef.current = true;
            try {
                queueRecoveryToast(RECOVERY_MESSAGE);
                await auth.setActiveOrganization(null);
                const refreshed = refreshVisibleRoute(router, 'org-validity', initialPathname);
                window.setTimeout(() => {
                    if (refreshed) {
                        flushRecoveryToast();
                    }
                }, 0);
                return true;
            } catch (err) {
                try {
                    sessionStorage.removeItem(RECOVERY_TOAST_KEY);
                } catch {
                    // ignore storage failures
                }
                console.error('Org validity recovery failed', err);
                return false;
            } finally {
                recoveryInFlightRef.current = false;
            }
        };

        const checkValidity = async () => {
            try {
                if (!orgId && IS_CLERK) {
                    const clerkUserId = (window as unknown as { Clerk?: { user?: { id?: string } } })?.Clerk?.user?.id;
                    if (!clerkUserId) {
                        if (!cancelled && Date.now() - start < MAX_WAIT_MS) {
                            window.setTimeout(checkValidity, POLL_MS);
                        }
                        return;
                    }
                }

                const res = await fetch('/api/user/validate-org-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activeOrgId: orgId ?? null }),
                });

                if (!res.ok) return;

                const data = await res.json() as OrgValidityResponse;
                const clearedActiveOrg = data.clearActiveOrg ? await clearStaleActiveOrg() : false;

                // If valid is explicitly false, it means the org was dismantled
                if (data.valid === false || clearedActiveOrg) {
                    // Avoid reload loops in case the backend keeps reporting invalid.
                    // Use a short cooldown stored in sessionStorage.
                    const RELOAD_KEY = 'org-validity:reloaded-at';
                    if (!markRecoveryAttempt(RELOAD_KEY)) {
                        return;
                    }

                    refreshVisibleRoute(router, 'org-validity', initialPathname);
                }
            } catch (err) {
                // Silent fail - don't disrupt user experience if check fails
                console.error('Org validity check failed', err);
            }
        };

        const recoverFromClerkMissingOrg = async () => {
            if (!IS_CLERK || !orgId) {
                return;
            }

            await clearStaleActiveOrg();
        };

        const handleWindowError = (event: ErrorEvent) => {
            if (!IS_CLERK || !isMissingOrganizationError(event.error ?? event.message)) {
                return;
            }

            event.preventDefault();
            void recoverFromClerkMissingOrg();
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (!IS_CLERK || !isMissingOrganizationError(event.reason)) {
                return;
            }

            event.preventDefault();
            void recoverFromClerkMissingOrg();
        };

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        // Run check on mount
        void checkValidity();

        return () => {
            cancelled = true;
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [auth, isLoaded, isSignedIn, orgId, router]);

    return null; // This component renders nothing
}
