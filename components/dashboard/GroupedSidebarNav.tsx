"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

export interface NavItem { href: string; label: string; badge?: string; adminOnly?: boolean; icon?: IconProp }

export interface NavGroup {
  title: string;
  items: NavItem[];
}

type SidebarProfile = {
  user: {
    id: string;
    role: string;
  };
  permissions?: Record<string, boolean>;
};

export function GroupedSidebarNav({ groups, items }: { groups?: NavGroup[], items?: NavItem[] }) {
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const CLIENT_MODERATOR_SECTIONS = [
    'users',
    'transactions',
    'purchases',
    'subscriptions',
    'support',
    'notifications',
    'blog',
    'analytics',
    'traffic'
  ];

  function hrefToSection(href?: string): string | null {
    if (!href) return null;
    if (href === '/admin' || href === '/admin/') return 'overview';
    const m = href.match(/^\/admin\/(?<seg>[^\/]+)(?:\/.*)?$/);
    if (!m || !m.groups) return null;
    return m.groups.seg || null;
  }

  const isActiveHref = useCallback(
    (href?: string) => {
      if (!href) return false;
      if (href === '/dashboard') return pathname === '/dashboard';
      if (href === '/admin') return pathname === '/admin';
      return pathname === href || pathname.startsWith(href + '/');
    },
    [pathname]
  );

  useEffect(() => {
    if (isSignedIn && !profile && !loading) {
      setLoading(true);
      fetch('/api/user/profile')
        .then((r) => r.json())
        .then((data) => setProfile(data))
        .catch((err) => console.error('Failed to fetch profile:', err))
        .finally(() => setLoading(false));
    }
  }, [isSignedIn, profile, loading]);

  const defaultExpandedGroups = useMemo(() => {
    const s = new Set<string>();
    if (!groups || !pathname) return s;
    for (const g of groups) {
      const has = g.items.some((item) => isActiveHref(item.href));
      if (has) s.add(g.title);
    }
    return s;
  }, [groups, pathname, isActiveHref]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(defaultExpandedGroups));

  const renderIcon = (icon?: IconProp) => {
    if (!icon) return null;
    return <FontAwesomeIcon icon={icon} className="w-4 h-4" />;
  };

  // Ensure active group's section becomes expanded on navigation
  useEffect(() => {
    if (groups) {
      const activeGroup = groups.find((g) =>
        g.items.some((item) => isActiveHref(item.href))
      );
      if (activeGroup) {
        setExpandedGroups(prev => {
          if (prev.has(activeGroup.title)) return prev;
          const next = new Set(prev);
          next.add(activeGroup.title);
          return next;
        });
      }
    }
  }, [pathname, groups, isActiveHref]);

  // Toggle group — allow collapsing even if it contains the active item
  const toggleGroup = useCallback((groupTitle: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupTitle)) next.delete(groupTitle); else next.add(groupTitle);
      return next;
    });
  }, []);

  // Determine filtered groups based on profile/permissions. If profile is
  // not yet available, fall back to the provided groups to avoid UI flash.
  const displayGroups = (() => {
    if (!groups) return [] as NavGroup[];
    if (!profile) return groups;
    const role = profile?.user?.role;
    if (role === 'ADMIN') return groups;
    if (role === 'MODERATOR') {
      const perms = profile.permissions || {};
      const out: NavGroup[] = [];
      for (const g of groups) {
        const items = g.items.filter((item) => {
          const section = hrefToSection(item.href);
          if (!section) return false;
          if (section === 'overview') return true;
          if (CLIENT_MODERATOR_SECTIONS.includes(section)) {
            return Boolean(perms[section]);
          }
          return false;
        });
        if (items.length) out.push({ ...g, items });
      }
      return out;
    }
    return [] as NavGroup[];
  })();

  // If groups are provided, render grouped navigation
  if (displayGroups && displayGroups.length > 0) {
    return (
      <nav className="space-y-3">
        {displayGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.title);
          const hasActiveItem = group.items.some((item) => isActiveHref(item.href));

          return (
            <div key={group.title}>
              <button
                onClick={() => toggleGroup(group.title)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs font-semibold transition ${
                  isExpanded || hasActiveItem
                    ? 'text-white'
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
              >
                <span className="text-current">{group.title}</span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isExpanded && (
                <div className="mt-1 space-y-1 pl-1">
                  {group.items.map((item) => {
                    const active = isActiveHref(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 transition ${
                                  active
                                    ? 'bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-100'
                                    : 'text-slate-500 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800/50'
                                }`}
                        style={{ fontSize: '0.85rem' }}
                      >
                        <span className="flex items-center gap-2">
                          {item.icon && (
                            <FontAwesomeIcon
                              icon={item.icon}
                              className={`h-3.5 w-3.5 transition ${
                                active
                                  ? 'text-violet-600 dark:text-violet-400'
                                  : 'text-slate-300 dark:text-neutral-500'
                              }`}
                            />
                          )}
                          <span className="font-medium tracking-tight text-current">{item.label}</span>
                        </span>
                        {item.badge && (
                          <span className={`text-[9px] font-semibold uppercase tracking-wide rounded-full ${
                            item.badge === 'NEW'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-neutral-700 dark:text-neutral-300'
                          }`}>
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
        })}
      </nav>
    );
  }

  // Fallback: render flat items
  if (items && items.length > 0) {
    const visibleItems = (() => {
      if (!profile) return items;
      const role = profile?.user?.role;
      if (role === 'ADMIN') return items;
      if (role === 'MODERATOR') {
        const perms = profile.permissions || {};
        return items.filter((it) => {
          const section = hrefToSection(it.href);
          if (!section) return false;
          if (section === 'overview') return true;
          if (CLIENT_MODERATOR_SECTIONS.includes(section)) return Boolean(perms[section]);
          return false;
        });
      }
      return [] as NavItem[];
    })();

    return (
      <nav className="space-y-1">
        {visibleItems.map((it) => {
          const active = isActiveHref(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center justify-between gap-2 rounded px-3 py-2 text-sm border transition ${
                active
                  ? 'bg-violet-600/20 text-violet-200 border-violet-500/30'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                {renderIcon(it.icon)}
                <span>{it.label}</span>
              </span>
              {it.badge && (
                <span
                  className={`text-[10px] rounded px-1.5 py-0.5 ${
                    it.badge === 'NEW'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {it.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return null;
}
