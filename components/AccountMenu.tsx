'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useUser, useAuth, SignInButton, SignUpButton, useClerk, OrganizationSwitcher } from '@clerk/nextjs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faRightFromBracket, faCrown, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
}

interface SiteInfo {
  siteName: string;
  tokenLabel: string;
}

export default function AccountMenu() {
  const { isSignedIn, isLoaded } = useUser();
  const { orgId } = useAuth();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // pointerPos stores the left (px) where the rotated square should be centered
  const [pointerPos, setPointerPos] = useState<number | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAttemptedProfileFetch, setHasAttemptedProfileFetch] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset profile fetch cache when organization changes so data refreshes correctly
    setProfile(null);
    setHasAttemptedProfileFetch(false);
  }, [orgId]);

  useEffect(() => {
    if (isSignedIn && isOpen && !profile && !loading && !hasAttemptedProfileFetch) {
      setHasAttemptedProfileFetch(true);
      setLoading(true);
      fetch('/api/user/profile')
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch profile: ${res.status}`);
          }
          return res.json();
        })
        .then((data: unknown) => {
          const candidate = data as Partial<UserProfile> | null;
          const hasUser =
            Boolean(candidate?.user)
            && typeof candidate?.user?.id === 'string'
            && typeof candidate?.user?.name === 'string'
            && typeof candidate?.user?.email === 'string'
            && typeof candidate?.user?.role === 'string';

          setProfile(hasUser ? (candidate as UserProfile) : null);
        })
        .catch((err) => {
          console.error('Failed to fetch profile:', err);
          setProfile(null);
        })
        .finally(() => {
          setLoading(false);
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
  }, [isSignedIn, isOpen, profile, loading, siteInfo, hasAttemptedProfileFetch]);

  useEffect(() => {
    if (!isOpen) {
      setHasAttemptedProfileFetch(false);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPointerPos(null);
      return;
    }

    const measure = () => {
      const btn = buttonRef.current;
      if (!btn) return setPointerPos(null);
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      // subtract half the pointer width (6px) so the rotated square centers on the icon
      setPointerPos(Math.round(centerX - 6));
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    setProfile(null);
    setSiteInfo(null);
    setHasAttemptedProfileFetch(false);
  };

  if (!isLoaded) {
    return (
      <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
    );
  }

  const personalTokenCount = profile?.subscription?.tokens.remaining ?? profile?.paidTokens?.remaining ?? null;
  const personalTokenName = profile?.subscription?.tokenName ?? profile?.paidTokens?.tokenName ?? null;
  const hasPersonalTokens = (personalTokenCount ?? 0) > 0;
  const shouldShowPersonalTokens = Boolean(hasPersonalTokens);
  const shouldShowSharedTokens = Boolean(profile?.sharedTokens);
  const expiresAt = profile?.subscription?.expiresAt ?? profile?.organization?.expiresAt ?? null;

  return (
    <div className="relative z-50" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 relative z-50"
        aria-label="Account menu"
      >
        <FontAwesomeIcon icon={faUser} className="w-5 h-5" />
      </button>

      {/* Dropdown for logged-in users */}
      {isSignedIn && isOpen && (
        <>
          {pointerPos !== null && (
            <div
              aria-hidden
              style={{ left: pointerPos, top: 'calc(4.1rem - 6px)' }}
              className="fixed w-3 h-3 rotate-45 bg-white border-t border-l border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 z-[52]"
            />
          )}
          <div style={{ top: '4.1rem' }} className="fixed right-4 w-72 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-[51]">
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
                  <OrganizationSwitcher
                    afterSelectOrganizationUrl={pathname || '/dashboard'}
                    afterLeaveOrganizationUrl={pathname || '/dashboard'}
                    afterSelectPersonalUrl={pathname || '/dashboard'}
                    appearance={{
                      elements: {
                        organizationSwitcherTrigger:
                          'w-full justify-between rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
                        organizationSwitcherPopoverCard:
                          'border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
                        organizationPreviewMainIdentifier: 'text-neutral-900 dark:text-neutral-100',
                        organizationPreviewSecondaryIdentifier: 'text-neutral-500 dark:text-neutral-400',
                      },
                    }}
                  />
                </div>

                {/* Plan Info */}
                <div className="flex items-center gap-2 text-sm">
                  <FontAwesomeIcon icon={faCrown} className="w-4 h-4 text-amber-500" />
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {profile.subscription?.planName || profile.organization?.planName || 'Free Plan'}
                  </span>
                </div>

                {/* Token/Credit Info */}
                {shouldShowPersonalTokens && personalTokenCount != null && personalTokenName && (
                  <div className="flex items-center gap-2 text-sm">
                    <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-emerald-500" />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {personalTokenCount.toLocaleString()} {personalTokenName} remaining
                    </span>
                  </div>
                )}

                {shouldShowSharedTokens && profile.sharedTokens && (
                  <div className="flex items-start gap-2 text-sm">
                    <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-blue-500" />
                    <div>
                      <span className="text-neutral-700 dark:text-neutral-300">
                        {profile.sharedTokens.remaining.toLocaleString()} {profile.sharedTokens.tokenName}
                        {profile.organization ? ` (${profile.organization.name} workspace)` : ' (workspace)'}
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
                      {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (free)
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

                {!profile.subscription && !profile.sharedTokens && (
                  <Link
                    href="/pricing"
                    className="block text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    onClick={() => setIsOpen(false)}
                  >
                    Upgrade to Pro →
                  </Link>
                )}
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800">
                <Link
                  href="/dashboard"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/account"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Account Settings
                </Link>
                <Link
                  href="/dashboard/billing"
                  className="block px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Billing
                </Link>
                {profile.user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="block px-4 py-3 text-sm text-violet-600 hover:bg-neutral-50 dark:text-violet-400 dark:hover:bg-neutral-800 transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    Admin Panel
                  </Link>
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
          {pointerPos !== null && (
            <div
              aria-hidden
              style={{ left: pointerPos, top: 'calc(4.1rem - 6px)' }}
              className="fixed w-3 h-3 rotate-45 bg-white border-t border-l border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 z-[52]"
            />
          )}
          <div style={{ top: '4.1rem' }} className="fixed right-4 w-72 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-[51]">
          <div className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                Welcome to {siteInfo?.siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Sign in to access your account, view your plan, and manage {siteInfo?.tokenLabel || 'tokens'}.
              </p>
            </div>

            <SignInButton mode="modal">
              <button className="w-full px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium text-sm">
                Sign In
              </button>
            </SignInButton>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2 bg-white text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  or
                </span>
              </div>
            </div>

            <SignUpButton mode="modal">
              <button className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors font-medium text-sm">
                Create Account
              </button>
            </SignUpButton>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800 px-6 py-4">
            <Link
              href="/pricing"
              className="block text-center text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
              onClick={() => setIsOpen(false)}
            >
              View Pricing →
            </Link>
          </div>
        </div>
        </>
      )}

      {/* Legacy Auth Modal - kept for backwards compatibility but hidden */}
      {false && !isSignedIn && showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-auto relative z-[99999]">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </h2>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {authMode === 'signin' ? (
                  <>
                    <SignInButton mode="modal">
                      <button className="w-full px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium">
                        Sign In
                      </button>
                    </SignInButton>
                    <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                      Don&apos;t have an account?{' '}
                      <button
                        onClick={() => setAuthMode('signup')}
                        className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
                      >
                        Sign up
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    <SignUpButton mode="modal">
                      <button className="w-full px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium">
                        Sign Up
                      </button>
                    </SignUpButton>
                    <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                      Already have an account?{' '}
                      <button
                        onClick={() => setAuthMode('signin')}
                        className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium"
                      >
                        Sign in
                      </button>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
