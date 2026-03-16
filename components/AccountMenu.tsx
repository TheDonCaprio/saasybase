'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthUser, useAuthSession, useAuthInstance, AuthSignInButton, AuthSignUpButton, AuthOrganizationSwitcher } from '@/lib/auth-provider/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faRightFromBracket, faCrown, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import { TransientNavLink } from '@/components/ui/TransientNavLink';
import { refreshVisibleRoute } from '@/lib/client-route-revalidation';
import { useRouter } from 'next/navigation';

interface UserProfile {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  paidTokens?: {
    tokenName: string;
    remaining: number;
  };
  subscription: {
    planName: string;
    expiresAt: string;
    tokenName: string;
    tokens: {
      total: number;
      used: number;
      remaining: number;
    };
  } | null;
  organization?: {
    id: string;
    name: string;
    role: string;
    planName: string;
    tokenName: string;
    expiresAt?: string | null;
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
  canCreateOrganization?: boolean;
}

interface SiteInfo {
  siteName: string;
  tokenLabel: string;
}

const PROFILE_FETCH_RETRY_DELAY_MS = 450;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AccountMenu() {
  const { isSignedIn, isLoaded } = useAuthUser();
  const { orgId } = useAuthSession();
  const currentOrgId = orgId ?? null;
  const { signOut } = useAuthInstance();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [profileState, setProfileState] = useState<{ orgId: string | null; profile: UserProfile | null; loaded: boolean } | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const prevOrgIdRef = useRef(currentOrgId);
  const profileRequestInFlightRef = useRef(false);
  const hasAttemptedProfileFetchRef = useRef(false);
  const dropdownTop = '4.45rem';
  const profileLoadedForOrg = profileState?.orgId === currentOrgId && profileState?.loaded === true;
  const profile = profileState?.orgId === currentOrgId ? (profileState?.profile ?? null) : null;
  const loading = isSignedIn && isOpen && !profileLoadedForOrg;

  const fetchProfile = async (retryOnUnauthorized = false) => {
    const response = await fetch('/api/user/profile', { credentials: 'same-origin' });

    if (response.ok) {
      const data = (await response.json()) as Partial<UserProfile> | null;
      const hasUser =
        Boolean(data?.user)
        && typeof data?.user?.id === 'string'
        && typeof data?.user?.name === 'string'
        && typeof data?.user?.email === 'string'
        && typeof data?.user?.role === 'string';

      return hasUser ? (data as UserProfile) : null;
    }

    if (retryOnUnauthorized && response.status === 401) {
      await delay(PROFILE_FETCH_RETRY_DELAY_MS);
      const retriedResponse = await fetch('/api/user/profile', { credentials: 'same-origin' });

      if (retriedResponse.ok) {
        const data = (await retriedResponse.json()) as Partial<UserProfile> | null;
        const hasUser =
          Boolean(data?.user)
          && typeof data?.user?.id === 'string'
          && typeof data?.user?.name === 'string'
          && typeof data?.user?.email === 'string'
          && typeof data?.user?.role === 'string';

        return hasUser ? (data as UserProfile) : null;
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
  };

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    hasAttemptedProfileFetchRef.current = false;
    setProfileState((prev) => {
      if (prev?.orgId === currentOrgId && prev.profile == null) {
        return null;
      }
      return prev;
    });
  }, [currentOrgId]);

  useEffect(() => {
    // Skip the initial mount — only react to actual org switches
    if (prevOrgIdRef.current === currentOrgId) return;
    prevOrgIdRef.current = currentOrgId;
    hasAttemptedProfileFetchRef.current = false;

    // Clerk needs a moment to propagate the new session cookie after an org
    // switch.  Give it 600ms then re-fetch profile and refresh RSC data.
    const timer = setTimeout(() => {
      refreshVisibleRoute(router, 'org-validity');
      profileRequestInFlightRef.current = true;
      hasAttemptedProfileFetchRef.current = true;

      fetchProfile(true)
        .then((nextProfile) => {
          setProfileState({ orgId: currentOrgId, profile: nextProfile, loaded: true });
        })
        .catch((err) => {
          console.error('Failed to fetch profile after org switch:', err);
          setProfileState({ orgId: currentOrgId, profile: null, loaded: true });
        })
        .finally(() => {
          profileRequestInFlightRef.current = false;
        });
    }, 600);

    return () => clearTimeout(timer);
  }, [currentOrgId, router]);

  useEffect(() => {
    if (isSignedIn && isOpen && !profile && !hasAttemptedProfileFetchRef.current && !profileRequestInFlightRef.current) {
      hasAttemptedProfileFetchRef.current = true;
      profileRequestInFlightRef.current = true;
      fetchProfile(false)
        .then((nextProfile) => {
          setProfileState({ orgId: currentOrgId, profile: nextProfile, loaded: true });
        })
        .catch((err) => {
          console.error('Failed to fetch profile:', err);
          setProfileState({ orgId: currentOrgId, profile: null, loaded: true });
        })
        .finally(() => {
          profileRequestInFlightRef.current = false;
        });
    }

    // Fetch site info when dropdown opens (for logged-out users)
    if (!isSignedIn && isOpen && !siteInfo) {
      fetch('/api/site-info')
        .then((res) => res.json())
        .then((data) => {
          setSiteInfo(data);
        })
        .catch((err) => {
          console.error('Failed to fetch site info:', err);
        });
    }
  }, [currentOrgId, isSignedIn, isOpen, profile, siteInfo]);

  useEffect(() => {
    if (!isOpen) {
      hasAttemptedProfileFetchRef.current = false;
    }
  }, [closeMenu, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest('[class*="cl-organizationSwitcher"]')) {
        return;
      }

      if (target?.closest('[data-auth-modal-root="true"]')) {
        return;
      }

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeMenu, isOpen]);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    setProfileState(null);
    setSiteInfo(null);
    hasAttemptedProfileFetchRef.current = false;
  };

  if (!isLoaded) {
    return (
      <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
    );
  }

  const personalTokenCount = profile?.subscription?.tokens.remaining ?? profile?.paidTokens?.remaining ?? null;
  const personalTokenName = profile?.subscription?.tokenName ?? profile?.paidTokens?.tokenName ?? null;
  const isOrganizationContext = profile?.planSource === 'ORGANIZATION';
  const isPersonalContext = profile?.planSource === 'PERSONAL';
  const activePlanName = isOrganizationContext
    ? profile?.organization?.planName || 'Workspace Plan'
    : isPersonalContext
      ? profile?.subscription?.planName || 'Free Plan'
      : 'Free Plan';
  const shouldShowPersonalTokens = Boolean(isPersonalContext && personalTokenCount != null && personalTokenName);
  const shouldShowSharedTokens = Boolean(isOrganizationContext && profile?.sharedTokens);
  const expiresAt = isOrganizationContext
    ? profile?.organization?.expiresAt ?? profile?.subscription?.expiresAt ?? null
    : profile?.subscription?.expiresAt ?? null;

  return (
    <div className="relative z-50" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (isOpen) {
            closeMenu();
            return;
          }
          setIsOpen(true);
        }}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 relative z-50"
        aria-label="Account menu"
      >
        <FontAwesomeIcon icon={faUser} className="w-5 h-5" />
      </button>

      {/* Dropdown for logged-in users */}
      {isSignedIn && isOpen && (
        <>
          <div
            aria-hidden
            style={{ top: dropdownTop }}
            className="fixed right-[1.65rem] z-[52] h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div style={{ top: dropdownTop }} className="fixed right-4 w-72 overflow-visible rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/10 ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/40 dark:ring-white/10 z-[51]">
          {loading ? (
            <div className="p-4 space-y-3">
              <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
              <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse w-3/4" />
            </div>
          ) : profile?.user ? (
            <>
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {profile.user.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {profile.user.email}
                </p>
                {profile.organization && (
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500 mt-1">
                    {profile.organization.name} · {profile.organization.role === 'OWNER' ? 'Owner' : 'Member'}
                  </p>
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-500">Workspace</p>
                  <AuthOrganizationSwitcher
                    hidePersonal={false}
                    appearance={{
                      elements: {
                        rootBox: 'w-full',
                        organizationSwitcherTrigger:
                          'w-full justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        organizationSwitcherTriggerIcon:
                          'text-neutral-400 transition-transform group-data-[open=true]:rotate-180 dark:text-neutral-500',
                        organizationSwitcherPopoverRootBox:
                          '!w-[16rem] !min-w-[16rem] !max-w-[16rem] pt-1.5',
                        organizationSwitcherPopoverCard:
                          '!w-[16rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
                        organizationSwitcherPopoverMain: 'overflow-hidden bg-transparent',
                        organizationSwitcherPopoverActions:
                          'border-t border-neutral-200 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-950/50',
                        organizationSwitcherPopoverActionButton:
                          'min-h-11 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        organizationSwitcherPopoverActionButton__createOrganization:
                          profile?.canCreateOrganization === false ? 'hidden' : '',
                        organizationSwitcherPopoverActionButtonIconBox: 'text-neutral-500 dark:text-neutral-400',
                        organizationListPreviewItemActionButton:
                          'h-8 w-8 min-w-8 max-w-8 justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
                        organizationSwitcherPopoverFooter:
                          'border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-700 dark:bg-neutral-950/40',
                        organizationSwitcherPreviewButton:
                          'min-h-12 rounded-none px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
                        organizationListPreviewItems: 'gap-0',
                        organizationListPreviewItem:
                          'border-b border-neutral-200/80 last:border-b-0 dark:border-neutral-700/80',
                        organizationListPreviewButton:
                          'min-h-12 rounded-none px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
                        organizationListCreateOrganizationActionButton:
                          profile?.canCreateOrganization === false
                            ? 'hidden'
                            : 'min-h-11 rounded-none px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        organizationPreviewMainIdentifier: 'text-neutral-900 dark:text-neutral-100',
                        organizationPreviewSecondaryIdentifier: 'text-xs text-neutral-500 dark:text-neutral-400',
                      },
                    }}
                  />
                </div>

                {/* Plan Info */}
                <div className="flex items-center gap-2 text-sm">
                  <FontAwesomeIcon icon={faCrown} className="w-4 h-4 text-amber-500" />
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {activePlanName}
                  </span>
                </div>

                {/* Token/Credit Info */}
                {shouldShowPersonalTokens && personalTokenCount != null && personalTokenName && (
                  <div className="flex items-center gap-2 text-sm">
                    <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-emerald-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {personalTokenCount.toLocaleString()} {personalTokenName} (Personal)
                    </span>
                  </div>
                )}

                {shouldShowSharedTokens && profile.sharedTokens && (
                  <div className="flex items-start gap-2 text-sm">
                    <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-blue-500" />
                    <div>
                      <span className="text-neutral-700 dark:text-neutral-300">
                        {profile.sharedTokens.remaining.toLocaleString()} {profile.sharedTokens.tokenName}
                        {profile.organization ? ` (${profile.organization.name})` : ''}
                      </span>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {profile.sharedTokens.cap != null
                          ? `Cap: ${profile.sharedTokens.cap.toLocaleString()} ${profile.sharedTokens.tokenName} (${(profile.sharedTokens.strategy || 'SOFT').toLowerCase()} mode)`
                          : profile.sharedTokens.strategy === 'DISABLED'
                          ? 'Member caps disabled'
                          : 'No per-member cap set'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Free tokens (always visible) */}
                {profile.freeTokens && (
                  <div className="flex items-center gap-2 text-sm">
                    <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-sky-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (Free)
                    </span>
                  </div>
                )}

                {/* Plan Expiry */}
                {expiresAt && (
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <FontAwesomeIcon icon={faCalendarDays} className="w-4 h-4" />
                    <span>Expires: {expiresAt}</span>
                  </div>
                )}

                {profile.planSource === 'FREE' && (
                  <TransientNavLink
                    href="/pricing"
                    className="block text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    onClick={() => setIsOpen(false)}
                  >
                    Upgrade to Pro →
                  </TransientNavLink>
                )}
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800">
                <TransientNavLink
                  href="/dashboard"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Dashboard
                </TransientNavLink>
                <TransientNavLink
                  href="/dashboard/account"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Account Settings
                </TransientNavLink>
                <TransientNavLink
                  href="/dashboard/billing"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Billing
                </TransientNavLink>
                {profile.user.role === 'ADMIN' && (
                  <TransientNavLink
                    href="/admin"
                    className="block px-4 py-3 text-sm text-violet-600 hover:bg-neutral-50 dark:text-violet-400 dark:hover:bg-neutral-800 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Admin Panel
                  </TransientNavLink>
                )}
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10 transition-colors text-left"
                >
                  <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
              Failed to load profile
            </div>
          )}
        </div>
        </>
      )}

      {/* Auth Dropdown for logged-out users */}
      {!isSignedIn && isOpen && (
        <>
          <div
            aria-hidden
            style={{ top: dropdownTop }}
            className="fixed right-[1.65rem] z-[52] h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          />
          <div style={{ top: dropdownTop }} className="fixed right-4 z-[51] w-80 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/10 ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/40 dark:ring-white/10">
            <div className="px-6 pb-6 pt-7">
              <div className="space-y-5">
                <div className="space-y-2.5 pr-2">
                  <h3 className="text-[1.15rem] font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
                    Welcome to {siteInfo?.siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase'}
                  </h3>
                  <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                    Sign in to access your account, view your plan, and manage {siteInfo?.tokenLabel || 'tokens'}.
                  </p>
                </div>

                <div className="mt-2 text-center text-sm">
                  <AuthSignInButton mode="modal">
                    <button className="w-full rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40">
                      Sign In
                    </button>
                  </AuthSignInButton>
                </div>

                <div className="relative py-0.5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 text-[11px] font-medium tracking-[0.2em] text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                      or
                    </span>
                  </div>
                </div>

                <div className="text-center text-sm">
                  <AuthSignUpButton mode="modal">
                    <button className="w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">
                      Create Account
                    </button>
                  </AuthSignUpButton>
                </div>
              </div>
            </div>

          <div className="border-t border-neutral-200 bg-neutral-50/60 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-950/20">
            <TransientNavLink
              href="/pricing"
              className="block text-center text-sm font-semibold text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              onClick={() => setIsOpen(false)}
            >
              View Pricing →
            </TransientNavLink>
          </div>
        </div>
        </>
      )}

    </div>
  );
}
