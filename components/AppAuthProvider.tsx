"use client";

import React from 'react';
import { AuthProvider } from '@/lib/auth-provider/client';
import { getAuthProviderAppearance } from '@/lib/auth-provider/client/clerk-appearance';
import { shouldReloadOnBackNavigation } from '@/lib/auth-provider/client/should-reload-on-back-navigation';

const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER || 'clerk';
const IS_CLERK = AUTH_PROVIDER === 'clerk';

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

    const handlePageShow = (event: PageTransitionEvent) => {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

      if (!shouldReloadOnBackNavigation(event, navigationEntry?.type)) {
        return;
      }

      window.location.reload();
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
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
      }}
    >
      {children}
    </AuthProvider>
  );
}