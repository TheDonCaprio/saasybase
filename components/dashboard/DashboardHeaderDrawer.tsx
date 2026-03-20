"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faUser, faCrown, faCoins, faCalendarDays, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from './SidebarNav';
import { AuthSignOutButton, useAuthUser, useAuthInstance, useAuthSession, AuthOrganizationSwitcher } from '@/lib/auth-provider/client';
import { createPortal } from 'react-dom';
import { TransientNavLink } from '@/components/ui/TransientNavLink';

const PROFILE_FETCH_RETRY_DELAY_MS = 450;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DashboardHeaderDrawerProps {
  items: NavItem[];
  contextLabel: string;
  className?: string;
  signOutLabel?: string;
}

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
    isUnlimited?: boolean;
    displayRemaining?: string;
  };
  subscription: {
    planName: string;
    expiresAt: string;
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

export function DashboardHeaderDrawer({
  items,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: DashboardHeaderDrawerProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const { orgId } = useAuthSession();
  const currentOrgId = orgId ?? null;
  const { signOut } = useAuthInstance();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [profileState, setProfileState] = useState<{ orgId: string | null; profile: UserProfile | null; loaded: boolean } | null>(null);
  const prevOrgIdRef = useRef(currentOrgId);
  const profileRequestInFlightRef = useRef(false);
  const hasAttemptedProfileFetchRef = useRef(false);
  const open = openPathname === pathname;
  const profileLoadedForOrg = profileState?.orgId === currentOrgId && profileState?.loaded === true;
  const profile = profileState?.orgId === currentOrgId ? (profileState?.profile ?? null) : null;
  const loading = isSignedIn && open && !profileLoadedForOrg;

  const fetchProfile = useCallback(async (retryOnUnauthorized = false) => {
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
  }, []);

  const displayItems = useMemo(() => {
    const planSource = profile?.planSource;
    const planLabel = profile?.planActionLabel ?? (planSource === 'FREE' ? 'Upgrade' : 'Change Plan');
    return items.map((item) => {
      let nextItem = item;
      if (item.href === '/dashboard/plan' && planSource) {
        nextItem = { ...nextItem, label: planLabel };
      }
      if (item.href === '/dashboard/team' && profile?.hasPendingTeamInvites) {
        nextItem = { ...nextItem, badge: 'NEW' };
      }
      return nextItem;
    });
  }, [items, profile?.hasPendingTeamInvites, profile?.planSource, profile?.planActionLabel]);

  const activeItem = (() => {
    if (!pathname) return undefined;
    const matches = displayItems.filter((item) => {
      if (!item.href) return false;
      if (item.href === '/dashboard') return pathname === '/dashboard';
      if (pathname === item.href) return true;
      return pathname.startsWith(item.href + '/');
    });
    if (!matches.length) return displayItems.find((item) => item.href === pathname);
    return matches.reduce((best, current) => (current.href.length > best.href.length ? current : best));
  })();

  const toggle = useCallback(() => {
    setOpenPathname(prev => (prev === pathname ? null : pathname));
  }, [pathname]);
  const close = useCallback(() => {
    setOpenPathname(null);
    setDetailsExpanded(false);
    hasAttemptedProfileFetchRef.current = false;
    setProfileState((prev) => {
      if (prev?.orgId === currentOrgId && prev.profile == null) {
        return null;
      }
      return prev;
    });
  }, [currentOrgId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPathname(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (prevOrgIdRef.current === currentOrgId) return;
    prevOrgIdRef.current = currentOrgId;
    hasAttemptedProfileFetchRef.current = false;

    const timer = setTimeout(() => {
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
  }, [currentOrgId, fetchProfile]);

  useEffect(() => {
    if (isSignedIn && open && !profile && !hasAttemptedProfileFetchRef.current && !profileRequestInFlightRef.current) {
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
  }, [currentOrgId, fetchProfile, isSignedIn, open, profile]);

  useEffect(() => {
    if (!open) {
      hasAttemptedProfileFetchRef.current = false;
    }
  }, [open]);

  const handleSignOut = async () => {
    await signOut();
    setOpenPathname(null);
    setProfileState(null);
    hasAttemptedProfileFetchRef.current = false;
  };

  const wrapperClass = className ? `${className}` : '';
  const personalTokenCount = profile?.subscription?.tokens.remaining ?? profile?.paidTokens?.remaining ?? null;
  const personalTokenName = profile?.subscription?.tokenName ?? profile?.paidTokens?.tokenName ?? null;
  const hasUnlimitedPersonalTokens = Boolean(profile?.subscription?.tokens.isUnlimited || profile?.paidTokens?.isUnlimited);
  const personalTokenDisplay = hasUnlimitedPersonalTokens
    ? 'Unlimited'
    : personalTokenCount != null
      ? personalTokenCount.toLocaleString()
      : null;
  const isOrganizationContext = profile?.planSource === 'ORGANIZATION';
  const isPersonalContext = profile?.planSource === 'PERSONAL';
  const activePlanName = isOrganizationContext
    ? profile?.organization?.planName || 'Workspace Plan'
    : isPersonalContext
      ? profile?.subscription?.planName || 'Free Plan'
      : 'Free Plan';
  const shouldShowPersonalTokens = Boolean(isPersonalContext && personalTokenName && (hasUnlimitedPersonalTokens || personalTokenCount != null));
  const shouldShowSharedTokens = Boolean(isOrganizationContext && profile?.sharedTokens);
  const expiresAt = isOrganizationContext
    ? profile?.organization?.expiresAt ?? profile?.subscription?.expiresAt ?? null
    : profile?.subscription?.expiresAt ?? null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="dashboard-header-drawer"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 ${wrapperClass}`}
      >
        <FontAwesomeIcon icon={open ? faXmark : faUser} className="h-5 w-5" />
        <span className="sr-only">Toggle account menu</span>
      </button>

        {open && typeof document !== 'undefined' ? createPortal(
          <div className="fixed inset-0 z-[60000]">
            <button
              type="button"
              onClick={close}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              id="dashboard-header-drawer"
              className="absolute inset-y-0 left-0 flex h-full w-[min(85vw,320px)] flex-col overflow-visible border-r border-[color:rgb(var(--border-primary))] bg-[color:rgb(var(--bg-secondary))] text-neutral-100 shadow-2xl backdrop-blur-lg z-[60001]"
            >
              <div className="flex items-center justify-between border-b border-[color:rgb(var(--border-primary))] px-4 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{contextLabel}</p>
                  <p className="text-base font-semibold text-neutral-100">{activeItem ? activeItem.label : 'Menu'}</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgb(var(--border-primary))] text-neutral-400 transition hover:border-[color:rgb(var(--border-secondary))] hover:text-neutral-100"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  <span className="sr-only">Close menu</span>
                </button>
              </div>

              {/* Account Info Section */}
              {isSignedIn && (
                <div className="border-b border-[color:rgb(var(--border-primary))] bg-neutral-900/50">
                  {loading ? (
                    <div className="space-y-2.5 p-3.5">
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse w-3/4" />
                    </div>
                  ) : profile ? (
                    <div className="space-y-2.5 p-3.5">
                      <button
                        type="button"
                        onClick={() => setDetailsExpanded((prev) => !prev)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl px-0 py-0 text-left transition"
                        aria-expanded={detailsExpanded}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-neutral-100">
                            {profile.user.name}
                          </p>
                          <p className="truncate text-xs text-neutral-400">
                            {profile.user.email}
                          </p>
                          {profile.organization && (
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                              {profile.organization.name} · {profile.organization.role === 'OWNER' ? 'Owner' : 'Member'}
                            </p>
                          )}
                        </div>
                        <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800/70 text-neutral-400">
                          <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
                        </span>
                      </button>

                      {detailsExpanded ? (
                        <div className="space-y-2 rounded-xl bg-neutral-900/35 px-3 py-2.5">
                          <div className="flex items-center gap-2 text-sm">
                            <FontAwesomeIcon icon={faCrown} className="h-4 w-4 text-amber-500" />
                            <span className="text-neutral-300">
                              {activePlanName}
                            </span>
                          </div>

                          {shouldShowPersonalTokens && personalTokenDisplay && personalTokenName && (
                            <div className="flex items-center gap-2 text-sm">
                              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-emerald-500" />
                              <span className="text-neutral-300">
                                {personalTokenDisplay} {personalTokenName} (Personal)
                              </span>
                            </div>
                          )}

                          {shouldShowSharedTokens && profile.sharedTokens && (
                            <div className="flex items-start gap-2 text-sm">
                              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-[rgb(var(--accent-primary-rgb))]" />
                              <div>
                                <span className="text-neutral-300">
                                  {profile.sharedTokens.remaining.toLocaleString()} {profile.sharedTokens.tokenName}
                                  {profile.organization ? ` (${profile.organization.name})` : ''}
                                </span>
                                <p className="text-[11px] text-neutral-400">
                                  {profile.sharedTokens.cap != null
                                    ? `Cap: ${profile.sharedTokens.cap.toLocaleString()} ${profile.sharedTokens.tokenName} (${(profile.sharedTokens.strategy || 'SOFT').toLowerCase()} mode)`
                                    : profile.sharedTokens.strategy === 'DISABLED'
                                    ? 'Member caps disabled'
                                    : 'No per-member cap set'}
                                </p>
                              </div>
                            </div>
                          )}

                          {profile.freeTokens && (
                            <div className="flex items-center gap-2 text-sm">
                              <FontAwesomeIcon icon={faCoins} className="h-4 w-4 text-sky-500" />
                              <span className="text-neutral-300">
                                {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (Free)
                              </span>
                            </div>
                          )}

                          {expiresAt && (
                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                              <FontAwesomeIcon icon={faCalendarDays} className="h-4 w-4" />
                              <span>Expires: {expiresAt}</span>
                            </div>
                          )}

                          {profile.planSource === 'FREE' && (
                            <TransientNavLink
                              href="/pricing"
                              className="block text-sm text-[rgb(var(--accent-primary-rgb))] hover:text-[rgb(var(--accent-hover-rgb))]"
                              onClick={close}
                            >
                              Upgrade to Pro →
                            </TransientNavLink>
                          )}
                        </div>
                      ) : null}

                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Workspace</p>
                        <AuthOrganizationSwitcher
                          hidePersonal={false}
                          appearance={{
                            elements: {
                              rootBox: 'relative w-full',
                              organizationSwitcherTrigger:
                                'w-full justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
                              organizationSwitcherTriggerIcon:
                                'text-neutral-400 transition-transform group-data-[open=true]:rotate-180 dark:text-neutral-500',
                              organizationSwitcherPopoverRootBox:
                                '!left-0 !right-auto !top-full !mt-2 !z-[70010] !w-[17rem] !min-w-[17rem] !max-w-[17rem]',
                              organizationSwitcherPopoverCard:
                                '!z-[70011] !w-[17rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
                              organizationSwitcherPopoverMain: 'overflow-hidden bg-transparent',
                              organizationSwitcherPopoverActions:
                                'border-t border-neutral-200 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-950/50',
                              organizationSwitcherPopoverActionButton:
                                'min-h-9 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                              organizationSwitcherPopoverActionButton__createOrganization:
                                profile?.canCreateOrganization === false ? 'hidden' : '',
                              organizationSwitcherPopoverActionButtonIconBox: 'text-neutral-500 dark:text-neutral-400',
                              organizationListPreviewItemActionButton:
                                'h-7 w-7 min-w-7 max-w-7 justify-center rounded-md border border-neutral-200 bg-transparent p-0 text-[0] shadow-none transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
                              organizationSwitcherPopoverFooter:
                                'border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-700 dark:bg-neutral-950/40',
                              organizationSwitcherPreviewButton:
                                'min-h-10 rounded-none px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
                              organizationListPreviewItems: 'gap-0',
                              organizationListPreviewItem:
                                'border-b border-neutral-200/80 last:border-b-0 dark:border-neutral-700/80',
                              organizationListPreviewButton:
                                'min-h-10 rounded-none px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/80',
                              organizationListCreateOrganizationActionButton:
                                profile?.canCreateOrganization === false
                                  ? 'hidden'
                                  : 'min-h-9 rounded-none px-3 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800',
                              organizationPreviewMainIdentifier: 'text-neutral-900 dark:text-neutral-100',
                              organizationPreviewSecondaryIdentifier: 'text-xs text-neutral-500 dark:text-neutral-400',
                            },
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
                {displayItems.map((item) => {
                  const active = !!(
                    item.href &&
                    (item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname === item.href || pathname.startsWith(item.href + '/'))
                  );
                  return (
                    <TransientNavLink
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                        active
                          ? 'border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] bg-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.14))] text-neutral-100 shadow-sm'
                          : 'border-transparent text-neutral-300 hover:border-[color:rgb(var(--border-primary))] hover:bg-neutral-900/60'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {item.icon && (
                          <FontAwesomeIcon
                            icon={item.icon}
                            className={`h-4 w-4 transition ${
                              active
                                ? 'text-[rgb(var(--accent-primary-rgb))]'
                                : 'text-neutral-500 group-hover:text-neutral-200'
                            }`}
                          />
                        )}
                        <span className="font-medium tracking-tight text-current">{item.label}</span>
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                            item.badge === 'NEW'
                              ? 'rounded-full bg-emerald-500 px-2 py-1 text-white'
                              : 'rounded-full bg-neutral-800 px-2 py-1 text-neutral-200'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </TransientNavLink>
                  );
                })}
              </nav>

              {/* Sign Out Button */}
              <div className="border-t border-[color:rgb(var(--border-primary))] px-4 py-3">
                <AuthSignOutButton>
                  <button 
                    onClick={handleSignOut}
                    className="w-full rounded-full border border-[color:rgb(var(--border-primary))] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                  >
                    {signOutLabel}
                  </button>
                </AuthSignOutButton>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
    </>
  );
}
