"use client";

import React from 'react';
import { AuthProvider } from '@/lib/auth-provider/client';
import { getAuthProviderAppearance } from '@/lib/auth-provider/client/clerk-appearance';

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
    >
      {children}
    </AuthProvider>
  );
}