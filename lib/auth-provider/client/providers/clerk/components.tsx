'use client';

/**
 * Clerk – Client-Side UI Components
 * ====================================
 * Direct re-exports of Clerk's drop-in UI components.
 * These are used when `AUTH_PROVIDER=clerk`.
 */

export {
  SignIn as AuthSignIn,
  SignUp as AuthSignUp,
  SignInButton as AuthSignInButton,
  SignUpButton as AuthSignUpButton,
  SignOutButton as AuthSignOutButton,
  OrganizationSwitcher as AuthOrganizationSwitcher,
  UserProfile as AuthUserProfile,
  ClerkProvider as AuthProvider,
} from '@clerk/nextjs';

export { dark as authDarkTheme } from '@clerk/themes';
