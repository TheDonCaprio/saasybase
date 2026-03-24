'use client';

/**
 * NextAuth – Client-Side Hooks
 * ===============================
 * Wraps next-auth/react hooks to return the same shape as the Clerk
 * adapters so consumer components work identically with either provider.
 */

import { useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';

import type {
  AuthClientUser,
  AuthClientActiveSession,
  UseAuthUserReturn,
  UseAuthSessionReturn,
  UseAuthInstanceReturn,
} from '../../types';

// ---------------------------------------------------------------------------
// API-backed active org store — keeps the client synced with the server-side cookie
// ---------------------------------------------------------------------------

type ActiveOrgState = {
  activeOrgId: string | null;
  initialized: boolean;
  loading: boolean;
};

let _activeOrgState: ActiveOrgState = {
  activeOrgId: null,
  initialized: false,
  loading: false,
};
const _listeners = new Set<() => void>();

function subscribeActiveOrg(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function emitActiveOrgChange() {
  _listeners.forEach((cb) => cb());
}

function getActiveOrgSnapshot(): string | null {
  return _activeOrgState.activeOrgId;
}

function getServerActiveOrgSnapshot(): string | null {
  return null;
}

async function refreshActiveOrgFromServer(): Promise<void> {
  if (_activeOrgState.loading) return;

  _activeOrgState = { ..._activeOrgState, loading: true };

  try {
    const res = await fetch('/api/user/active-org', { cache: 'no-store' });
    if (!res.ok) {
      _activeOrgState = { activeOrgId: null, initialized: true, loading: false };
      emitActiveOrgChange();
      return;
    }

    const data = await res.json() as { activeOrgId?: string | null };
    _activeOrgState = {
      activeOrgId: typeof data.activeOrgId === 'string' ? data.activeOrgId : null,
      initialized: true,
      loading: false,
    };
    emitActiveOrgChange();
  } catch {
    _activeOrgState = { ..._activeOrgState, initialized: true, loading: false };
    emitActiveOrgChange();
  }
}

export function notifyActiveOrgChanged(activeOrgId?: string | null) {
  if (typeof activeOrgId !== 'undefined') {
    _activeOrgState = {
      activeOrgId,
      initialized: true,
      loading: false,
    };
    emitActiveOrgChange();
    return;
  }

  void refreshActiveOrgFromServer();
}

/**
 * Hook that returns the current active org ID from the server-backed store.
 */
export function useActiveOrgId(enabled = true): string | null {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!_activeOrgState.initialized && !_activeOrgState.loading) {
      void refreshActiveOrgFromServer();
    }
  }, [enabled]);

  return useSyncExternalStore(subscribeActiveOrg, getActiveOrgSnapshot, getServerActiveOrgSnapshot);
}

// ---------------------------------------------------------------------------
// useAuthUser — wraps useSession()
// ---------------------------------------------------------------------------

export function useAuthUser(): UseAuthUserReturn {
  const { data: session, status } = useSession();
  const sessionUserId = typeof session?.user?.id === 'string' && session.user.id.length > 0
    ? session.user.id
    : null;
  const isLoaded = status !== 'loading';
  const isSignedIn = status === 'loading'
    ? undefined
    : status === 'authenticated' && sessionUserId
      ? true
      : false;

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
  }, [session]);

  return { isSignedIn, isLoaded, user };
}

// ---------------------------------------------------------------------------
// useAuthSession — wraps useSession()
// ---------------------------------------------------------------------------

export function useAuthSession(): UseAuthSessionReturn {
  const { data: session, status } = useSession();
  const sessionUserId = typeof session?.user?.id === 'string' && session.user.id.length > 0
    ? session.user.id
    : null;
  const hasValidSession = status === 'authenticated' && Boolean(sessionUserId);
  const activeOrgId = useActiveOrgId(hasValidSession);

  useEffect(() => {
    if (hasValidSession && !_activeOrgState.initialized && !_activeOrgState.loading) {
      void refreshActiveOrgFromServer();
      return;
    }

    if (!hasValidSession && status !== 'loading' && (_activeOrgState.activeOrgId !== null || _activeOrgState.initialized)) {
      _activeOrgState = { activeOrgId: null, initialized: true, loading: false };
      emitActiveOrgChange();
    }
  }, [hasValidSession, status]);

  return useMemo(() => ({
    orgId: activeOrgId,
    sessionId: null,
    isLoaded: status !== 'loading',
    isSignedIn: status === 'loading' ? undefined : hasValidSession,
    userId: sessionUserId,
  }), [sessionUserId, status, activeOrgId, hasValidSession]);
}

// ---------------------------------------------------------------------------
// useAuthInstance — provides signOut() and openUserProfile()
// ---------------------------------------------------------------------------

export function useAuthInstance(): UseAuthInstanceReturn {
  const doSignOut = useCallback(async (opts?: { redirectUrl?: string }) => {
    await nextAuthSignOut({ redirectTo: opts?.redirectUrl ?? '/' });
  }, []);

  const doOpenProfile = useCallback(() => {
    // NextAuth has no built-in profile modal. Redirect to profile page.
    window.location.href = '/dashboard/profile';
  }, []);

  const doSetActiveOrganization = useCallback(async (orgId: string | null) => {
    const res = await fetch('/api/user/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });

    if (!res.ok) {
      throw new Error('Failed to set active organization');
    }

    let nextActiveOrgId: string | null = orgId;
    try {
      const data = await res.json() as { activeOrgId?: string | null };
      nextActiveOrgId = typeof data.activeOrgId === 'string' ? data.activeOrgId : null;
    } catch {
      nextActiveOrgId = orgId;
    }

    notifyActiveOrgChanged(nextActiveOrgId);
  }, []);

  return useMemo(() => ({
    signOut: doSignOut,
    openUserProfile: doOpenProfile,
    setActiveOrganization: doSetActiveOrganization,
  }), [doOpenProfile, doSetActiveOrganization, doSignOut]);
}
