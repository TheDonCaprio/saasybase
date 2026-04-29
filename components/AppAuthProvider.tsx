"use client";

import React from 'react';
import { config as fontAwesomeConfig } from '@fortawesome/fontawesome-svg-core';
import { AuthProvider } from '@/lib/auth-provider/client';
import { getAuthProviderAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { shouldReloadOnBackNavigation } from '@/lib/auth-provider/client/should-reload-on-back-navigation';

const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'clerk';
const IS_CLERK = AUTH_PROVIDER === 'clerk';
const NEXTAUTH_WEBKIT_RESUME_RELOAD_THRESHOLD_MS = 45_000;

fontAwesomeConfig.autoAddCss = false;

function isLikelyWebKitTouchDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isAppleTouchDevice = /iPad|iPhone|iPod/.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isWebKitEngine = /AppleWebKit/i.test(userAgent);

  return isAppleTouchDevice && isWebKitEngine;
}

export default function AppAuthProvider({
  children,
  publishableKey,
}: {
  children: React.ReactNode;
  publishableKey?: string | null;
}) {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    if (!IS_CLERK || !publishableKey) return;

    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [publishableKey]);

  React.useEffect(() => {
    if (IS_CLERK) {
      return;
    }

    const shouldHandleResumeRecovery = isLikelyWebKitTouchDevice();
    let hiddenAt: number | null = null;

    const reloadForResumeRecovery = () => {
      window.location.reload();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

      if (!shouldReloadOnBackNavigation(event, navigationEntry?.type)) {
        if (!(shouldHandleResumeRecovery && event.persisted)) {
          return;
        }
      }

      reloadForResumeRecovery();
    };

    const handleVisibilityChange = () => {
      if (!shouldHandleResumeRecovery) {
        return;
      }

      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      if (document.visibilityState !== 'visible' || hiddenAt == null) {
        return;
      }

      const elapsedMs = Date.now() - hiddenAt;
      hiddenAt = null;

      if (elapsedMs >= NEXTAUTH_WEBKIT_RESUME_RELOAD_THRESHOLD_MS) {
        reloadForResumeRecovery();
      }
    };

    const handlePageHide = () => {
      if (!shouldHandleResumeRecovery) {
        return;
      }

      hiddenAt = Date.now();
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  if (!IS_CLERK) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <AuthProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      appearance={getAuthProviderAppearance(isDark)}
      localization={{
        signIn: {
          start: {
            title: `Sign in to ${process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase'}`,
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: `to continue to ${process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase'}`,
          },
        },
        organizationSwitcher: {
          action__manageOrganization: '',
        },
      }}
    >
      {children}
    </AuthProvider>
  );
}