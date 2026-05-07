'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Brand from './Brand';
import { ThemeToggle } from './ThemeToggle';
import { ConditionalAccountMenu } from './ConditionalAccountMenu';
import { ConditionalDashboardDrawer } from './ConditionalDashboardDrawer';
import { ConditionalAdminDrawer } from './ConditionalAdminDrawer';
import { HeaderMobileMenu } from './HeaderMobileMenu';
import type { HeaderStyle, ThemeLink } from '../lib/settings';
import { adminOnlyPublicSiteMode } from '@/lib/admin-only-public-site';

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
  const [headerBlurPx, setHeaderBlurPx] = useState<number | null>(null);
  const [stickyHeaderBlurPx, setStickyHeaderBlurPx] = useState<number | null>(null);
  const visibleHeaderLinks = adminOnlyPublicSiteMode
    ? headerLinks.filter((link) => link.href !== '/pricing')
    : headerLinks;
  const stickyActive = layout.stickyEnabled && isSticky;
  const stickyOverlayClassName = !layout.stickyEnabled
    ? '-translate-y-full opacity-0 pointer-events-none'
    : stickyActive
      ? 'translate-y-0 opacity-100'
      : '-translate-y-full opacity-0 pointer-events-none';

  useEffect(() => {
    const root = document.documentElement;

    const syncBlurValues = () => {
      const computedStyle = window.getComputedStyle(root);
      const readBlur = (variableName: string) => {
        const rawValue = computedStyle.getPropertyValue(variableName).trim();
        const numericValue = Number.parseFloat(rawValue);
        return Number.isFinite(numericValue) ? numericValue : null;
      };

      setHeaderBlurPx(readBlur('--theme-header-blur'));
      setStickyHeaderBlurPx(readBlur('--theme-sticky-header-blur'));
    };

    syncBlurValues();

    const observer = new MutationObserver(syncBlurValues);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const normalStyles = {
    backgroundColor: 'var(--theme-header-bg)',
    color: 'var(--theme-header-text)',
    backdropFilter: headerBlurPx != null ? `blur(${headerBlurPx}px)` : undefined,
    WebkitBackdropFilter: headerBlurPx != null ? `blur(${headerBlurPx}px)` : undefined,
    borderBottom: 'var(--theme-header-border-width) solid var(--theme-header-border)',
    boxShadow: 'var(--theme-header-shadow)',
  };
  const stickyStyles = {
    backgroundColor: 'var(--theme-sticky-header-bg)',
    color: 'var(--theme-sticky-header-text)',
    backdropFilter: stickyHeaderBlurPx != null ? `blur(${stickyHeaderBlurPx}px)` : undefined,
    WebkitBackdropFilter: stickyHeaderBlurPx != null ? `blur(${stickyHeaderBlurPx}px)` : undefined,
    borderBottom: 'var(--theme-sticky-header-border-width) solid var(--theme-sticky-header-border)',
    boxShadow: 'var(--theme-sticky-header-shadow)',
  };
  useEffect(() => {
    if (!layout.stickyEnabled) {
      return;
    }

    const onScroll = () => {
      const y = window.scrollY || 0;
      setIsSticky(y >= (layout.stickyScrollY || 0));
    };

    const initialMeasure = window.requestAnimationFrame(onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(initialMeasure);
      window.removeEventListener('scroll', onScroll);
    };
  }, [layout.stickyEnabled, layout.stickyScrollY]);

  const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
    const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, Math.round(num)));
  };

  const normalHeight = clampInt(layout.height, 48, 160, 60);
  const stickyHeight = clampInt(layout.stickyHeight, 40, 160, 50);

  useEffect(() => {
    const root = document.documentElement;
    if (stickyActive) {
      root.style.setProperty('--sticky-header-height', `${stickyHeight}px`);
    } else {
      root.style.setProperty('--sticky-header-height', '0px');
    }
  }, [stickyActive, stickyHeight]);

  const renderNavLink = (link: ThemeLink, sticky: boolean) => {
    const navLinkClassName = sticky
      ? 'text-[color:var(--theme-sticky-header-text)] transition-opacity hover:opacity-90'
      : 'text-[color:var(--theme-header-text)] transition-opacity hover:opacity-90';

    const isExternal = /^https?:\/\//i.test(link.href);
    if (isExternal) {
      return (
        <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer" className={navLinkClassName}>
          {link.label}
        </a>
      );
    }
    return (
      <Link key={`${link.label}-${link.href}`} href={link.href} className={navLinkClassName}>
        {link.label}
      </Link>
    );
  };

  const actions = (
    <div className="flex items-center gap-4">
      <ThemeToggle />
      <ConditionalAccountMenu />
      <ConditionalDashboardDrawer />
      <ConditionalAdminDrawer />
      {visibleHeaderLinks.length ? <HeaderMobileMenu links={visibleHeaderLinks} /> : null}
    </div>
  );

  const renderHeaderInner = (sticky: boolean) => {
    const nav = visibleHeaderLinks.length ? (
      <nav
        className={
          sticky
            ? 'hidden lg:flex gap-4 text-[color:var(--theme-sticky-header-text)]'
            : 'hidden lg:flex gap-4 text-[color:var(--theme-header-text)]'
        }
        style={{
          fontSize: 'var(--theme-header-menu-font-size)',
          fontWeight: 'var(--theme-header-menu-font-weight)',
        }}
      >
        {visibleHeaderLinks.map((link) => renderNavLink(link, sticky))}
      </nav>
    ) : null;

    if (layout.style === 'center-nav') {
      return (
        <div className="flex w-full items-center">
          <Link href="/" className="font-semibold text-lg flex items-center gap-3">
            <LogoBlock
              siteName={siteName}
              siteLogo={siteLogo}
              siteLogoLight={siteLogoLight}
              siteLogoDark={siteLogoDark}
              logoHeight={logoHeight}
              aspectRatioCss={aspectRatioCss}
            />
          </Link>
          <div className="flex-1 flex items-center justify-center">{nav}</div>
          {actions}
        </div>
      );
    }

    if (layout.style === 'left-nav') {
      return (
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold text-lg flex items-center gap-3">
              <LogoBlock
                siteName={siteName}
                siteLogo={siteLogo}
                siteLogoLight={siteLogoLight}
                siteLogoDark={siteLogoDark}
                logoHeight={logoHeight}
                aspectRatioCss={aspectRatioCss}
              />
            </Link>
            {nav}
          </div>
          {actions}
        </div>
      );
    }

    return (
      <div className="flex w-full items-center justify-between">
        <Link href="/" className="font-semibold text-lg flex items-center gap-3">
          <LogoBlock
            siteName={siteName}
            siteLogo={siteLogo}
            siteLogoLight={siteLogoLight}
            siteLogoDark={siteLogoDark}
            logoHeight={logoHeight}
            aspectRatioCss={aspectRatioCss}
          />
        </Link>
        <div className="flex items-center gap-4">
          {nav}
          {actions}
        </div>
      </div>
    );
  };

  return (
    <>
      <header
        className="relative z-40 flex items-center px-6 bg-[color:var(--theme-header-bg)] backdrop-blur transition-[background-color,border-color,box-shadow] duration-300"
        style={{ minHeight: normalHeight, height: normalHeight, ...normalStyles }}
      >
        {renderHeaderInner(false)}
      </header>
      <header
        className={`fixed left-0 right-0 top-0 z-50 flex items-center px-6 backdrop-blur transition-[transform,opacity,background-color,border-color,box-shadow] duration-300 ease-out ${stickyOverlayClassName}`}
        style={{ minHeight: stickyHeight, height: stickyHeight, ...stickyStyles }}
        aria-hidden={!layout.stickyEnabled}
      >
        {renderHeaderInner(true)}
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
