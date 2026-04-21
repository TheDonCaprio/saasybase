'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { betterAuthClient } from '@/lib/better-auth-client';

import type {
  AuthClientActiveSession,
  AuthClientUser,
  UseAuthInstanceReturn,
  UseAuthSessionReturn,
  UseAuthUserReturn,
} from '../../types';

type BetterAuthSession = NonNullable<ReturnType<typeof betterAuthClient.useSession>['data']>;

type ActiveOrgState = {
  activeOrgId: string | null;
  initialized: boolean;
  loading: boolean;
};

let activeOrgState: ActiveOrgState = {
  activeOrgId: null,
  initialized: false,
  loading: false,
};

const listeners = new Set<() => void>();

function subscribeActiveOrg(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitActiveOrgChange() {
  listeners.forEach((listener) => listener());
}

function getActiveOrgSnapshot(): string | null {
  return activeOrgState.activeOrgId;
}

function getServerActiveOrgSnapshot(): string | null {
  return null;
}

async function refreshActiveOrgFromServer(): Promise<void> {
  if (activeOrgState.loading) {
    return;
  }

  activeOrgState = { ...activeOrgState, loading: true };

  try {
    const response = await fetch('/api/user/active-org', { cache: 'no-store' });
    if (!response.ok) {
      activeOrgState = { activeOrgId: null, initialized: true, loading: false };
      emitActiveOrgChange();
      return;
    }

    const data = (await response.json()) as { activeOrgId?: string | null };
    activeOrgState = {
      activeOrgId: typeof data.activeOrgId === 'string' ? data.activeOrgId : null,
      initialized: true,
      loading: false,
    };
    emitActiveOrgChange();
  } catch {
    activeOrgState = { ...activeOrgState, initialized: true, loading: false };
    emitActiveOrgChange();
  }
}

export function notifyActiveOrgChanged(activeOrgId?: string | null) {
  if (typeof activeOrgId !== 'undefined') {
    activeOrgState = {
      activeOrgId,
      initialized: true,
      loading: false,
    };
    emitActiveOrgChange();
    return;
  }

  void refreshActiveOrgFromServer();
}

export function useActiveOrgId(enabled = true): string | null {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!activeOrgState.initialized && !activeOrgState.loading) {
      void refreshActiveOrgFromServer();
    }
  }, [enabled]);

  return useSyncExternalStore(subscribeActiveOrg, getActiveOrgSnapshot, getServerActiveOrgSnapshot);
}

function toClientUser(session: BetterAuthSession | null): AuthClientUser | null {
  if (!session?.user) {
    return null;
  }

  const name = session.user.name ?? null;
  const nameParts = name?.trim().split(/\s+/) ?? [];
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.slice(1).join(' ') || null;
  const email = session.user.email ?? null;
  const emailAddresses = email ? [{ emailAddress: email }] : [];
  const primaryEmailAddress = emailAddresses[0] ?? null;

  return {
    id: session.user.id,
    firstName,
    lastName,
    fullName: name,
    imageUrl: session.user.image ?? null,
    emailAddresses,
    primaryEmailAddress,
    getSessions: async (): Promise<AuthClientActiveSession[]> => {
      try {
        const response = await fetch('/api/user/sessions', { cache: 'no-store' });
        if (!response.ok) {
          return [];
        }

        return (await response.json()) as AuthClientActiveSession[];
      } catch {
        return [];
      }
    },
    update: async (data: { firstName?: string; lastName?: string }): Promise<void> => {
      const nextName = [data.firstName ?? firstName, data.lastName ?? lastName]
        .filter(Boolean)
        .join(' ')
        .trim();

      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });
    },
    delete: async (): Promise<void> => {
      await fetch('/api/user/delete-account', { method: 'DELETE' });
      await betterAuthClient.signOut();
      window.location.href = '/';
    },
  };
}

export function useAuthUser(): UseAuthUserReturn {
  const { data, isPending } = betterAuthClient.useSession();

  const user = useMemo(() => toClientUser(data ?? null), [data]);
  const isLoaded = !isPending;
  const isSignedIn = isPending ? undefined : Boolean(data?.user?.id);

  return { isSignedIn, isLoaded, user };
}

export function useAuthSession(): UseAuthSessionReturn {
  const { data, isPending } = betterAuthClient.useSession();
  const hasValidSession = Boolean(data?.session?.id && data?.user?.id);
  const activeOrgId = useActiveOrgId(hasValidSession);

  useEffect(() => {
    const sessionOrgId = data?.session?.activeOrganizationId ?? null;
    if (hasValidSession && sessionOrgId !== activeOrgState.activeOrgId) {
      notifyActiveOrgChanged(sessionOrgId);
      return;
    }

    if (!hasValidSession && !isPending && (activeOrgState.activeOrgId !== null || activeOrgState.initialized)) {
      activeOrgState = { activeOrgId: null, initialized: true, loading: false };
      emitActiveOrgChange();
    }
  }, [data?.session?.activeOrganizationId, hasValidSession, isPending]);

  return useMemo(() => ({
    orgId: activeOrgId,
    sessionId: data?.session?.id ?? null,
    isLoaded: !isPending,
    isSignedIn: isPending ? undefined : hasValidSession,
    userId: data?.user?.id ?? null,
  }), [activeOrgId, data?.session?.id, data?.user?.id, hasValidSession, isPending]);
}

export function useAuthInstance(): UseAuthInstanceReturn {
  const signOut = useCallback(async (opts?: { redirectUrl?: string }) => {
    await betterAuthClient.signOut();
    window.location.href = opts?.redirectUrl ?? '/';
  }, []);

  const openUserProfile = useCallback(() => {
    window.location.href = '/dashboard/profile';
  }, []);

  const setActiveOrganization = useCallback(async (orgId: string | null) => {
    const response = await fetch('/api/user/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });

    if (!response.ok) {
      throw new Error('Failed to set active organization');
    }

    let nextActiveOrgId = orgId;
    try {
      const data = (await response.json()) as { activeOrgId?: string | null };
      nextActiveOrgId = typeof data.activeOrgId === 'string' ? data.activeOrgId : null;
    } catch {
      nextActiveOrgId = orgId;
    }

    notifyActiveOrgChanged(nextActiveOrgId);
  }, []);

  return useMemo(() => ({
    signOut,
    openUserProfile,
    setActiveOrganization,
  }), [openUserProfile, setActiveOrganization, signOut]);
}