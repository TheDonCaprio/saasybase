"use client";
import React from 'react';
import { AuthProvider, authDarkTheme } from '@/lib/auth-provider/client';
// Welcome email is now triggered server-side via Clerk webhooks.

export default function DevClerkProvider({ children, publishableKey }: { children: React.ReactNode; publishableKey?: string | null }) {
  // Always call hooks in the same order regardless of publishableKey presence
  // Detect if dark mode is active
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    // If no publishableKey, skip installing observers — effect still runs but exits early
    if (!publishableKey) return;

    // Check initial theme
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    };

    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, [publishableKey]);

  // If no publishableKey, render children directly (hooks still ran safely)
  if (!publishableKey) return <>{children}</>;

  // When a publishableKey is provided, render ClerkProvider with custom sign-in/up URLs
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
          colorPrimary: '#7c3aed', // violet-600
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
        }
      }}
    >
      {children}
    </AuthProvider>
  );
}
