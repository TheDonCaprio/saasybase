'use client';

/**
 * Clerk – Client-Side UI Components
 * ====================================
 * Direct re-exports of Clerk's drop-in UI components.
 * These are used when `AUTH_PROVIDER=clerk`.
 */

import {
  SignIn,
  SignUp,
  SignInButton,
  SignUpButton,
  SignOutButton,
  OrganizationSwitcher,
  UserProfile,
  ClerkProvider,
  ClerkLoaded,
  ClerkLoading,
} from '@clerk/nextjs';
import type { ComponentProps } from 'react';

import type { AuthProviderProps } from '../../types';

export const AuthSignIn = SignIn;
export const AuthSignUp = SignUp;
export const AuthSignInButton = SignInButton;
export const AuthSignUpButton = SignUpButton;
export const AuthSignOutButton = SignOutButton;

type OrganizationSwitcherProps = ComponentProps<typeof OrganizationSwitcher>;

export function AuthOrganizationSwitcher({
  organizationProfileUrl,
  ...props
}: OrganizationSwitcherProps) {
  return (
    <OrganizationSwitcher
      {...props}
      organizationProfileUrl={organizationProfileUrl ?? '/dashboard/team'}
      organizationProfileMode="navigation"
    />
  );
}

export const AuthUserProfile = UserProfile;
export const AuthLoaded = ClerkLoaded;
export const AuthLoading = ClerkLoading;

export function AuthProvider({ children, publishableKey, ...props }: AuthProviderProps) {
  return (
    <ClerkProvider
      {...props}
      publishableKey={publishableKey ?? undefined}
    >
      {children}
    </ClerkProvider>
  );
}

export { dark as authDarkTheme } from '@clerk/themes';
