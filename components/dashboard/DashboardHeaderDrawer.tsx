"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faXmark, faUser, faBars, faFileInvoiceDollar, faSackDollar } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from './SidebarNav';
import { AuthSignOutButton, useAuthUser, useAuthInstance } from '@/lib/auth-provider/client';
import { createPortal } from 'react-dom';
import { TransientNavLink } from '@/components/ui/TransientNavLink';
import { useUserProfile } from '@/components/UserProfileProvider';
import { SharedDrawerAccountSection } from '@/components/drawer/SharedDrawerAccountSection';

const ACCOUNT_DRAWER_PATHS = new Set([
  '/dashboard/profile',
  '/dashboard/plan',
  '/dashboard/billing',
  '/dashboard/transactions',
]);

interface DashboardHeaderDrawerProps {
  items: NavItem[];
  contextLabel: string;
  className?: string;
  signOutLabel?: string;
}

interface DrawerShortcut {
  href: string;
  label: string;
  icon: IconDefinition;
}

const ACCOUNT_DRAWER_SHORTCUTS: DrawerShortcut[] = [
  { href: '/dashboard/profile', label: 'Profile & Settings', icon: faUser },
  { href: '/dashboard/plan', label: 'Plan', icon: faBars },
  { href: '/dashboard/billing', label: 'Billing', icon: faFileInvoiceDollar },
  { href: '/dashboard/transactions', label: 'Transactions', icon: faSackDollar },
];

export function DashboardHeaderDrawer({
  items,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: DashboardHeaderDrawerProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuthUser();
  const { signOut } = useAuthInstance();
  const { ensureProfile, loaded: profileLoadedForOrg, loading: profileLoading, profile, resetProfile } = useUserProfile();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const [manualDetailsExpanded, setManualDetailsExpanded] = useState(false);
  const open = openPathname === pathname;
  const loading = isSignedIn && open && (!profileLoadedForOrg || profileLoading);

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

  const isAccountRoute = ACCOUNT_DRAWER_PATHS.has(pathname) || Array.from(ACCOUNT_DRAWER_PATHS).some((basePath) => pathname.startsWith(`${basePath}/`));
  const detailsExpanded = isAccountRoute || manualDetailsExpanded;

  const toggle = useCallback(() => {
    setOpenPathname(prev => (prev === pathname ? null : pathname));
  }, [pathname]);
  const close = useCallback(() => {
    setOpenPathname(null);
    setManualDetailsExpanded(false);
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
  const accountShortcuts = useMemo(() => ACCOUNT_DRAWER_SHORTCUTS.map((item) => ({
    ...item,
    label: item.href === '/dashboard/plan'
      ? profile?.planActionLabel ?? (profile?.planSource === 'FREE' ? 'Upgrade' : 'Change Plan')
      : item.label,
  })), [profile?.planActionLabel, profile?.planSource]);
  const mainNavItems = useMemo(() => displayItems.filter((item) => !ACCOUNT_DRAWER_PATHS.has(item.href)), [displayItems]);

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
            className="absolute inset-0 bg-black/40"
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            id="dashboard-header-drawer"
            className="absolute inset-y-0 left-0 flex h-full w-[min(85vw,320px)] flex-col overflow-hidden border-r border-[color:rgb(var(--border-primary))] bg-[color:rgb(var(--bg-secondary))] text-neutral-100 shadow-2xl z-[60001]"
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

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isSignedIn && (
                <div className="border-b border-[color:rgb(var(--border-primary))] bg-neutral-900/50">
                  <SharedDrawerAccountSection
                    profile={profile}
                    loading={loading}
                    detailsExpanded={detailsExpanded}
                    currentPath={pathname}
                    onToggleDetails={() => setManualDetailsExpanded((prev) => !prev)}
                    onClose={close}
                    accountShortcuts={accountShortcuts}
                  />

                </div>
              )}

              <nav className="flex flex-col gap-1 px-3 py-3">
                {mainNavItems.map((item) => {
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
                      className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-[0.95rem] transition ${
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
              </div>

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
