"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faUserShield, faChevronDown, faCrown, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from '../dashboard/SidebarNav';
import { SignOutButton, useUser, useClerk, useAuth } from '@clerk/nextjs';
import { createPortal } from 'react-dom';

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
  const { isSignedIn } = useUser();
  const { orgId } = useAuth();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

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

  const toggle = useCallback(() => setOpen(prev => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const toggleGroup = useCallback((groupTitle: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupTitle)) next.delete(groupTitle); else next.add(groupTitle);
      return next;
    });
  }, []);

  // Auto-expand group containing active item
  useEffect(() => {
    if (groups && activeItem) {
      const activeGroup = groups.find(g => g.items.some(item => item.href === activeItem.href));
      if (activeGroup) {
        setExpandedGroups(prev => {
          if (prev.has(activeGroup.title)) return prev;
          const next = new Set(prev);
          next.add(activeGroup.title);
          return next;
        });
      }
    }
  }, [activeItem, groups]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
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
    setOpen(false);
  }, [pathname]);

  // Invalidate cached profile when active organization changes
  useEffect(() => {
    setProfile(null);
  }, [orgId]);

  useEffect(() => {
    if (isSignedIn && open && !profile && !loading) {
      setLoading(true);
      fetch('/api/user/profile')
        .then((res) => res.json())
        .then((data) => {
          setProfile(data);
        })
        .catch((err) => {
          console.error('Failed to fetch profile:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isSignedIn, open, profile, loading]);

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
    setProfile(null);
  };

  const wrapperClass = className ? `${className}` : '';
  const displayGroups = groups || [];
  const personalTokenCount = profile?.subscription?.tokens.remaining ?? null;
  const sharedTokenCount = profile?.sharedTokens?.remaining ?? null;
  const hasPersonalTokens = (personalTokenCount ?? 0) > 0;
  const hasSharedTokens = (sharedTokenCount ?? 0) > 0;
  const shouldShowPersonalTokens = Boolean(
    profile?.subscription && hasPersonalTokens && (!profile?.sharedTokens || personalTokenCount !== sharedTokenCount)
  );
  const shouldShowSharedTokens = Boolean(profile?.sharedTokens && hasSharedTokens);
  const expiresAt = profile?.subscription?.expiresAt ?? profile?.organization?.expiresAt ?? null;

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

      {open && (() => {
        const portalEl = (() => {
          const wrapper = AdminHeaderDrawer as unknown as { __portalRef?: { current: HTMLDivElement | null } };
          const ref = wrapper.__portalRef || { current: null };
          if (!ref.current) {
            const el = document.createElement('div');
            el.setAttribute('data-admin-drawer-portal', '');
            document.body.appendChild(el);
            ref.current = el;
          }
          wrapper.__portalRef = ref;
          return ref.current;
        })();

        if (!portalEl) return null;

        return createPortal(
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
              className="absolute inset-y-0 left-0 flex h-full w-[min(85vw,320px)] flex-col overflow-hidden border-r border-[color:rgb(var(--border-primary))] bg-[color:var(--theme-sidebar-bg)] text-neutral-100 shadow-2xl backdrop-blur-lg z-[60001]"
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
                        <div className="flex items-center gap-2 text-sm">
                          <FontAwesomeIcon icon={faCrown} className="w-4 h-4 text-amber-500" />
                          <span className="text-neutral-300">
                            {profile.subscription?.planName || profile.organization?.planName || 'Free Plan'}
                          </span>
                        </div>

                        {shouldShowPersonalTokens && profile.subscription && (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-emerald-500" />
                              <span className="text-neutral-300">
                                {profile.subscription.tokens.remaining.toLocaleString()} {profile.subscription.tokenName} remaining
                              </span>
                            </div>
                          </>
                        )}

                        {shouldShowSharedTokens && profile.sharedTokens && (
                          <div className="flex items-start gap-2 text-sm">
                            <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-[rgb(var(--accent-primary-rgb))]" />
                            <div>
                              <span className="text-neutral-300">
                                {profile.sharedTokens.remaining.toLocaleString()} {profile.sharedTokens.tokenName}
                                {profile.organization ? ` (${profile.organization.name} workspace)` : ' (workspace)'}
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
                              {profile.freeTokens.remaining.toLocaleString()} {profile.freeTokens.tokenName || 'tokens'} (free)
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
                      const isExpanded = expandedGroups.has(group.title);
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
                                <Link
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
                                </Link>
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
                      <Link
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
                      </Link>
                    );
                  })
                )}
              </nav>

              {/* Sign Out Button */}
              <div className="border-t border-[color:rgb(var(--border-primary))] px-4 py-4">
                <SignOutButton>
                  <button 
                    onClick={handleSignOut}
                    className="w-full rounded-full border border-[color:rgb(var(--border-primary))] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-neutral-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                  >
                    {signOutLabel}
                  </button>
                </SignOutButton>
              </div>
            </div>
          </div>,
          portalEl
        );
      })()}
    </>
  );
}
