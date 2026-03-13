'use client';

/**
 * Auth Provider – Client-Side UI Components (Conditional Dispatch)
 * ==================================================================
 * Same build-time conditional as hooks.tsx.
 * Webpack DCEs the unused provider branch.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const _mod: Record<string, any> = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'nextauth'
  ? require('./providers/nextauth/components')
  : require('./providers/clerk/components');
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

export const AuthSignIn = _mod.AuthSignIn;
export const AuthSignUp = _mod.AuthSignUp;
export const AuthSignInButton = _mod.AuthSignInButton;
export const AuthSignUpButton = _mod.AuthSignUpButton;
export const AuthSignOutButton = _mod.AuthSignOutButton;
export const AuthOrganizationSwitcher = _mod.AuthOrganizationSwitcher;
export const AuthUserProfile = _mod.AuthUserProfile;
export const AuthProvider = _mod.AuthProvider;
export const AuthLoaded = _mod.AuthLoaded;
export const AuthLoading = _mod.AuthLoading;
export const authDarkTheme = _mod.authDarkTheme;
