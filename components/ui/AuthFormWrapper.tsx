'use client';

import { useEffect, useState } from 'react';
import { useAuthSession } from '@/lib/auth-provider/client/hooks';

/**
 * AuthFormWrapper
 * ---------------
 * Wraps an auth form (SignIn / SignUp) and detects when Clerk has authenticated
 * the user (isSignedIn flips to true). During the brief window between
 * successful auth and the redirect, it replaces the form with a smooth
 * "Signing you in…" transition screen so the UI never feels broken.
 */
export function AuthFormWrapper({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useAuthSession();
  const [isMounted, setIsMounted] = useState(false);
  const signingIn = isLoaded && isSignedIn;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  if (signingIn) {
    return (
      <div className="w-full flex justify-center pb-8">
        <div className="w-[448px] flex flex-col items-center justify-center gap-6 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-12">
          {/* Animated spinner */}
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-full border-4 border-neutral-200 dark:border-neutral-800" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Signing you in…
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Hang tight, you&apos;ll be redirected shortly. Please refresh the page if this takes too long.  
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
