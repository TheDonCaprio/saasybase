'use client';

/**
 * NextAuth – Client-Side Hooks
 * ===============================
 * Wraps next-auth/react hooks to return the same shape as the Clerk
 * adapters so consumer components work identically with either provider.
 */

import { useMemo, useCallback, useSyncExternalStore } from 'react';
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';

import type {
  AuthClientUser,
  AuthClientActiveSession,
  UseAuthUserReturn,
  UseAuthSessionReturn,
  UseAuthInstanceReturn,
} from '../../types';

// ---------------------------------------------------------------------------
// Cookie helpers — read the active org cookie from document.cookie
// ---------------------------------------------------------------------------

const ACTIVE_ORG_COOKIE = 'saasybase-active-org';

function getActiveOrgFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|;\\s*)' + ACTIVE_ORG_COOKIE + '=([^;]*)')
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * A tiny external store for the active-org cookie so React can
 * subscribe to changes (triggered after the API call + page reload).
 */
let _cachedOrgId: string | null = null;
const _listeners = new Set<() => void>();

function subscribeActiveOrg(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function getActiveOrgSnapshot(): string | null {
  const v = getActiveOrgFromCookie();
  if (v !== _cachedOrgId) {
    _cachedOrgId = v;
  }
  return _cachedOrgId;
}

function getServerActiveOrgSnapshot(): string | null {
  return null; // SSR — cookie not available
}

/** Call this after switching the active org to notify subscribers. */
export function notifyActiveOrgChanged() {
  _cachedOrgId = getActiveOrgFromCookie();
  _listeners.forEach((cb) => cb());
}

/**
 * Hook that returns the current active org ID from the cookie.
 * Uses useSyncExternalStore so it reacts to changes.
 */
export function useActiveOrgId(): string | null {
  return useSyncExternalStore(subscribeActiveOrg, getActiveOrgSnapshot, getServerActiveOrgSnapshot);
}

// ---------------------------------------------------------------------------
// useAuthUser — wraps useSession()
// ---------------------------------------------------------------------------

export function useAuthUser(): UseAuthUserReturn {
  const { data: session, status } = useSession();
  const isLoaded = status !== 'loading';
  const isSignedIn = status === 'authenticated' ? true : status === 'unauthenticated' ? false : undefined;

  const user: AuthClientUser | null = useMemo(() => {
    if (!session?.user) return null;

    const { user: su } = session;
    const name = su.name ?? null;
    const nameParts = name?.split(' ') ?? [];
    const firstName = nameParts[0] ?? null;
    const lastName = nameParts.slice(1).join(' ') || null;
    const email = su.email ?? null;

    const emailAddresses = email ? [{ emailAddress: email }] : [];
    const primaryEmailAddress = emailAddresses[0] ?? null;

    return {
      id: su.id ?? '',
      firstName,
      lastName,
      fullName: name,
      imageUrl: su.image ?? null,
      emailAddresses,
      primaryEmailAddress,

      getSessions: async (): Promise<AuthClientActiveSession[]> => {
        // Fetch sessions from our API since NextAuth doesn't expose them client-side
        try {
          const res = await fetch('/api/user/sessions');
          if (!res.ok) return [];
          return (await res.json()) as AuthClientActiveSession[];
        } catch {
          return [];
        }
      },

      update: async (data: { firstName?: string; lastName?: string }): Promise<void> => {
        const newName = [data.firstName ?? firstName, data.lastName ?? lastName]
          .filter(Boolean)
          .join(' ');
        await fetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
      },

      delete: async (): Promise<void> => {
        await fetch('/api/user/delete-account', { method: 'DELETE' });
        await nextAuthSignOut({ redirectTo: '/' });
      },
    };
  }, [session, session?.user?.name, session?.user?.email, session?.user?.image]);

  return { isSignedIn, isLoaded, user };
}

// ---------------------------------------------------------------------------
// useAuthSession — wraps useSession()
// ---------------------------------------------------------------------------

export function useAuthSession(): UseAuthSessionReturn {
  const { data: session, status } = useSession();
  const activeOrgId = useActiveOrgId();

  return useMemo(() => ({
    orgId: activeOrgId,
    sessionId: null,
    isLoaded: status !== 'loading',
    isSignedIn: status === 'authenticated' ? true : status === 'unauthenticated' ? false : undefined,
    userId: session?.user?.id ?? null,
  }), [session?.user?.id, status, activeOrgId]);
}

// ---------------------------------------------------------------------------
// useAuthInstance — provides signOut() and openUserProfile()
// ---------------------------------------------------------------------------

export function useAuthInstance(): UseAuthInstanceReturn {
  const doSignOut = useCallback(async (opts?: { redirectUrl?: string }) => {
    await nextAuthSignOut({ redirectTo: opts?.redirectUrl ?? '/' });
  }, []);

  const doOpenProfile = useCallback((_opts?: { appearance?: Record<string, unknown> }) => {
    // NextAuth has no built-in profile modal. Redirect to profile page.
    window.location.href = '/dashboard/profile';
  }, []);

  return useMemo(() => ({
    signOut: doSignOut,
    openUserProfile: doOpenProfile,
  }), [doSignOut, doOpenProfile]);
}
