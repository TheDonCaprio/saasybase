'use client';

/**
 * NextAuth – Client Barrel
 */

export { useAuthUser, useAuthSession, useAuthInstance, useActiveOrgId, notifyActiveOrgChanged } from './hooks';
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
