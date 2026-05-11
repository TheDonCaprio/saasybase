"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faXmark, faUserShield } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from '../dashboard/SidebarNav';
import { AuthSignOutButton, useAuthUser, useAuthInstance } from '@/lib/auth-provider/client';
import { createPortal } from 'react-dom';
import { TransientNavLink } from '@/components/ui/TransientNavLink';
import { useUserProfile } from '@/components/UserProfileProvider';
import { SharedDrawerAccountSection } from '@/components/drawer/SharedDrawerAccountSection';

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

export function AdminHeaderDrawer({
  items,
  groups,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: AdminHeaderDrawerProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const { signOut } = useAuthInstance();
  const { ensureProfile, loaded: profileLoadedForOrg, loading: profileLoading, profile, resetProfile } = useUserProfile();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const open = openPathname === pathname;
  const loading = isSignedIn && open && (!profileLoadedForOrg || profileLoading);

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
    setDetailsExpanded(false);
  }, []);

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
    if (isSignedIn && open && !profile && !profileLoading) {
      void ensureProfile();
    }
  }, [ensureProfile, isSignedIn, open, profile, profileLoading]);

  const handleSignOut = async () => {
    await signOut();
    setOpenPathname(null);
    resetProfile();
  };

  const wrapperClass = className ? `${className}` : '';
  const displayGroups = groups || [];

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
              className="absolute inset-0 bg-black/40"
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              id="admin-header-drawer"
              className="absolute inset-y-0 left-0 flex h-full w-[min(85vw,320px)] flex-col overflow-visible border-r border-[color:rgb(var(--border-primary))] bg-[color:rgb(var(--bg-secondary))] text-neutral-100 shadow-2xl z-[60001]"
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
                  <SharedDrawerAccountSection
                    profile={profile}
                    loading={loading}
                    detailsExpanded={detailsExpanded}
                    currentPath={pathname}
                    onToggleDetails={() => setDetailsExpanded((prev) => !prev)}
                    onClose={close}
                    roleBadge={
                      profile ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                          {profile.user.role}
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              )}

              {/* Navigation Items - Grouped */}
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
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
                          className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-[0.82rem] font-semibold transition ${
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
                                  className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[0.91rem] transition ${
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
                        className={`group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition ${
                          active
                            ? 'border-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.35))] bg-[rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.14))] text-neutral-100 shadow-sm'
                            : 'border-transparent text-neutral-300 hover:border-[color:rgb(var(--border-primary))] hover:bg-neutral-900/60'
                        }`}
                        style={{ fontSize: '0.91rem' }}
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
