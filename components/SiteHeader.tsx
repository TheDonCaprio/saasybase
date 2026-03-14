'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Brand from './Brand';
import { ThemeToggle } from './ThemeToggle';
import { ConditionalAccountMenu } from './ConditionalAccountMenu';
import { ConditionalDashboardDrawer } from './ConditionalDashboardDrawer';
import { ConditionalAdminDrawer } from './ConditionalAdminDrawer';
import { HeaderMobileMenu } from './HeaderMobileMenu';
import type { HeaderStyle, ThemeLink } from '../lib/settings';

export type HeaderLayoutSettings = {
  style: HeaderStyle;
  height: number;
  stickyEnabled: boolean;
  stickyScrollY: number;
  stickyHeight: number;
};

export function SiteHeader({
  siteName,
  siteLogo,
  siteLogoLight,
  siteLogoDark,
  logoHeight,
  aspectRatioCss,
  headerLinks,
  layout,
}: {
  siteName: string;
  siteLogo: string;
  siteLogoLight: string;
  siteLogoDark: string;
  logoHeight: number;
  aspectRatioCss: string;
  headerLinks: ThemeLink[];
  layout: HeaderLayoutSettings;
}) {
  const [isSticky, setIsSticky] = useState(false);

  const stickyStyles = isSticky
    ? {
        backgroundColor: 'var(--theme-sticky-header-bg)',
        color: 'var(--theme-sticky-header-text)',
        backdropFilter: 'blur(var(--theme-sticky-header-blur))',
        borderBottom: 'var(--theme-sticky-header-border-width) solid var(--theme-sticky-header-border)',
        boxShadow: 'var(--theme-sticky-header-shadow)',
      }
    : {
        backgroundColor: 'var(--theme-header-bg)',
        color: 'var(--theme-header-text)',
        backdropFilter: 'blur(var(--theme-header-blur))',
        borderBottom: 'var(--theme-header-border-width) solid var(--theme-header-border)',
        boxShadow: 'var(--theme-header-shadow)',
      };
  useEffect(() => {
    if (!layout.stickyEnabled) {
      setIsSticky(false);
      return;
    }

    const onScroll = () => {
      const y = window.scrollY || 0;
      setIsSticky(y >= (layout.stickyScrollY || 0));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [layout.stickyEnabled, layout.stickyScrollY]);

  const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  };

  const normalHeight = clampInt(layout.height, 48, 160, 80);
  const stickyHeight = clampInt(layout.stickyHeight, 40, 160, 64);
  const currentHeight = isSticky ? stickyHeight : normalHeight;

  useEffect(() => {
    const root = document.documentElement;
    if (isSticky) {
      root.style.setProperty('--sticky-header-height', `${currentHeight}px`);
    } else {
      root.style.setProperty('--sticky-header-height', '0px');
    }
  }, [isSticky, currentHeight]);

  const headerPositionClass = isSticky ? 'fixed top-0 left-0 right-0' : 'relative';

  const renderNavLink = useMemo(() => {
    const className = isSticky
      ? 'text-[color:var(--theme-sticky-header-text)] transition-opacity hover:opacity-90'
      : 'text-[color:var(--theme-header-text)] transition-opacity hover:opacity-90';

    return (link: ThemeLink) => {
      const isExternal = /^https?:\/\//i.test(link.href);
      if (isExternal) {
        return (
          <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer" className={className}>
            {link.label}
          </a>
        );
      }
      return (
        <Link key={`${link.label}-${link.href}`} href={link.href} className={className}>
          {link.label}
        </Link>
      );
    };
  }, [isSticky]);

  const nav = headerLinks.length ? (
    <nav
      className={
        isSticky
          ? 'hidden lg:flex gap-4 text-[color:var(--theme-sticky-header-text)]'
          : 'hidden lg:flex gap-4 text-[color:var(--theme-header-text)]'
      }
      style={{
        fontSize: 'var(--theme-header-menu-font-size)',
        fontWeight: 'var(--theme-header-menu-font-weight)',
      }}
    >
      {headerLinks.map(renderNavLink)}
    </nav>
  ) : null;

  const actions = (
    <div className="flex items-center gap-4">
      <ThemeToggle />
      <ConditionalAccountMenu />
      <ConditionalDashboardDrawer />
      <ConditionalAdminDrawer />
      {headerLinks.length ? <HeaderMobileMenu links={headerLinks} /> : null}
    </div>
  );

  return (
    <>
      {isSticky ? <div aria-hidden style={{ height: currentHeight }} /> : null}
      <header
        className={`px-6 flex items-center bg-[color:var(--theme-header-bg)] backdrop-blur z-40 ${headerPositionClass}`}
        style={{ minHeight: currentHeight, height: currentHeight, ...stickyStyles }}
      >
        {layout.style === 'center-nav' ? (
          <div className="flex w-full items-center">
            <a href="/" className="font-semibold text-lg flex items-center gap-3">
              <LogoBlock
                siteName={siteName}
                siteLogo={siteLogo}
                siteLogoLight={siteLogoLight}
                siteLogoDark={siteLogoDark}
                logoHeight={logoHeight}
                aspectRatioCss={aspectRatioCss}
              />
            </a>
            <div className="flex-1 flex items-center justify-center">{nav}</div>
            {actions}
          </div>
        ) : layout.style === 'left-nav' ? (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-6">
              <a href="/" className="font-semibold text-lg flex items-center gap-3">
                <LogoBlock
                  siteName={siteName}
                  siteLogo={siteLogo}
                  siteLogoLight={siteLogoLight}
                  siteLogoDark={siteLogoDark}
                  logoHeight={logoHeight}
                  aspectRatioCss={aspectRatioCss}
                />
              </a>
              {nav}
            </div>
            {actions}
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <a href="/" className="font-semibold text-lg flex items-center gap-3">
              <LogoBlock
                siteName={siteName}
                siteLogo={siteLogo}
                siteLogoLight={siteLogoLight}
                siteLogoDark={siteLogoDark}
                logoHeight={logoHeight}
                aspectRatioCss={aspectRatioCss}
              />
            </a>
            <div className="flex items-center gap-4">
              {nav}
              {actions}
            </div>
          </div>
        )}
      </header>
    </>
  );
}

function LogoBlock({
  siteName,
  siteLogo,
  siteLogoLight,
  siteLogoDark,
  logoHeight,
  aspectRatioCss,
}: {
  siteName: string;
  siteLogo: string;
  siteLogoLight: string;
  siteLogoDark: string;
  logoHeight: number;
  aspectRatioCss: string;
}) {
  return (
    <>
      {siteLogoLight ? (
        <div className="relative inline-block dark:hidden" style={{ height: logoHeight, aspectRatio: aspectRatioCss }}>
          <Image
            src={siteLogoLight}
            alt={siteName || 'YourApp'}
            fill
            style={{ objectFit: 'contain' }}
            sizes="(max-width: 768px) 100px, 200px"
            priority
          />
        </div>
      ) : null}
      {siteLogoDark ? (
        <div className="relative hidden dark:inline-block" style={{ height: logoHeight, aspectRatio: aspectRatioCss }}>
          <Image
            src={siteLogoDark}
            alt={siteName || 'YourApp'}
            fill
            style={{ objectFit: 'contain' }}
            sizes="(max-width: 768px) 100px, 200px"
            priority
          />
        </div>
      ) : null}

      {!siteLogoLight && !siteLogoDark && siteLogo ? (
        <div className="relative inline-block" style={{ height: logoHeight, aspectRatio: aspectRatioCss }}>
          <Image
            src={siteLogo}
            alt={siteName || 'YourApp'}
            fill
            style={{ objectFit: 'contain' }}
            sizes="(max-width: 768px) 100px, 200px"
            priority
          />
        </div>
      ) : null}

      {!siteLogo && !siteLogoLight && !siteLogoDark ? <Brand siteName={siteName} /> : null}
    </>
  );
}
