"use client";

import React from 'react';
import { AuthProvider, authDarkTheme } from '@/lib/auth-provider/client';

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
      appearance={{
        baseTheme: isDark ? authDarkTheme : undefined,
        variables: {
          colorPrimary: '#7c3aed',
          colorBackground: isDark ? '#0a0a0a' : '#ffffff',
          colorText: isDark ? '#fafafa' : '#0a0a0a',
          colorInputBackground: isDark ? '#171717' : '#ffffff',
          colorInputText: isDark ? '#fafafa' : '#0a0a0a',
        },
        elements: {
          formButtonPrimary: 'bg-violet-600 hover:bg-violet-700 text-white',
          card: isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200',
          headerTitle: isDark ? 'text-neutral-100' : 'text-neutral-900',
          headerSubtitle: isDark ? 'text-neutral-400' : 'text-neutral-600',
          socialButtonsBlockButton: isDark
            ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-200'
            : 'border-neutral-200 hover:bg-neutral-50 text-neutral-900',
          formFieldLabel: isDark ? 'text-neutral-300' : 'text-neutral-700',
          formFieldInput: isDark
            ? 'bg-neutral-800 border-neutral-700 text-neutral-100'
            : 'bg-white border-neutral-300 text-neutral-900',
          footerActionLink: 'text-violet-600 hover:text-violet-700',
        },
      }}
    >
      {children}
    </AuthProvider>
  );
}