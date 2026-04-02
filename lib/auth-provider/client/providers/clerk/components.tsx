'use client';

/**
 * Clerk – Client-Side UI Components
 * ====================================
 * Direct re-exports of Clerk's drop-in UI components.
 * These are used when `AUTH_PROVIDER=clerk`.
 */

import React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';

export function AuthProvider(props: React.ComponentProps<typeof ClerkProvider>) {
  return <ClerkProvider ui={ui} {...props} />;
}

export {
  SignIn as AuthSignIn,
  SignUp as AuthSignUp,
  SignInButton as AuthSignInButton,
  SignUpButton as AuthSignUpButton,
  SignOutButton as AuthSignOutButton,
  OrganizationSwitcher as AuthOrganizationSwitcher,
  UserProfile as AuthUserProfile,
  ClerkLoaded as AuthLoaded,
  ClerkLoading as AuthLoading,
} from '@clerk/nextjs';

export { dark as authDarkTheme } from '@clerk/themes';
