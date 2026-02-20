import './globals.css';
import React from 'react';
import DevClerkProvider from '../components/DevClerkProvider';
import { FormatSettingsProvider } from '../components/FormatSettingsProvider';
import { ToastContainer } from '../components/ui/Toast';
import { ConditionalAccountMenu } from '../components/ConditionalAccountMenu';
import { ConditionalDashboardDrawer } from '../components/ConditionalDashboardDrawer';
import { ConditionalAdminDrawer } from '../components/ConditionalAdminDrawer';
import { HeaderMobileMenu } from '../components/HeaderMobileMenu';
import PaymentProviderScripts from '../components/PaymentProviderScripts';
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
  type ThemeLink
} from '../lib/settings';
import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/settings';
import Image from 'next/image';
import Script from 'next/script';
import Link from 'next/link';
import Brand from '../components/Brand';
import TwitterLoader from '../components/twitter/TwitterLoader';
import { ThemeToggle } from '../components/ThemeToggle';
import { OrgValidityCheck } from '../components/dashboard/OrgValidityCheck';
import { TokenExpiryCleanupPing } from '../components/dashboard/TokenExpiryCleanupPing';

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
  const [headerLinks, footerLinks, footerText, customCss, customHeadSnippet, customBodySnippet] = await Promise.all([
    getThemeHeaderLinks().catch(() => [] as ThemeLink[]),
    getThemeFooterLinks().catch(() => [] as ThemeLink[]),
    getThemeFooterText(siteName).catch(() => `© ${new Date().getFullYear()} ${siteName}`),
    getThemeCustomCss().catch(() => ''),
    getThemeCustomHeadSnippet().catch(() => ''),
    getThemeCustomBodySnippet().catch(() => '')
  ]);
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const shouldInjectGa = Boolean(gaMeasurementId);
  const gaConfigExtras = process.env.NODE_ENV !== 'production' ? ', debug_mode: true' : '';
  // Preserve previous default aspect ratio (160x48) as a CSS fallback while using
  // a CSS-based layout (fill + object-contain) so the image never gets squished.
  const DEFAULT_LOGO_W = 160;
  const DEFAULT_LOGO_H = 48;
  const aspectRatioCss = `${DEFAULT_LOGO_W} / ${DEFAULT_LOGO_H}`;
  const renderNavLink = (link: ThemeLink) => {
    const isExternal = /^https?:\/\//i.test(link.href);
    const className = 'transition-colors hover:text-slate-900 dark:hover:text-neutral-100';
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
  return (
      <html lang="en" suppressHydrationWarning={true}>
        <head>
          <link rel="icon" href={faviconHref} />
          {/* Theme script must run before body renders to prevent hydration mismatch */}
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('themePreference');if(p==='dark'){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}else if(p==='light'){document.documentElement.classList.add('light');document.documentElement.classList.remove('dark');}else{document.documentElement.classList.remove('light','dark');if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}else{document.documentElement.classList.add('light');}}}catch(e){} })()` }} />
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
          className="min-h-screen flex flex-col bg-white text-neutral-900 transition-colors duration-150 dark:bg-neutral-950 dark:text-neutral-100"
          suppressHydrationWarning={true}
        >
          <DevClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''}>
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
          <header className="px-6 py-4 flex items-center justify-between border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/70 relative z-40">
            <a href="/" className="font-semibold text-lg flex items-center gap-3">
              {/* Prefer theme-specific logos: show dark variant when html has .dark, otherwise light. If none, fall back to SITE_LOGO or Brand */}
              {(
                // Render both imgs but show/hide via CSS so the correct one is loaded for the chosen theme.
                // This keeps server-rendered markup stable; CSS classes toggle visibility client-side.
                <> 
                  {siteLogoLight ? (
                    <div className="relative inline-block dark:hidden" style={{ height: logoHeightNum, aspectRatio: aspectRatioCss }}>
                      <Image 
                        src={siteLogoLight} 
                        alt={siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} 
                        fill 
                        style={{ objectFit: 'contain' }} 
                        sizes="(max-width: 768px) 100px, 200px"
                        priority
                      />
                    </div>
                  ) : null}
                  {siteLogoDark ? (
                    <div className="relative hidden dark:inline-block" style={{ height: logoHeightNum, aspectRatio: aspectRatioCss }}>
                      <Image 
                        src={siteLogoDark} 
                        alt={siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} 
                        fill 
                        style={{ objectFit: 'contain' }} 
                        sizes="(max-width: 768px) 100px, 200px"
                        priority
                      />
                    </div>
                  ) : null}

                  {/* If neither theme-specific logo, use generic SITE_LOGO */}
                  {!siteLogoLight && !siteLogoDark && siteLogo ? (
                    <div className="relative inline-block" style={{ height: logoHeightNum, aspectRatio: aspectRatioCss }}>
                      <Image 
                        src={siteLogo} 
                        alt={siteName || process.env.NEXT_PUBLIC_SITE_NAME || 'YourApp'} 
                        fill 
                        style={{ objectFit: 'contain' }} 
                        sizes="(max-width: 768px) 100px, 200px"
                        priority
                      />
                    </div>
                  ) : null}

                  {/* Brand fallback if no images available */}
                  {!siteLogo && !siteLogoLight && !siteLogoDark ? <Brand siteName={siteName} /> : null}
                </>
              )}
            </a>
            <div className="flex items-center gap-4">
              {headerLinks.length ? (
                <nav className="hidden lg:flex gap-4 text-sm text-slate-600 dark:text-neutral-300">
                  {headerLinks.map(renderNavLink)}
                </nav>
              ) : null}
              <ThemeToggle />
              <ConditionalAccountMenu />
              <ConditionalDashboardDrawer />
              <ConditionalAdminDrawer />
              {headerLinks.length ? (
                <HeaderMobileMenu links={headerLinks} />
              ) : null}
            </div>
          </header>
          {/* top-down page-level gradient and soft radial highlight at the top */}
          <main className="flex-1 w-full p-6 bg-gradient-to-b from-sky-50 via-indigo-50 to-white dark:from-neutral-900/95 dark:via-indigo-900/80 dark:to-neutral-950 relative">
            {/* bluish/purplish top radial glow for 'light from above' */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-28 w-[min(1200px,100vw)] h-[520px] -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.18),_transparent_35%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12),_transparent_35%)] opacity-100"
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
          {customBodySnippet ? (
            <div
              id="custom-theme-body-snippet"
              suppressHydrationWarning
              style={{ display: 'contents' }}
              dangerouslySetInnerHTML={{ __html: customBodySnippet }}
            />
          ) : null}
            </FormatSettingsProvider>
          </DevClerkProvider>
        </body>
      </html>
  );
}
