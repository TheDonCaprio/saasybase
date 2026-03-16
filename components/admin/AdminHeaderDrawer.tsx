"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faUserShield, faChevronDown, faCrown, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from '../dashboard/SidebarNav';
import { AuthSignOutButton, useAuthUser, useAuthInstance, useAuthSession, AuthOrganizationSwitcher } from '@/lib/auth-provider/client';
import { createPortal } from 'react-dom';
import { TransientNavLink } from '@/components/ui/TransientNavLink';

const PROFILE_FETCH_RETRY_DELAY_MS = 450;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MenuGroup {
  title: string;
  items: NavItem[];
}

interface AdminHeaderDrawerProps {
  items: NavItem[];
  groups?: MenuGroup[];
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
  permissions?: Record<string, boolean> | undefined;
}

export function AdminHeaderDrawer({
  items,
  groups,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: AdminHeaderDrawerProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const { orgId } = useAuthSession();
  const currentOrgId = orgId ?? null;
  const { signOut } = useAuthInstance();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
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

  const isActiveHref = useCallback(
    (href?: string) => {
      if (!href) return false;
      if (href === '/admin') return pathname === '/admin';
      if (href === '/dashboard') return pathname === '/dashboard';
      return pathname === href || pathname.startsWith(href + '/');
    },
    [pathname]
  );

  const defaultExpandedGroups = useMemo(() => {
    const s = new Set<string>();
    if (!groups || !pathname) return s;
    for (const g of groups) {
      const has = g.items.some((item) => {
        return isActiveHref(item.href);
      });
      if (has) s.add(g.title);
    }
    return s;
  }, [groups, pathname, isActiveHref]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => defaultExpandedGroups);
  const activeItem = useMemo(() => {
    if (!pathname) return undefined;
    // Prefer the most specific (longest) matching href where the pathname
    // either equals the href or starts with the href followed by a slash.
    const matches = items.filter((item) => {
      return isActiveHref(item.href);
    });
    if (!matches.length) return items.find(item => item.href === pathname);
    return matches.reduce((best, current) => (current.href.length > best.href.length ? current : best));
  }, [items, pathname, isActiveHref]);

  const renderedExpandedGroups = useMemo(() => {
    const next = new Set(expandedGroups);
    if (!groups || !activeItem) return next;

    const activeGroup = groups.find(group => group.items.some(item => item.href === activeItem.href));
    if (activeGroup) {
      next.add(activeGroup.title);
    }

    return next;
  }, [activeItem, expandedGroups, groups]);

  const toggle = useCallback(() => {
    setOpenPathname(prev => (prev === pathname ? null : pathname));
  }, [pathname]);
  const close = useCallback(() => {
    setOpenPathname(null);
    hasAttemptedProfileFetchRef.current = false;
    setProfileState((prev) => {
      if (prev?.orgId === currentOrgId && prev.profile == null) {
        return null;
      }
      return prev;
    });
  }, [currentOrgId]);

  const toggleGroup = useCallback((groupTitle: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupTitle)) next.delete(groupTitle); else next.add(groupTitle);
      return next;
    });
  }, []);

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
  const displayGroups = groups || [];
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

  // Client-side list of moderator sections. Keep in sync with server
  // `MODERATOR_SECTIONS` in `lib/moderator.ts`.
  const CLIENT_MODERATOR_SECTIONS = [
    'users',
    'transactions',
    'purchases',
    'subscriptions',
    'support',
    'notifications',
    'blog',
    'analytics',
    'traffic',
    'organizations'
  ];

  // Map an admin href to a moderator section key. Returns null for overview
  // or unknown keys (treated as admin-only).
  function hrefToSection(href?: string): string | null {
    if (!href) return null;
    if (href === '/admin' || href === '/admin/') return 'overview';
    const m = href.match(/^\/admin\/(?<seg>[^\/]+)(?:\/.*)?$/);
    if (!m || !m.groups) return null;
    return m.groups.seg || null;
  }

  // Determine allowed items/groups based on loaded profile. If no profile
  // available yet, fall back to showing everything (avoids flash for signed-in admins).
  const filteredGroups = (() => {
    if (!profile) return displayGroups;
    const role = profile.user.role;
    if (role === 'ADMIN') return displayGroups;

    // For moderators, filter by permissions
    if (role === 'MODERATOR') {
      const perms = profile.permissions || {};
      const out: typeof displayGroups = [];
      for (const g of displayGroups) {
        const items = g.items.filter((item) => {
          const section = hrefToSection(item.href);
          if (!section) return false;
          if (section === 'overview') return true;
          if (CLIENT_MODERATOR_SECTIONS.includes(section)) {
            return Boolean(perms[section]);
          }
          // unknown section -> admin-only
          return false;
        });
        if (items.length) out.push({ ...g, items });
      }
      return out;
    }

    return [];
  })();

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="admin-header-drawer"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 ${wrapperClass}`}
      >
        <FontAwesomeIcon icon={open ? faXmark : faUserShield} className="h-5 w-5" />
        <span className="sr-only">Toggle admin menu</span>
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
              id="admin-header-drawer"
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
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse" />
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded animate-pulse w-3/4" />
                    </div>
                  ) : profile ? (
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-neutral-100 truncate">
                            {profile.user.name}
                          </p>
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            {profile.user.role}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 truncate">
                          {profile.user.email}
                        </p>
                        {profile.organization && (
                          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mt-1">
                            {profile.organization.name} · {profile.organization.role === 'OWNER' ? 'Owner' : 'Member'}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Workspace</p>
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
                                '!z-[70010] !w-[18rem] !min-w-[18rem] !max-w-[18rem] pt-1.5',
                              organizationSwitcherPopoverCard:
                                '!z-[70011] !w-[18rem] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl shadow-black/5 ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30 dark:ring-white/10',
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

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <FontAwesomeIcon icon={faCrown} className="w-4 h-4 text-amber-500" />
                          <span className="text-neutral-300">
                            {activePlanName}
                          </span>
                        </div>

                        {shouldShowPersonalTokens && personalTokenCount != null && personalTokenName && (
                          <div className="flex items-center gap-2 text-sm">
                            <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-emerald-500" />
                            <span className="text-neutral-300">
                              {personalTokenCount.toLocaleString()} {personalTokenName} (Personal)
                            </span>
                          </div>
                        )}

                        {shouldShowSharedTokens && profile.sharedTokens && (
                          <div className="flex items-start gap-2 text-sm">
                            <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-[rgb(var(--accent-primary-rgb))]" />
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
                            <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-sky-500" />
                            <span className="text-neutral-300">
                              {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (Free)
                            </span>
                          </div>
                        )}

                        {expiresAt && (
                          <div className="flex items-center gap-2 text-xs text-neutral-400">
                            <FontAwesomeIcon icon={faCalendarDays} className="w-4 h-4" />
                            <span>Expires: {expiresAt}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Navigation Items - Grouped */}
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {filteredGroups.length > 0 ? (
                  // Grouped navigation
                  filteredGroups.map((group) => {
                      const isExpanded = renderedExpandedGroups.has(group.title);
                      const hasActiveItem = group.items.some((item) => {
                        return isActiveHref(item.href);
                      });
                    
                    return (
                      <div key={group.title} className="mb-2">
                        <button
                          onClick={() => toggleGroup(group.title)}
                          className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            isExpanded || hasActiveItem
                              ? 'text-neutral-100'
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          <span className="text-current">{group.title}</span>
                          <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="mt-1 space-y-1">
                            {group.items.map((item) => {
                              const active = isActiveHref(item.href);
                              return (
                                <TransientNavLink
                                  key={item.href}
                                  href={item.href}
                                  onClick={close}
                                  className={`group flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition ${
                                    active
                                      ? 'border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] bg-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.14))] text-neutral-100 shadow-sm'
                                      : 'border-transparent text-neutral-300 hover:border-[color:rgb(var(--border-primary))] hover:bg-neutral-900/60'
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    {item.icon && (
                                      <FontAwesomeIcon
                                        icon={item.icon}
                                        className={`h-3.5 w-3.5 transition ${
                                              active
                                                ? 'text-[rgb(var(--accent-primary-rgb))]'
                                                : 'text-neutral-500 group-hover:text-neutral-200'
                                        }`}
                                      />
                                    )}
                                    <span className="font-medium tracking-tight text-current">{item.label}</span>
                                  </span>
                                  {item.badge && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wide rounded-full bg-neutral-800 px-1.5 py-0.5 text-neutral-200">
                                      {item.badge}
                                    </span>
                                  )}
                                </TransientNavLink>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  (profile ? items.filter((it) => {
                    const section = hrefToSection(it.href);
                    if (!section) return false;
                    if (profile.user.role === 'ADMIN') return true;
                    if (profile.user.role === 'MODERATOR') {
                      if (section === 'overview') return true;
                      if (CLIENT_MODERATOR_SECTIONS.includes(section)) {
                        return Boolean(profile.permissions?.[section]);
                      }
                      return false;
                    }
                    return false;
                  }) : items).map((item) => {
                    const active = isActiveHref(item.href);
                    return (
                      <TransientNavLink
                        key={item.href}
                        href={item.href}
                        onClick={close}
                        className={`group flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition ${
                          active
                            ? 'border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] bg-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.14))] text-neutral-100 shadow-sm'
                            : 'border-transparent text-neutral-300 hover:border-[color:rgb(var(--border-primary))] hover:bg-neutral-900/60'
                        }`}
                        style={{ fontSize: '0.85rem' }}
                      >
                        <span className="flex items-center gap-2">
                          {item.icon && (
                            <FontAwesomeIcon
                              icon={item.icon}
                              className={`h-3.5 w-3.5 transition ${
                                  active
                                    ? 'text-[rgb(var(--accent-primary-rgb))]'
                                    : 'text-neutral-500 group-hover:text-neutral-200'
                              }`}
                            />
                          )}
                          <span className="font-medium tracking-tight text-current">{item.label}</span>
                        </span>
                        {item.badge && (
                          <span className={`text-[9px] font-semibold uppercase tracking-wide rounded-full ${
                            item.badge === 'NEW'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-neutral-800 text-neutral-200'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </TransientNavLink>
                    );
                  })
                )}
              </nav>

              {/* Sign Out Button */}
              <div className="border-t border-[color:rgb(var(--border-primary))] px-4 py-4">
                <AuthSignOutButton>
                  <button 
                    onClick={handleSignOut}
                    className="w-full rounded-full border border-[color:rgb(var(--border-primary))] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-neutral-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
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
