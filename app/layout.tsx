import './globals.css';
import './clerk-overrides.css';
import React from 'react';
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
  type ThemeLink
} from '../lib/settings';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';
import Script from 'next/script';
import Link from 'next/link';
import TwitterLoader from '../components/twitter/TwitterLoader';
import { OrgValidityCheck } from '../components/dashboard/OrgValidityCheck';
import { TokenExpiryCleanupPing } from '../components/dashboard/TokenExpiryCleanupPing';
import ChunkLoadRecovery from '../components/ui/ChunkLoadRecovery';

export const metadata = {
  title: process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME],
  description: '3D Screenshot SaaS'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const enableBackgroundRefreshChecks = process.env.NODE_ENV === 'production';
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

  const buildThemeColorVarsCss = () => {
    const buildBlock = (t: typeof colorPalette.light, mode: 'light' | 'dark') => {
      const headerBlurNum = typeof (t as any).headerBlur === 'number' ? (t as any).headerBlur : 12;
      const headerBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(headerBlurNum) ? headerBlurNum : 12)));
      const headerBorderWidthNum = typeof (t as any).headerBorderWidth === 'number' ? (t as any).headerBorderWidth : 1;
      const headerBorderWidthPx = Math.max(0, Math.min(4, Math.round(Number.isFinite(headerBorderWidthNum) ? headerBorderWidthNum : 1)));
      const headerMenuFontSizeNum = typeof (t as any).headerMenuFontSize === 'number' ? (t as any).headerMenuFontSize : 14;
      const headerMenuFontSizePx = Math.max(10, Math.min(20, Math.round(Number.isFinite(headerMenuFontSizeNum) ? headerMenuFontSizeNum : 14)));
      const headerMenuFontWeightNum = typeof (t as any).headerMenuFontWeight === 'number' ? (t as any).headerMenuFontWeight : 400;
      const headerMenuFontWeight = Math.max(300, Math.min(800, Math.round(Number.isFinite(headerMenuFontWeightNum) ? headerMenuFontWeightNum : 400)));
      const stickyHeaderBlurNum = typeof (t as any).stickyHeaderBlur === 'number' ? (t as any).stickyHeaderBlur : 14;
      const stickyHeaderBlurPx = Math.max(0, Math.min(40, Math.round(Number.isFinite(stickyHeaderBlurNum) ? stickyHeaderBlurNum : 14)));
      const stickyHeaderBorderWidthNum =
        typeof (t as any).stickyHeaderBorderWidth === 'number' ? (t as any).stickyHeaderBorderWidth : headerBorderWidthPx;
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
      const headerText = parseHexColor((t as any).headerText ?? t.textPrimary);
      const headerBorder = parseHexColor((t as any).headerBorder ?? t.borderPrimary);
      const stickyHeaderBg = parseHexColor((t as any).stickyHeaderBg ?? t.headerBg);
      const stickyHeaderText = parseHexColor((t as any).stickyHeaderText ?? t.textPrimary);
      const stickyHeaderBorder = parseHexColor(
        (t as any).stickyHeaderBorder ?? (t as any).headerBorder ?? t.borderPrimary
      );
      const sidebarBg = parseHexColor(t.sidebarBg);
      const sidebarBorder = parseHexColor((t as any).sidebarBorder ?? t.borderPrimary);
      const pageGlow = parseHexColor(t.pageGlow);
      const headerShadow = parseHexColor((t as any).headerShadow ?? '#00000014');
      const stickyHeaderShadow = parseHexColor((t as any).stickyHeaderShadow ?? (t as any).headerShadow ?? '#00000014');

      const headerShadowBlurNum = typeof (t as any).headerShadowBlur === 'number' ? (t as any).headerShadowBlur : 30;
      const headerShadowBlurPx = Math.max(0, Math.min(80, Math.round(Number.isFinite(headerShadowBlurNum) ? headerShadowBlurNum : 30)));
      const headerShadowSpreadNum = typeof (t as any).headerShadowSpread === 'number' ? (t as any).headerShadowSpread : -22;
      const headerShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(headerShadowSpreadNum) ? headerShadowSpreadNum : -22))
      );

      const stickyHeaderShadowBlurNum =
        typeof (t as any).stickyHeaderShadowBlur === 'number' ? (t as any).stickyHeaderShadowBlur : headerShadowBlurPx;
      const stickyHeaderShadowBlurPx = Math.max(
        0,
        Math.min(80, Math.round(Number.isFinite(stickyHeaderShadowBlurNum) ? stickyHeaderShadowBlurNum : headerShadowBlurPx))
      );
      const stickyHeaderShadowSpreadNum =
        typeof (t as any).stickyHeaderShadowSpread === 'number' ? (t as any).stickyHeaderShadowSpread : headerShadowSpreadPx;
      const stickyHeaderShadowSpreadPx = Math.max(
        -80,
        Math.min(80, Math.round(Number.isFinite(stickyHeaderShadowSpreadNum) ? stickyHeaderShadowSpreadNum : headerShadowSpreadPx))
      );

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
        `  --theme-sticky-header-bg: rgb(${stickyHeaderBg.rgb} / ${fmtAlpha(stickyHeaderBg.a)});`,
        `  --theme-sticky-header-text: rgb(${stickyHeaderText.rgb} / ${fmtAlpha(stickyHeaderText.a)});`,
        `  --theme-sticky-header-blur: ${stickyHeaderBlurPx}px;`,
        `  --theme-sticky-header-border: rgb(${stickyHeaderBorder.rgb} / ${fmtAlpha(stickyHeaderBorder.a)});`,
        `  --theme-sticky-header-border-width: ${stickyHeaderBorderWidthPx}px;`,
        `  --theme-sidebar-bg: rgb(${sidebarBg.rgb} / ${fmtAlpha(sidebarBg.a)});`,
        `  --theme-sidebar-border: rgb(${sidebarBorder.rgb} / ${fmtAlpha(sidebarBorder.a)});`,
        `  --theme-header-shadow: 0 12px ${headerShadowBlurPx}px ${headerShadowSpreadPx}px rgb(${headerShadow.rgb} / ${fmtAlpha(headerShadow.a)});`,
        `  --theme-sticky-header-shadow: 0 12px ${stickyHeaderShadowBlurPx}px ${stickyHeaderShadowSpreadPx}px rgb(${stickyHeaderShadow.rgb} / ${fmtAlpha(stickyHeaderShadow.a)});`,
        `  --theme-page-gradient-from: rgb(${parseHexColor(t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientFrom).a)});`,
        `  --theme-page-gradient-via: rgb(${parseHexColor(t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientVia).a)});`,
        `  --theme-page-gradient-to: rgb(${parseHexColor(t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor(t.pageGradientTo).a)});`,
        `  --theme-hero-gradient-from: rgb(${parseHexColor((t as any).heroGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor((t as any).heroGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-hero-gradient-via: rgb(${parseHexColor((t as any).heroGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor((t as any).heroGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-hero-gradient-to: rgb(${parseHexColor((t as any).heroGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor((t as any).heroGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-card-gradient-from: rgb(${parseHexColor((t as any).cardGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor((t as any).cardGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-card-gradient-via: rgb(${parseHexColor((t as any).cardGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor((t as any).cardGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-card-gradient-to: rgb(${parseHexColor((t as any).cardGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor((t as any).cardGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-tabs-gradient-from: rgb(${parseHexColor((t as any).tabsGradientFrom ?? t.pageGradientFrom).rgb} / ${fmtAlpha(parseHexColor((t as any).tabsGradientFrom ?? t.pageGradientFrom).a)});`,
        `  --theme-tabs-gradient-via: rgb(${parseHexColor((t as any).tabsGradientVia ?? t.pageGradientVia).rgb} / ${fmtAlpha(parseHexColor((t as any).tabsGradientVia ?? t.pageGradientVia).a)});`,
        `  --theme-tabs-gradient-to: rgb(${parseHexColor((t as any).tabsGradientTo ?? t.pageGradientTo).rgb} / ${fmtAlpha(parseHexColor((t as any).tabsGradientTo ?? t.pageGradientTo).a)});`,
        `  --theme-page-glow: rgb(${pageGlow.rgb} / ${fmtAlpha(pageGlow.a)});`,
      ].join('\n');
    };

    return `html.light {\n${buildBlock(colorPalette.light, 'light')}\n}\nhtml.dark {\n${buildBlock(colorPalette.dark, 'dark')}\n}`;
  };

  const themeColorVarsCss = buildThemeColorVarsCss();
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const shouldInjectGa = Boolean(gaMeasurementId);
  const gaConfigExtras = process.env.NODE_ENV !== 'production' ? ', debug_mode: true' : '';
  // Preserve previous default aspect ratio (160x48) as a CSS fallback while using
  // a CSS-based layout (fill + object-contain) so the image never gets squished.
  const DEFAULT_LOGO_W = 160;
  const DEFAULT_LOGO_H = 48;
  const aspectRatioCss = `${DEFAULT_LOGO_W} / ${DEFAULT_LOGO_H}`;
  return (
      <html
        lang="en"
        suppressHydrationWarning={true}
        style={{
          backgroundColor: 'rgb(var(--bg-primary))',
          backgroundImage: 'linear-gradient(to bottom, var(--theme-page-gradient-from), var(--theme-page-gradient-via), var(--theme-page-gradient-to))',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%'
        }}
      >
        <head>
          <link rel="icon" href={faviconHref} />
          {/* Theme script must run before body renders to prevent hydration mismatch */}
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('themePreference');if(p==='dark'){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}else if(p==='light'){document.documentElement.classList.add('light');document.documentElement.classList.remove('dark');}else{document.documentElement.classList.remove('light','dark');if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}else{document.documentElement.classList.add('light');}}}catch(e){} })()` }} />
          <style id="theme-color-vars" dangerouslySetInnerHTML={{ __html: themeColorVarsCss }} />
          {customCss ? <style id="custom-theme-css" dangerouslySetInnerHTML={{ __html: customCss }} /> : null}
          {customHeadSnippet ? (
            <script
              id="custom-theme-head-snippet"
              dangerouslySetInnerHTML={{
                __html: `(function(){try{document.head.insertAdjacentHTML('beforeend', ${JSON.stringify(customHeadSnippet.replace(/<\/script/gi, '<\\/script'))});}catch(e){console.error('theme head snippet failed', e);}})();`
              }}
            />
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
            <script dangerouslySetInnerHTML={{ __html: `window.__CLERK_ENABLED=${!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}` }} />
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
