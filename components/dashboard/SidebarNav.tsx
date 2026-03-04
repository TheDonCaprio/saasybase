"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

export interface NavItem { href: string; label: string; badge?: string; adminOnly?: boolean; icon?: IconProp }

type SidebarProfile = {
  user: {
    id: string;
    role: string;
  };
  permissions?: Record<string, boolean>;
  planSource?: 'PERSONAL' | 'ORGANIZATION' | 'FREE';
};

export function SidebarNav({ items }: { items: NavItem[] }) {
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
    'traffic',
    'organizations'
  ];

  function hrefToSection(href?: string): string | null {
    if (!href) return null;
    if (href === '/admin' || href === '/admin/') return 'overview';
    const m = href.match(/^\/admin\/(?<seg>[^\/]+)(?:\/.*)?$/);
    if (!m || !m.groups) return null;
    return m.groups.seg || null;
  }

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

  const visibleItems = (() => {
    if (!items) return [] as NavItem[];
    if (!profile) return items;
    const role = profile?.user?.role;
    if (role === 'ADMIN') return items;
    if (role === 'MODERATOR') {
      const perms = profile.permissions || {};
      return items.filter((it) => {
        if (it.adminOnly) return false;
        const section = hrefToSection(it.href);
        if (!section) return false;
        if (section === 'overview') return true;
        if (CLIENT_MODERATOR_SECTIONS.includes(section)) return Boolean(perms[section]);
        return false;
      });
    }
    // Registered/non-privileged users should still see the default list minus admin-only links
    return items.filter((it) => !it.adminOnly);
  })();

  return (
    <nav className="space-y-1">
      {visibleItems.map(it => {
        const label = (() => {
          if (it.href !== '/dashboard/plan') return it.label;
          if (!profile?.planSource) return it.label;
          return profile.planSource === 'FREE' ? 'Upgrade' : 'Change Plan';
        })();
        const active = (() => {
          if (!it.href) return false;
          // Avoid highlighting the dashboard root item on every subpage.
          if (it.href === '/dashboard') return pathname === '/dashboard';
          return pathname === it.href || pathname.startsWith(it.href + '/');
        })();
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 transition ${
              active
                ? 'bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.10))] text-slate-900 dark:bg-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.16))] dark:text-neutral-50'
                : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-neutral-800/50'
            }`}
            style={{ fontSize: '0.85rem' }}
          >
            <span className="flex items-center gap-2">
              {it.icon && (
                <FontAwesomeIcon
                  icon={it.icon}
                  className={`h-3.5 w-3.5 transition ${
                    active
                      ? 'text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.90))] dark:text-[color:rgb(var(--accent-primary-rgb)_/_calc(var(--accent-primary-a)*0.95))]'
                      : 'text-slate-400 dark:text-neutral-600'
                  }`}
                />
              )}
              <span className="font-medium tracking-tight text-current">{label}</span>
            </span>
            {it.badge && (
              <span className={`text-[9px] font-semibold uppercase tracking-wide rounded-full ${
                it.badge === 'NEW'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-700 dark:bg-neutral-700 dark:text-neutral-300'
              }`}>
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
