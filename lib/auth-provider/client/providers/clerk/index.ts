'use client';

/**
 * Clerk – Client Barrel
 * Combines hooks + components for the conditional require() in the parent barrel.
 */

export { useAuthUser, useAuthSession, useAuthInstance } from './hooks';
export {
  AuthSignIn,
  AuthSignUp,
  AuthSignInButton,
  AuthSignUpButton,
  AuthSignOutButton,
  AuthOrganizationSwitcher,
  AuthUserProfile,
  AuthProvider,
  authDarkTheme,
} from './components';
