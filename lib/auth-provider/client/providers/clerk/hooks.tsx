'use client';

/**
 * Clerk – Client-Side Hooks
 * ===========================
 * Wraps Clerk's React hooks to return the common `AuthClientUser`
 * shape. Consumer components import from the barrel `@/lib/auth-provider/client`
 * which resolves to this file when `AUTH_PROVIDER=clerk`.
 */

import { useMemo } from 'react';
import {
  useUser as useClerkUser,
  useAuth as useClerkAuth,
  useClerk as useClerkInstance,
} from '@clerk/nextjs';

import type {
  AuthClientUser,
  AuthClientActiveSession,
  UseAuthUserReturn,
  UseAuthSessionReturn,
  UseAuthInstanceReturn,
} from '../../types';

// ---------------------------------------------------------------------------
// useAuthUser — wraps useUser()
// ---------------------------------------------------------------------------

export function useAuthUser(): UseAuthUserReturn {
  const { user, isSignedIn, isLoaded } = useClerkUser();

  const wrappedUser: AuthClientUser | null = useMemo(() => {
    if (!user) return null;

    const emailAddresses = (user.emailAddresses ?? []).map((e) => ({
      emailAddress: e.emailAddress,
    }));

    const primaryEmailAddress = user.primaryEmailAddress
      ? { emailAddress: user.primaryEmailAddress.emailAddress }
      : emailAddresses[0] ?? null;

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
      emailAddresses,
      primaryEmailAddress,

      getSessions: async (): Promise<AuthClientActiveSession[]> => {
        const sessions = await user.getSessions();
        return sessions.map((s) => ({
          id: s.id,
          status: s.status,
          lastActiveAt: s.lastActiveAt ? new Date(s.lastActiveAt) : null,
          latestActivity: s.latestActivity
            ? {
                browserName: s.latestActivity.browserName ?? null,
                deviceType: s.latestActivity.deviceType ?? null,
                ipAddress: s.latestActivity.ipAddress ?? null,
                city: s.latestActivity.city ?? null,
                country: s.latestActivity.country ?? null,
                isMobile: s.latestActivity.isMobile ?? false,
              }
            : null,
        }));
      },

      update: async (data: { firstName?: string; lastName?: string }): Promise<void> => {
        await user.update(data);
      },

      delete: async (): Promise<void> => {
        await user.delete();
      },
    };
    // Re-create when user reference changes (Clerk replaces it on mutations)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.firstName, user?.lastName, user?.imageUrl, user?.updatedAt]);

  return { isSignedIn, isLoaded, user: wrappedUser };
}

// ---------------------------------------------------------------------------
// useAuthSession — wraps useAuth()
// ---------------------------------------------------------------------------

export function useAuthSession(): UseAuthSessionReturn {
  const { orgId, sessionId, isLoaded, isSignedIn, userId } = useClerkAuth();
  return { orgId: orgId ?? null, sessionId: sessionId ?? null, isLoaded, isSignedIn, userId: userId ?? null };
}

// ---------------------------------------------------------------------------
// useAuthInstance — wraps useClerk()
// ---------------------------------------------------------------------------

export function useAuthInstance(): UseAuthInstanceReturn {
  const clerk = useClerkInstance();

  return useMemo(() => ({
    signOut: async (opts?: { redirectUrl?: string }) => {
      await clerk.signOut(opts ? { redirectUrl: opts.redirectUrl } : undefined);
    },
    openUserProfile: (opts?: { appearance?: Record<string, unknown> }) => {
      clerk.openUserProfile(opts as Parameters<typeof clerk.openUserProfile>[0]);
    },
    setActiveOrganization: async (orgId: string | null) => {
      await clerk.setActive({ organization: orgId } as Parameters<typeof clerk.setActive>[0]);
    },
  }), [clerk]);
}
