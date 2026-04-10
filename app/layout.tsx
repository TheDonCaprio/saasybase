import './globals.css';
import './clerk-overrides.css';
import '@fortawesome/fontawesome-svg-core/styles.css';
import React from 'react';
import { config as fontAwesomeConfig } from '@fortawesome/fontawesome-svg-core';
import AppAuthProvider from '../components/AppAuthProvider';
import { FormatSettingsProvider } from '../components/FormatSettingsProvider';
import { ToastContainer } from '../components/ui/Toast';
import PaymentProviderScripts from '../components/PaymentProviderScripts';
import { SiteHeader } from '../components/SiteHeader';
import {
  getSiteName,
  getSiteLogo,
  getSiteLogoLight,
  getSiteLogoDark,
  getSiteLogoHeight,
  getSiteFavicon,
  getFormatSetting,
  getThemeHeaderLinks,
  getThemeFooterLinks,
  getThemeFooterText,
  getThemeCustomCss,
  getThemeCustomHeadSnippet,
  getThemeCustomBodySnippet,
  getThemeColorPalette,
  getHeaderLayoutSettings,
  type ThemeLink,
  type ThemeColorTokens,
} from '../lib/settings';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';
import { cookies } from 'next/headers';
import Script from 'next/script';
import Link from 'next/link';
import TwitterLoader from '../components/twitter/TwitterLoader';
import { OrgValidityCheck } from '../components/dashboard/OrgValidityCheck';
import { TokenExpiryCleanupPing } from '../components/dashboard/TokenExpiryCleanupPing';
import ChunkLoadRecovery from '../components/ui/ChunkLoadRecovery';

fontAwesomeConfig.autoAddCss = false;

export const metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME],
  description: '3D Screenshot SaaS'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const enableBackgroundRefreshChecks = true;
  const siteName = await getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
  const siteLogo = await getSiteLogo().catch(() => process.env.NEXT_PUBLIC_SITE_LOGO || '');
  const siteLogoLight = await getSiteLogoLight().catch(() => process.env.NEXT_PUBLIC_SITE_LOGO_LIGHT || '');
  const siteLogoDark = await getSiteLogoDark().catch(() => process.env.NEXT_PUBLIC_SITE_LOGO_DARK || '');
  const siteLogoHeight = await getSiteLogoHeight().catch(() => process.env.NEXT_PUBLIC_SITE_LOGO_HEIGHT || '48');
  const siteFavicon = await getSiteFavicon().catch(() => '/favicon.ico');
  const faviconHref = (siteFavicon ?? '').trim() || '/favicon.ico';
  const logoHeightNum = Number(siteLogoHeight) || 48;
  const formatSettings = await getFormatSetting().catch(() => ({ mode: 'short' as const, timezone: undefined }));
  const [headerLinks, footerLinks, footerText, customCss, customHeadSnippet, customBodySnippet, colorPalette, headerLayoutSettings] = await Promise.all([
    getThemeHeaderLinks().catch(() => [] as ThemeLink[]),
    getThemeFooterLinks().catch(() => [] as ThemeLink[]),
    getThemeFooterText(siteName).catch(() => `© ${new Date().getFullYear()} ${siteName}`),
    getThemeCustomCss().catch(() => ''),
    getThemeCustomHeadSnippet().catch(() => ''),
    getThemeCustomBodySnippet().catch(() => ''),
    getThemeColorPalette(),
    getHeaderLayoutSettings()
  ]);

  const parseHexColor = (hex: string): { rgb: string; a: number } => {
    const clean = (hex || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) return { rgb: '0 0 0', a: 1 };
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    return { rgb: `${r} ${g} ${b}`, a: Math.max(0, Math.min(1, a)) };
  };

  const fmtAlpha = (a: number): string => {
    const fixed = Math.max(0, Math.min(1, a)).toFixed(4);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  };

  const resolveThemeFontStack = (fontFamily: ThemeColorTokens['fontFamily'] | undefined): string => {
    switch (fontFamily) {
      case 'material':
        return 'Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';
      case 'fluent':
        return '"Segoe UI Variable Text", "Segoe UI", Selawik, Tahoma, Arial, sans-serif';
      case 'apple':
        return '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
      case 'system':
      default:
        return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
  };

  const buildThemeColorVarsCss = () => {
    const buildBlock = (t: ThemeColorTokens) => {
      const headerBlurNum = typeof t.headerBlur === 'number' ? t.headerBlur : 12;
      const headerBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(headerBlurNum) ? headerBlurNum : 12)));
      const headerBorderWidthNum = typeof t.headerBorderWidth === 'number' ? t.headerBorderWidth : 1;
      const headerBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(headerBorderWidthNum) ? headerBorderWidthNum : 1)));
      const headerMenuFontSizeNum = typeof t.headerMenuFontSize === 'number' ? t.headerMenuFontSize : 14;
      const headerMenuFontSizePx = Math.max(10, Math.min(20, Math.round(Number.isFinite(headerMenuFontSizeNum) ? headerMenuFontSizeNum : 14)));
      const headerMenuFontWeightNum = typeof t.headerMenuFontWeight === 'number' ? t.headerMenuFontWeight : 400;
      const headerMenuFontWeight = Math.max(300, Math.min(800, Math.round(Number.isFinite(headerMenuFontWeightNum) ? headerMenuFontWeightNum : 400)));
      const stickyHeaderBlurNum = typeof t.stickyHeaderBlur === 'number' ? t.stickyHeaderBlur : 14;
      const stickyHeaderBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(stickyHeaderBlurNum) ? stickyHeaderBlurNum : 14)));
      const stickyHeaderBorderWidthNum =
        typeof t.stickyHeaderBorderWidth === 'number' ? t.stickyHeaderBorderWidth : headerBorderWidthPx;
      const stickyHeaderBorderWidthPx = Math.max(
        0,
        Math.min(4, Math.round(Number.isFinite(stickyHeaderBorderWidthNum) ? stickyHeaderBorderWidthNum : headerBorderWidthPx))
      );

      const cssToken = (name: string, hex: string) => {
        const p = parseHexColor(hex);
        const a = fmtAlpha(p.a);
        return [`  --${name}: ${p.rgb} / ${a};`, `  --${name}-rgb: ${p.rgb};`, `  --${name}-a: ${a};`];
      };

      const headerBg = parseHexColor(t.headerBg);
      const headerText = parseHexColor(t.headerText ?? t.textPrimary);
      const headerBorder = parseHexColor(t.headerBorder ?? t.borderPrimary);
      const stickyHeaderBg = parseHexColor(t.stickyHeaderBg ?? t.headerBg);
      const stickyHeaderText = parseHexColor(t.stickyHeaderText ?? t.textPrimary);
      const stickyHeaderBorder = parseHexColor(
        t.stickyHeaderBorder ?? t.headerBorder ?? t.borderPrimary
      );
      const sidebarBg = parseHexColor(t.sidebarBg);
      const sidebarBorder = parseHexColor(t.sidebarBorder ?? t.borderPrimary);
      const pageGlow = parseHexColor(t.pageGlow);
      const headerShadow = parseHexColor(t.headerShadow ?? '#00000014');
      const panelShadow = parseHexColor(t.panelShadow ?? t.cardShadow ?? '#00000012');
      const cardShadow = parseHexColor(t.cardShadow ?? '#00000014');
      const tabsShadow = parseHexColor(t.tabsShadow ?? t.cardShadow ?? '#00000010');
      const sidebarShadow = parseHexColor(t.sidebarShadow ?? t.panelShadow ?? t.headerShadow ?? '#00000010');
      const stickyHeaderShadow = parseHexColor(t.stickyHeaderShadow ?? t.headerShadow ?? '#00000014');

      const headerShadowBlurNum = typeof t.headerShadowBlur === 'number' ? t.headerShadowBlur : 30;
      const headerShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(headerShadowBlurNum) ? headerShadowBlurNum : 30)));
      const headerShadowSpreadNum = typeof t.headerShadowSpread === 'number' ? t.headerShadowSpread : -22;
      const headerShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(headerShadowSpreadNum) ? headerShadowSpreadNum : -22))
      );
      const cardShadowBlurNum = typeof t.cardShadowBlur === 'number' ? t.cardShadowBlur : 24;
      const cardShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(cardShadowBlurNum) ? cardShadowBlurNum : 24)));
      const cardShadowSpreadNum = typeof t.cardShadowSpread === 'number' ? t.cardShadowSpread : -18;
      const cardShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(cardShadowSpreadNum) ? cardShadowSpreadNum : -18)));
      const panelShadowBlurNum = typeof t.panelShadowBlur === 'number' ? t.panelShadowBlur : cardShadowBlurPx;
      const panelShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(panelShadowBlurNum) ? panelShadowBlurNum : cardShadowBlurPx)));
      const panelShadowSpreadNum = typeof t.panelShadowSpread === 'number' ? t.panelShadowSpread : cardShadowSpreadPx;
      const panelShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(panelShadowSpreadNum) ? panelShadowSpreadNum : cardShadowSpreadPx)));
      const tabsShadowBlurNum = typeof t.tabsShadowBlur === 'number' ? t.tabsShadowBlur : cardShadowBlurPx;
      const tabsShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(tabsShadowBlurNum) ? tabsShadowBlurNum : cardShadowBlurPx)));
      const tabsShadowSpreadNum = typeof t.tabsShadowSpread === 'number' ? t.tabsShadowSpread : cardShadowSpreadPx;
      const tabsShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(tabsShadowSpreadNum) ? tabsShadowSpreadNum : cardShadowSpreadPx)));
      const sidebarShadowBlurNum = typeof t.sidebarShadowBlur === 'number' ? t.sidebarShadowBlur : panelShadowBlurPx;
      const sidebarShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(sidebarShadowBlurNum) ? sidebarShadowBlurNum : panelShadowBlurPx)));
      const sidebarShadowSpreadNum = typeof t.sidebarShadowSpread === 'number' ? t.sidebarShadowSpread : panelShadowSpreadPx;
      const sidebarShadowSpreadPx = Math.max(-80, Math.min(80, Math.round(Number.isFinite(sidebarShadowSpreadNum) ? sidebarShadowSpreadNum : panelShadowSpreadPx)));

      const stickyHeaderShadowBlurNum =
        typeof t.stickyHeaderShadowBlur === 'number' ? t.stickyHeaderShadowBlur : headerShadowBlurPx;
      const stickyHeaderShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(stickyHeaderShadowBlurNum) ? stickyHeaderShadowBlurNum : headerShadowBlurPx))
      );
      const stickyHeaderShadowSpreadNum =
        typeof t.stickyHeaderShadowSpread === 'number' ? t.stickyHeaderShadowSpread : headerShadowSpreadPx;
      const stickyHeaderShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(stickyHeaderShadowSpreadNum) ? stickyHeaderShadowSpreadNum : headerShadowSpreadPx))
      );
      const surfaceRadiusNum = typeof t.surfaceRadius === 'number' ? t.surfaceRadius : 16;
      const surfaceRadiusPx = Math.max(0, Math.min(32, Math.round(Number.isFinite(surfaceRadiusNum) ? surfaceRadiusNum : 16)));
      const statCardAccentTopNum = typeof t.statCardAccentTop === 'number' ? t.statCardAccentTop : 0;
      const statCardAccentTopPx = Math.max(0, Math.min(8, Math.round(Number.isFinite(statCardAccentTopNum) ? statCardAccentTopNum : 0)));
      const statCardAccentLeftNum = typeof t.statCardAccentLeft === 'number' ? t.statCardAccentLeft : 0;
      const statCardAccentLeftPx = Math.max(0, Math.min(8, Math.round(Number.isFinite(statCardAccentLeftNum) ? statCardAccentLeftNum : 0)));
      const fontFamily = resolveThemeFontStack(t.fontFamily);

      return [
        ...cssToken('bg-primary', t.bgPrimary),
        ...cssToken('bg-secondary', t.panelBg ?? t.bgSecondary),
        ...cssToken('surface-panel', t.panelBg ?? t.bgSecondary),
        ...cssToken('surface-card', t.bgSecondary),
        ...cssToken('surface-hero', t.heroBg ?? t.bgSecondary),
        ...cssToken('bg-tertiary', t.bgTertiary),
        ...cssToken('bg-quaternary', t.bgQuaternary),
        ...cssToken('text-primary', t.textPrimary),
        ...cssToken('text-secondary', t.textSecondary),
        ...cssToken('text-tertiary', t.textTertiary),
        ...cssToken('border-primary', t.borderPrimary),
        ...cssToken('border-secondary', t.borderSecondary),
        ...cssToken('accent-primary', t.accentPrimary),
        ...cssToken('accent-hover', t.accentHover),
        `  --theme-header-bg: rgb(${headerBg.rgb} / ${fmtAlpha(headerBg.a)});`,
        `  --theme-header-text: rgb(${headerText.rgb} / ${fmtAlpha(headerText.a)});`,
        `  --theme-header-blur: ${headerBlurPx}px;`,
        `  --theme-header-border: rgb(${headerBorder.rgb} / ${fmtAlpha(headerBorder.a)});`,
        `  --theme-header-border-width: ${headerBorderWidthPx}px;`,
        `  --theme-header-menu-font-size: ${headerMenuFontSizePx}px;`,
        `  --theme-header-menu-font-weight: ${headerMenuFontWeight};`,
        `  --theme-font-family: ${fontFamily};`,
        `  --theme-sticky-header-bg: rgb(${stickyHeaderBg.rgb} / ${fmtAlpha(stickyHeaderBg.a)});`,
        `  --theme-sticky-header-text: rgb(${stickyHeaderText.rgb} / ${fmtAlpha(stickyHeaderText.a)});`,
        `  --theme-sticky-header-blur: ${stickyHeaderBlurPx}px;`,
        `  --theme-sticky-header-border: rgb(${stickyHeaderBorder.rgb} / ${fmtAlpha(stickyHeaderBorder.a)});`,
        `  --theme-sticky-header-border-width: ${stickyHeaderBorderWidthPx}px;`,
        `  --theme-sidebar-bg: rgb(${sidebarBg.rgb} / ${fmtAlpha(sidebarBg.a)});`,
        `  --theme-sidebar-border: rgb(${sidebarBorder.rgb} / ${fmtAlpha(sidebarBorder.a)});`,
        `  --theme-header-shadow: 0 12px ${headerShadowBlurPx}px ${headerShadowSpreadPx}px rgb(${headerShadow.rgb} / ${fmtAlpha(headerShadow.a)});`,
        `  --theme-panel-shadow: 0 12px ${panelShadowBlurPx}px ${panelShadowSpreadPx}px rgb(${panelShadow.rgb} / ${fmtAlpha(panelShadow.a)});`,
        `  --theme-card-shadow: 0 12px ${cardShadowBlurPx}px ${cardShadowSpreadPx}px rgb(${cardShadow.rgb} / ${fmtAlpha(cardShadow.a)});`,
        `  --theme-tabs-shadow: 0 12px ${tabsShadowBlurPx}px ${tabsShadowSpreadPx}px rgb(${tabsShadow.rgb} / ${fmtAlpha(tabsShadow.a)});`,
        `  --theme-sidebar-shadow: 0 12px ${sidebarShadowBlurPx}px ${sidebarShadowSpreadPx}px rgb(${sidebarShadow.rgb} / ${fmtAlpha(sidebarShadow.a)});`,
        `  --theme-sticky-header-shadow: 0 12px ${stickyHeaderShadowBlurPx}px ${stickyHeaderShadowSpreadPx}px rgb(${stickyHeaderShadow.rgb} / ${fmtAlpha(stickyHeaderShadow.a)});`,
        `  --theme-surface-radius: ${surfaceRadiusPx}px;`,
        `  --theme-stat-card-accent-top: ${statCardAccentTopPx}px;`,
        `  --theme-stat-card-accent-left: ${statCardAccentLeftPx}px;`,
        `  --theme-page-gradient-from: rgb(${parseHexColor(t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientFrom).a)});`,
        `  --theme-page-gradient-via: rgb(${parseHexColor(t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientVia).a)});`,
        `  --theme-page-gradient-to: rgb(${parseHexColor(t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientTo).a)});`,
        `  --theme-hero-gradient-from: rgb(${parseHexColor(t.heroGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor(t.heroGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-hero-gradient-via: rgb(${parseHexColor(t.heroGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor(t.heroGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-hero-gradient-to: rgb(${parseHexColor(t.heroGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor(t.heroGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-card-gradient-from: rgb(${parseHexColor(t.cardGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor(t.cardGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-card-gradient-via: rgb(${parseHexColor(t.cardGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor(t.cardGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-card-gradient-to: rgb(${parseHexColor(t.cardGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor(t.cardGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-tabs-gradient-from: rgb(${parseHexColor(t.tabsGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor(t.tabsGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-tabs-gradient-via: rgb(${parseHexColor(t.tabsGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor(t.tabsGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-tabs-gradient-to: rgb(${parseHexColor(t.tabsGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor(t.tabsGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-page-glow: rgb(${pageGlow.rgb} / ${fmtAlpha(pageGlow.a)});`,
      ].join('\n');
    };

    return `html.light {\n${buildBlock(colorPalette.light)}\n}\nhtml.dark {\n${buildBlock(colorPalette.dark)}\n}`;
  };

  const themeColorVarsCss = buildThemeColorVarsCss();
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const shouldInjectGa = Boolean(gaMeasurementId);
  const gaConfigExtras = process.env.NODE_ENV !== 'production' ? ', debug_mode: true' : '';
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const themeCookie = cookieStore.get('themeResolved')?.value;
  const initialThemeClass = themeCookie === 'dark' || themeCookie === 'light' ? themeCookie : undefined;
  // Preserve previous default aspect ratio (160x48) as a CSS fallback while using
  // a CSS-based layout (fill + object-contain) so the image never gets squished.
  const DEFAULT_LOGO_W = 160;
  const DEFAULT_LOGO_H = 48;
  const aspectRatioCss = `${DEFAULT_LOGO_W} / ${DEFAULT_LOGO_H}`;
  return (
      <html
        lang="en"
        className={initialThemeClass}
        suppressHydrationWarning={true}
        style={{
          backgroundColor: 'rgb(var(--bg-primary))',
          backgroundImage: 'linear-gradient(to bottom, var(--theme-page-gradient-from), var(--theme-page-gradient-via), var(--theme-page-gradient-to))',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          colorScheme: initialThemeClass === 'dark' ? 'dark' : 'light'
        }}
      >
        <head>
          <link rel="icon" href={faviconHref} />
          {/* External scripts loaded as async <script src> — React 19 treats
              these as hoisted resources so they never trigger the
              "Encountered a script tag" console warning. */}
          <script async src="/scripts/theme-init.js" />
          <style id="theme-color-vars" dangerouslySetInnerHTML={{ __html: themeColorVarsCss }} />
          {customCss ? <style id="custom-theme-css" dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
          {customHeadSnippet ? (
            <>
              <template id="custom-head-snippet-data" dangerouslySetInnerHTML={{ __html: customHeadSnippet }} />
              <script async src="/scripts/head-snippet-init.js" />
            </>
          ) : null}
        </head>
        {/*
          Inline script above runs before React hydration to set the theme class on <html>
          It reads localStorage.themePreference (set when user changes preference) and
          falls back to system preference. This avoids flashes between server-rendered
          markup and client theme application.
        */}
        <body
          className="min-h-screen flex flex-col text-[rgb(var(--text-primary))] transition-colors duration-150"
          suppressHydrationWarning={true}
        >
          <AppAuthProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''}>
            {/* Indicate to client code whether Clerk is enabled so client-only
              helpers can avoid calling auth APIs for anonymous visitors. */}
            <meta name="x-clerk-enabled" content={String(clerkEnabled)} />
            <script async src="/scripts/clerk-flag-init.js" />
            <FormatSettingsProvider initialMode={formatSettings.mode} initialTimezone={formatSettings.timezone}>
          {shouldInjectGa ? (
            <>
              <Script
                id="ga-gtag-loader"
                src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
                strategy="afterInteractive"
              />
              <Script
                id="ga-gtag-init"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                  __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}', { anonymize_ip: true${gaConfigExtras} });`
                }}
              />
            </>
          ) : null}
          {/* Payment provider scripts (loaded dynamically based on active provider) */}
          <PaymentProviderScripts provider={process.env.PAYMENT_PROVIDER} />
          <SiteHeader
            siteName={siteName}
            siteLogo={siteLogo}
            siteLogoLight={siteLogoLight}
            siteLogoDark={siteLogoDark}
            logoHeight={logoHeightNum}
            aspectRatioCss={aspectRatioCss}
            headerLinks={headerLinks}
            layout={headerLayoutSettings}
          />
          {/* top-down page-level gradient and soft radial highlight at the top */}
          <main
            className="flex-1 w-full p-3 sm:p-6 relative"
          >
            {/* bluish/purplish top radial glow for 'light from above' */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-28 w-[min(1200px,100vw)] h-[520px] -z-10 opacity-100"
              style={{
                backgroundImage: 'radial-gradient(ellipse at top, var(--theme-page-glow), transparent 35%)'
              }}
            />
            {children}
          </main>
          <footer className="p-6 border-t border-neutral-200 text-center dark:border-neutral-800">
            {footerLinks.length ? (
              <nav className="mb-3 flex flex-wrap items-center justify-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                {footerLinks.map((link) => (
                  /^https?:\/\//i.test(link.href) ? (
                    <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer" className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-200">
                      {link.label}
                    </a>
                  ) : (
                    <Link key={`${link.label}-${link.href}`} href={link.href} className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-200">
                      {link.label}
                    </Link>
                  )
                ))}
              </nav>
            ) : null}
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{footerText}</div>
            {enableBackgroundRefreshChecks ? <OrgValidityCheck /> : null}
            {enableBackgroundRefreshChecks ? <TokenExpiryCleanupPing /> : null}
          </footer>
          {/* Global toast container so showToast() works from any page */}
          <ToastContainer />
          {/* Ensure Twitter embeds initialize on SPA navigation */}
          <TwitterLoader />
          <ChunkLoadRecovery />
          {customBodySnippet ? (
            <div
              id="custom-theme-body-snippet"
              suppressHydrationWarning
              style={{ display: 'contents' }}
              dangerouslySetInnerHTML={{ __html: customBodySnippet }}
            />
          ) : null}
            </FormatSettingsProvider>
          </AppAuthProvider>
        </body>
      </html>
  );
}
