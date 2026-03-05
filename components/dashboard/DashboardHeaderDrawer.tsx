"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faUser, faCrown, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from './SidebarNav';
import { SignOutButton, useUser, useClerk, useAuth } from '@clerk/nextjs';
import { createPortal } from 'react-dom';

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

export function DashboardHeaderDrawer({
  items,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: DashboardHeaderDrawerProps) {
  const pathname = usePathname();
  const { isSignedIn } = useUser();
  const { orgId } = useAuth();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const displayItems = useMemo(() => {
    const planSource = profile?.planSource;
    if (!planSource) return items;
    const planLabel = planSource === 'FREE' ? 'Upgrade' : 'Change Plan';
    return items.map((item) => (item.href === '/dashboard/plan' ? { ...item, label: planLabel } : item));
  }, [items, profile?.planSource]);

  const activeItem = useMemo(() => {
    if (!pathname) return undefined;
    const matches = displayItems.filter((item) => {
      if (!item.href) return false;
      if (item.href === '/dashboard') return pathname === '/dashboard';
      if (pathname === item.href) return true;
      return pathname.startsWith(item.href + '/');
    });
    if (!matches.length) return displayItems.find((item) => item.href === pathname);
    return matches.reduce((best, current) => (current.href.length > best.href.length ? current : best));
  }, [displayItems, pathname]);

  const toggle = useCallback(() => setOpen(prev => !prev), []);
  const close = useCallback(() => setOpen(false), []);

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
  const personalTokenCount = profile?.subscription?.tokens.remaining ?? profile?.paidTokens?.remaining ?? null;
  const personalTokenName = profile?.subscription?.tokenName ?? profile?.paidTokens?.tokenName ?? null;
  const hasPersonalTokens = (personalTokenCount ?? 0) > 0;
  const shouldShowPersonalTokens = Boolean(hasPersonalTokens);
  const shouldShowSharedTokens = Boolean(profile?.sharedTokens);
  const expiresAt = profile?.subscription?.expiresAt ?? profile?.organization?.expiresAt ?? null;

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

      {open && (() => {
        const portalEl = (() => {
          const wrapper = DashboardHeaderDrawer as unknown as { __portalRef?: { current: HTMLDivElement | null } };
          const ref = wrapper.__portalRef || { current: null };
          if (!ref.current) {
            const el = document.createElement('div');
            el.setAttribute('data-dashboard-drawer-portal', '');
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
              id="dashboard-header-drawer"
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
                        <p className="font-semibold text-neutral-100 truncate">
                          {profile.user.name}
                        </p>
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

                        {shouldShowPersonalTokens && personalTokenCount != null && personalTokenName && (
                          <div className="flex items-center gap-2 text-sm">
                            <FontAwesomeIcon icon={faCoins} className="w-4 h-4 text-emerald-500" />
                            <span className="text-neutral-300">
                              {personalTokenCount.toLocaleString()} {personalTokenName} remaining
                            </span>
                          </div>
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

                        {!profile.subscription && !profile.sharedTokens && (
                          <Link
                            href="/pricing"
                            className="block text-sm text-[rgb(var(--accent-primary-rgb))] hover:text-[rgb(var(--accent-hover-rgb))]"
                            onClick={close}
                          >
                            Upgrade to Pro →
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {displayItems.map((item) => {
                  const active = !!(
                    item.href &&
                    (item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname === item.href || pathname.startsWith(item.href + '/'))
                  );
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      className={`group flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm transition ${
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
                    </Link>
                  );
                })}
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
