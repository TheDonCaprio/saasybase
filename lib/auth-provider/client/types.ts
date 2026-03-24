'use client';

/**
 * Auth Provider – Common Client Types
 * =====================================
 * Shared interfaces for client-side hooks across all auth providers.
 *
 * Both the Clerk and NextAuth hook adapters return these shapes,
 * so consumer components never depend on vendor-specific types.
 */

// ---------------------------------------------------------------------------
// Client User
// ---------------------------------------------------------------------------

/** A single email address on the user account. */
export interface AuthClientEmailAddress {
  emailAddress: string;
}

/** Active session metadata (from `user.getSessions()`). */
export interface AuthClientActiveSession {
  id: string;
  status: string;
  lastActiveAt: Date | null;
  latestActivity?: {
    browserName?: string | null;
    deviceType?: string | null;
    ipAddress?: string | null;
    city?: string | null;
    country?: string | null;
    isMobile?: boolean;
  } | null;
}

/**
 * The user object returned by `useAuthUser()`.
 *
 * Covers every property & method that consumer components access:
 *   - `user.firstName`, `user.lastName`, `user.fullName`, `user.imageUrl`
 *   - `user.emailAddresses[n].emailAddress`
 *   - `user.primaryEmailAddress.emailAddress`
 *   - `user.getSessions()`, `user.update()`, `user.delete()`
 */
export interface AuthClientUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  emailAddresses: AuthClientEmailAddress[];
  primaryEmailAddress: AuthClientEmailAddress | null;

  /** Fetch all active sessions for this user. */
  getSessions: () => Promise<AuthClientActiveSession[]>;

  /** Update profile fields. */
  update: (data: { firstName?: string; lastName?: string }) => Promise<void>;

  /** Delete this user account. */
  delete: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook Return Types
// ---------------------------------------------------------------------------

export interface UseAuthUserReturn {
  isSignedIn: boolean | undefined;
  isLoaded: boolean;
  user: AuthClientUser | null;
}

export interface UseAuthSessionReturn {
  orgId: string | null | undefined;
  sessionId: string | null | undefined;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
}

export interface UseAuthInstanceReturn {
  /** Sign the user out, optionally redirecting. */
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
  /** Open a profile management UI (Clerk modal, or redirect for other providers). */
  openUserProfile: (opts?: { appearance?: Record<string, unknown>; [key: string]: unknown }) => void;
  /** Switch to an organization workspace, or clear it by passing null. */
  setActiveOrganization: (orgId: string | null) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component Prop Types
// ---------------------------------------------------------------------------

/**
 * Props shared by all `AuthProvider` wrapper components (the root context).
 * Provider-specific props are allowed via `[key: string]: unknown`.
 */
export interface AuthProviderProps {
  children: React.ReactNode;
  publishableKey?: string | null;
  signInUrl?: string;
  signUpUrl?: string;
  signInFallbackRedirectUrl?: string;
  signUpFallbackRedirectUrl?: string;
  appearance?: Record<string, unknown>;
  [key: string]: unknown;
}
