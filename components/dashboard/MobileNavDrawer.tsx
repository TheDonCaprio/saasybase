"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faGrip } from '@fortawesome/free-solid-svg-icons';
import type { NavItem } from './SidebarNav';
import { AuthSignOutButton } from '@/lib/auth-provider/client';

interface MobileNavDrawerProps {
  items: NavItem[];
  contextLabel: string;
  className?: string;
  signOutLabel?: string;
}

export function MobileNavDrawer({
  items,
  contextLabel,
  className,
  signOutLabel = 'Sign out'
}: MobileNavDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeItem = useMemo(() => {
    if (!pathname) return undefined;
    const matches = items.filter((item) => {
      if (!item.href) return false;
      if (item.href === '/dashboard') return pathname === '/dashboard';
      if (pathname === item.href) return true;
      return pathname.startsWith(item.href + '/');
    });
    if (!matches.length) return items.find(item => item.href === pathname);
    return matches.reduce((best, current) => (current.href.length > best.href.length ? current : best));
  }, [items, pathname]);

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

  const wrapperClass = className ? `w-full ${className}` : 'w-full';

  return (
    <div className={wrapperClass}>
      <header className="flex items-center justify-between gap-4 border-b border-[color:var(--theme-header-border)] bg-[color:var(--theme-header-bg)] px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:backdrop-blur-md text-[color:var(--theme-header-text)]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{contextLabel}</p>
          <p className="truncate text-sm font-semibold">
            {activeItem ? activeItem.label : 'Navigation'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:rgb(var(--border-primary))] bg-[color:rgb(var(--bg-secondary-rgb)/0.7)] text-neutral-100 transition hover:border-[color:rgb(var(--border-secondary))] hover:bg-[color:rgb(var(--bg-secondary-rgb)/1)]"
        >
          <FontAwesomeIcon icon={open ? faXmark : faGrip} className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </button>
      </header>

      {open && (() => {
        // create a portal container on first render and render the overlay + panel into it
        // we lazily create the portal element so it only exists on the client
        const portalEl = (() => {
          // local hook-like closure: create element on first call
          const wrapper = MobileNavDrawer as unknown as { __portalRef?: { current: HTMLDivElement | null }; __portalCleanup?: (() => void) };
          const ref = wrapper.__portalRef || { current: null };
          if (!ref.current) {
            const el = document.createElement('div');
            el.setAttribute('data-mobile-nav-portal', '');
            document.body.appendChild(el);
            ref.current = el;
            // attach cleanup on unload
            const cleanup = () => {
              if (ref.current && ref.current.parentNode) ref.current.parentNode.removeChild(ref.current);
              ref.current = null;
            };
            // store cleanup so it's not garbage collected (best-effort)
            wrapper.__portalCleanup = cleanup;
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
              id="mobile-nav-drawer"
              className="absolute inset-y-0 left-0 flex h-full w-[min(85vw,320px)] flex-col overflow-hidden border-r border-[color:rgb(var(--border-primary))] bg-[color:rgb(var(--bg-secondary))] text-neutral-100 shadow-2xl backdrop-blur-lg z-[60001]"
            >
              <div className="flex items-center justify-between border-b border-[color:rgb(var(--border-primary))] px-4 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{contextLabel}</p>
                  <p className="text-base font-semibold text-neutral-100">{activeItem ? activeItem.label : 'Navigation'}</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:rgb(var(--border-primary))] text-neutral-400 transition hover:border-[color:rgb(var(--border-secondary))] hover:text-neutral-100"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  <span className="sr-only">Close navigation</span>
                </button>
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {items.map((item) => {
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

              <div className="border-t border-[color:rgb(var(--border-primary))] px-4 py-4">
                <AuthSignOutButton>
                  <button className="w-full rounded-full border border-[color:rgb(var(--border-primary))] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-neutral-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300">
                    {signOutLabel}
                  </button>
                </AuthSignOutButton>
              </div>
            </div>
          </div>,
          portalEl
        );
      })()}
    </div>
  );
}
