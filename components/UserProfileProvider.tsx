'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useAuthSession, useAuthUser } from '@/lib/auth-provider/client';
import { isCurrentPageNotFound } from '@/lib/client-not-found';
import { TOKEN_BALANCES_UPDATED_EVENT, type TokenBalancesUpdatedDetail } from '@/lib/token-balance-sync';

export interface SharedUserProfile {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  permissions?: Record<string, boolean>;
  paidTokens?: {
    tokenName: string;
    remaining: number;
    isUnlimited?: boolean;
    displayRemaining?: string;
  };
  subscription: {
    planName: string;
    expiresAt: string;
    billingDateLabel?: 'Expires' | 'Cancels' | 'Renews';
    tokenName: string;
    tokens: {
      total: number | null;
      used: number | null;
      remaining: number;
      isUnlimited?: boolean;
      displayRemaining?: string;
    };
  } | null;
  organization?: {
    id: string;
    name: string;
    role: string;
    planName: string;
    tokenName: string;
    expiresAt?: string | null;
    billingDateLabel?: 'Expires' | 'Cancels' | 'Renews';
    tokenPoolStrategy?: string | null;
    memberTokenCap?: number | null;
    memberCapStrategy?: string | null;
    memberCapResetIntervalHours?: number | null;
  } | null;
  sharedTokens?: {
    tokenName: string;
    remaining: number;
    cap?: number | null;
    strategy?: string | null;
  } | null;
  freeTokens?: {
    tokenName?: string;
    total?: number | null;
    remaining: number;
  } | null;
  planSource?: 'PERSONAL' | 'ORGANIZATION' | 'FREE';
  planActionLabel?: 'Upgrade' | 'Change Plan';
  canCreateOrganization?: boolean;
  hasPendingTeamInvites?: boolean;
}

type FetchProfileOptions = {
  force?: boolean;
  retryOnUnauthorized?: boolean;
  delayMs?: number;
};

type UserProfileContextValue = {
  currentOrgId: string | null;
  profile: SharedUserProfile | null;
  loaded: boolean;
  loading: boolean;
  error: Error | null;
  ensureProfile: (options?: FetchProfileOptions) => Promise<SharedUserProfile | null>;
  refreshProfile: (options?: FetchProfileOptions) => Promise<SharedUserProfile | null>;
  resetProfile: () => void;
};

type ProfileState = {
  orgId: string | null;
  profile: SharedUserProfile | null;
  loaded: boolean;
  loading: boolean;
  error: Error | null;
};

const PROFILE_FETCH_RETRY_DELAY_MS = 450;
const TOKEN_BALANCE_REFRESH_DEBOUNCE_MS = 250;

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
    || error === 'profile-refresh'
    || error === 'profile-reset'
    || error === 'profile-provider-unmount'
  );
}

function createInitialState(orgId: string | null): ProfileState {
  return {
    orgId,
    profile: null,
    loaded: false,
    loading: false,
    error: null,
  };
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuthUser();
  const { orgId } = useAuthSession();
  const currentOrgId = orgId ?? null;
  const [profileState, setProfileState] = useState<ProfileState>(() => createInitialState(currentOrgId));
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightPromiseRef = useRef<Promise<SharedUserProfile | null> | null>(null);
  const prevOrgIdRef = useRef(currentOrgId);
  const tokenRefreshTimeoutRef = useRef<number | null>(null);

  const abortActiveProfileRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const clearTokenRefreshTimeout = useCallback(() => {
    if (tokenRefreshTimeoutRef.current !== null) {
      window.clearTimeout(tokenRefreshTimeoutRef.current);
      tokenRefreshTimeoutRef.current = null;
    }
  }, []);

  const resetProfile = useCallback(() => {
    abortActiveProfileRequest();
    inFlightPromiseRef.current = null;
    setProfileState(createInitialState(currentOrgId));
  }, [abortActiveProfileRequest, currentOrgId]);

  const executeFetch = useCallback(async (options: FetchProfileOptions = {}) => {
    const {
      force = false,
      retryOnUnauthorized = false,
      delayMs = 0,
    } = options;

    if (!isLoaded || !isSignedIn) {
      setProfileState(createInitialState(currentOrgId));
      return null;
    }

    const targetOrgId = currentOrgId;
    const currentStateMatchesOrg = profileState.orgId === targetOrgId;

    if (!force) {
      if (currentStateMatchesOrg && profileState.loaded) {
        return profileState.profile;
      }
      if (inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }
    }

    abortActiveProfileRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setProfileState((prev) => ({
      orgId: targetOrgId,
      profile: prev.orgId === targetOrgId ? prev.profile : null,
      loaded: false,
      loading: true,
      error: null,
    }));

    const requestPromise = (async () => {
      try {
        if (delayMs > 0) {
          await delay(delayMs);
        }

        if (controller.signal.aborted) {
          return null;
        }

        const response = await fetch('/api/user/profile', {
          credentials: 'same-origin',
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as Partial<SharedUserProfile> | null;
          const hasUser =
            Boolean(data?.user)
            && typeof data?.user?.id === 'string'
            && typeof data?.user?.name === 'string'
            && typeof data?.user?.email === 'string'
            && typeof data?.user?.role === 'string';

          return hasUser ? (data as SharedUserProfile) : null;
        }

        if (retryOnUnauthorized && response.status === 401) {
          await delay(PROFILE_FETCH_RETRY_DELAY_MS);

          if (controller.signal.aborted) {
            return null;
          }

          const retriedResponse = await fetch('/api/user/profile', {
            credentials: 'same-origin',
            signal: controller.signal,
          });

          if (retriedResponse.ok) {
            const data = (await retriedResponse.json()) as Partial<SharedUserProfile> | null;
            const hasUser =
              Boolean(data?.user)
              && typeof data?.user?.id === 'string'
              && typeof data?.user?.name === 'string'
              && typeof data?.user?.email === 'string'
              && typeof data?.user?.role === 'string';

            return hasUser ? (data as SharedUserProfile) : null;
          }

          if (retriedResponse.status === 401) {
            return null;
          }

          throw new Error(`Profile fetch failed: ${retriedResponse.status}`);
        }

        if (response.status === 401) {
          return null;
        }

        throw new Error(`Profile fetch failed: ${response.status}`);
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }

        throw error;
      }
    })();

    inFlightPromiseRef.current = requestPromise;

    try {
      const profile = await requestPromise;
      setProfileState({
        orgId: targetOrgId,
        profile,
        loaded: true,
        loading: false,
        error: null,
      });
      return profile;
    } catch (error) {
      if (isAbortError(error)) {
        return currentStateMatchesOrg ? profileState.profile : null;
      }

      const nextError = error instanceof Error ? error : new Error('Failed to fetch profile');
      setProfileState({
        orgId: targetOrgId,
        profile: null,
        loaded: true,
        loading: false,
        error: nextError,
      });
      return null;
    } finally {
      if (inFlightPromiseRef.current === requestPromise) {
        inFlightPromiseRef.current = null;
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [abortActiveProfileRequest, currentOrgId, isLoaded, isSignedIn, profileState.loaded, profileState.orgId, profileState.profile]);

  const ensureProfile = useCallback((options: FetchProfileOptions = {}) => {
    return executeFetch(options);
  }, [executeFetch]);

  const refreshProfile = useCallback((options: FetchProfileOptions = {}) => {
    return executeFetch({ ...options, force: true });
  }, [executeFetch]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      resetProfile();
    }
  }, [isLoaded, isSignedIn, resetProfile]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      prevOrgIdRef.current = currentOrgId;
      return;
    }

    if (prevOrgIdRef.current === currentOrgId) {
      return;
    }

    prevOrgIdRef.current = currentOrgId;

    const shouldRefresh = pathname.startsWith('/dashboard') || profileState.loaded;
    if (!shouldRefresh) {
      setProfileState(createInitialState(currentOrgId));
      return;
    }

    void refreshProfile({ retryOnUnauthorized: true, delayMs: 600 });
  }, [currentOrgId, isLoaded, isSignedIn, pathname, profileState.loaded, refreshProfile]);

  useEffect(() => {
    const isDashboardArea = pathname.startsWith('/dashboard');
    if (!isLoaded || !isSignedIn || !isDashboardArea || isCurrentPageNotFound() || profileState.loaded || profileState.loading) {
      return;
    }

    void ensureProfile();
  }, [ensureProfile, isLoaded, isSignedIn, pathname, profileState.loaded, profileState.loading]);

  useEffect(() => {
    return () => {
      clearTokenRefreshTimeout();
      abortActiveProfileRequest();
      inFlightPromiseRef.current = null;
    };
  }, [abortActiveProfileRequest, clearTokenRefreshTimeout]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const applyTokenBalanceUpdate = (detail: TokenBalancesUpdatedDetail) => {
      setProfileState((prev) => {
        if (!prev.profile || prev.orgId !== currentOrgId) {
          return prev;
        }

        const nextProfile: SharedUserProfile = { ...prev.profile };
        let changed = false;

        const paidBalance = detail.balances?.paid;
        if (typeof paidBalance === 'number') {
          if (nextProfile.paidTokens && nextProfile.paidTokens.remaining !== paidBalance) {
            nextProfile.paidTokens = {
              ...nextProfile.paidTokens,
              remaining: paidBalance,
              displayRemaining: nextProfile.paidTokens.isUnlimited ? 'Unlimited' : paidBalance.toLocaleString(),
            };
            changed = true;
          }

          if (nextProfile.subscription?.tokens && !nextProfile.subscription.tokens.isUnlimited && nextProfile.subscription.tokens.remaining !== paidBalance) {
            nextProfile.subscription = {
              ...nextProfile.subscription,
              tokens: {
                ...nextProfile.subscription.tokens,
                remaining: paidBalance,
                used: nextProfile.subscription.tokens.total != null
                  ? Math.max(0, nextProfile.subscription.tokens.total - paidBalance)
                  : nextProfile.subscription.tokens.used,
                displayRemaining: paidBalance.toLocaleString(),
              },
            };
            changed = true;
          }
        }

        const freeBalance = detail.balances?.free;
        if (typeof freeBalance === 'number' && nextProfile.freeTokens && nextProfile.freeTokens.remaining !== freeBalance) {
          nextProfile.freeTokens = {
            ...nextProfile.freeTokens,
            remaining: freeBalance,
          };
          changed = true;
        }

        const sharedBalance = detail.balances?.shared;
        const sameOrganization = !detail.organizationId || detail.organizationId === nextProfile.organization?.id;
        if (typeof sharedBalance === 'number' && sameOrganization && nextProfile.sharedTokens && nextProfile.sharedTokens.remaining !== sharedBalance) {
          nextProfile.sharedTokens = {
            ...nextProfile.sharedTokens,
            remaining: sharedBalance,
          };
          changed = true;
        }

        return changed ? { ...prev, profile: nextProfile } : prev;
      });
    };

    const scheduleRefresh = () => {
      clearTokenRefreshTimeout();
      tokenRefreshTimeoutRef.current = window.setTimeout(() => {
        tokenRefreshTimeoutRef.current = null;
        void refreshProfile();
      }, TOKEN_BALANCE_REFRESH_DEBOUNCE_MS);
    };

    const handleTokenBalancesUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<TokenBalancesUpdatedDetail>;
      if (!customEvent.detail) {
        return;
      }

      applyTokenBalanceUpdate(customEvent.detail);
      scheduleRefresh();
    };

    window.addEventListener(TOKEN_BALANCES_UPDATED_EVENT, handleTokenBalancesUpdated as EventListener);

    return () => {
      window.removeEventListener(TOKEN_BALANCES_UPDATED_EVENT, handleTokenBalancesUpdated as EventListener);
      clearTokenRefreshTimeout();
    };
  }, [clearTokenRefreshTimeout, currentOrgId, isLoaded, isSignedIn, refreshProfile]);

  const value = useMemo<UserProfileContextValue>(() => ({
    currentOrgId,
    profile: profileState.orgId === currentOrgId ? profileState.profile : null,
    loaded: profileState.orgId === currentOrgId ? profileState.loaded : false,
    loading: profileState.orgId === currentOrgId ? profileState.loading : false,
    error: profileState.orgId === currentOrgId ? profileState.error : null,
    ensureProfile,
    refreshProfile,
    resetProfile,
  }), [currentOrgId, ensureProfile, profileState.error, profileState.loaded, profileState.loading, profileState.orgId, profileState.profile, refreshProfile, resetProfile]);

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within UserProfileProvider');
  }
  return context;
}