/**
 * Auth Provider Registry
 * =======================
 * Mirrors `lib/payment/registry.ts`.
 *
 * Maps provider names → configuration objects so the factory can
 * instantiate the correct provider at runtime based on env vars.
 *
 * To add a new auth provider:
 *   1. Implement `AuthProvider` in `providers/<name>.ts`
 *   2. Register it here with an `envVarCheck` and `instantiate` function
 *   3. Set `AUTH_PROVIDER=<name>` in your `.env`
 */

import { ClerkAuthProvider } from './providers/clerk';
import { NextAuthProvider } from './providers/nextauth';
import type { AuthProvider, AuthProviderFeature } from './types';

type AuthProviderClass = new (...args: never[]) => AuthProvider;

// ---------------------------------------------------------------------------
// Registry Types (mirrors PaymentProvider's ProviderConfig)
// ---------------------------------------------------------------------------

export interface AuthProviderConfig {
  /** Constructor / class reference for documentation & testing. */
  getClass: () => AuthProviderClass;
  /**
   * Throws if required env vars are missing.
   * Called before instantiation, identical to the payment pattern.
   */
  envVarCheck: () => void;
  /** Create a fully-configured instance. */
  instantiate: () => AuthProvider;
  /** Features this provider is known to support (informational). */
  knownFeatures: AuthProviderFeature[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AUTH_PROVIDER_REGISTRY: Record<string, AuthProviderConfig> = {
  clerk: {
    getClass: () => ClerkAuthProvider,
    envVarCheck: () => {
      // The publishable key is needed for the client-side provider wrapper.
      // The secret key is needed for server-side SDK calls.
      if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.CLERK_PUBLISHABLE_KEY) {
        throw new Error(
          'Clerk auth provider requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY'
        );
      }
      if (!process.env.CLERK_SECRET_KEY) {
        throw new Error('Clerk auth provider requires CLERK_SECRET_KEY');
      }
    },
    instantiate: () => new ClerkAuthProvider(),
    knownFeatures: [
      'organizations',
      'organization_invites',
      'session_management',
      'user_profile_ui',
      'sign_in_ui',
      'sign_up_ui',
      'organization_switcher_ui',
      'webhooks',
      'middleware',
      'oauth',
      'magic_link',
      'mfa',
    ],
  },

  // ── Future providers go here ──────────────────────────────────────
  // e.g. supabase, firebase, etc.

  nextauth: {
    getClass: () => NextAuthProvider,
    envVarCheck: () => {
      // NextAuth requires AUTH_SECRET for signing tokens.
      if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
        throw new Error(
          'NextAuth provider requires AUTH_SECRET (or NEXTAUTH_SECRET) environment variable'
        );
      }
    },
    instantiate: () => new NextAuthProvider(),
    knownFeatures: [
      'oauth',
      'middleware',
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the list of all registered provider names. */
export function getRegisteredAuthProviderNames(): string[] {
  return Object.keys(AUTH_PROVIDER_REGISTRY);
}

/** Check whether a specific provider has its env vars configured. */
export function isAuthProviderConfigured(name: string): boolean {
  const config = AUTH_PROVIDER_REGISTRY[name];
  if (!config) return false;
  try {
    config.envVarCheck();
    return true;
  } catch {
    return false;
  }
}
