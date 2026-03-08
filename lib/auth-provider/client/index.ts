'use client';

/**
 * Auth Provider – Client-Side Barrel Export
 * ==========================================
 * Central import point for all client-side auth abstractions.
 *
 * Usage:
 *   import { useAuthUser, useAuthSession, AuthSignIn } from '@/lib/auth-provider/client';
 */

// Common client types
export type {
  AuthClientUser,
  AuthClientEmailAddress,
  AuthClientActiveSession,
  UseAuthUserReturn,
  UseAuthSessionReturn,
  UseAuthInstanceReturn,
  AuthProviderProps,
} from './types';

// Hooks
export { useAuthUser, useAuthSession, useAuthInstance } from './hooks';

// UI Components
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
