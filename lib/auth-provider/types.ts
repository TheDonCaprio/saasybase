/**
 * Auth Provider Abstraction Layer
 * ================================
 * Mirrors the payment provider pattern (see lib/payment/types.ts).
 *
 * Every concrete auth provider (Clerk, NextAuth, etc.) implements these
 * interfaces so the rest of the codebase never imports vendor-specific
 * modules directly.
 *
 * Phase 1 — define the contracts and wrap Clerk behind them.
 * Phase 2 — route all call-sites through the abstraction.
 * Phase 3 — add a second provider (e.g. NextAuth / Auth.js).
 */

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

/**
 * Features that an auth provider may or may not support.
 * Used for runtime capability checks, identical in spirit to
 * `PaymentProviderFeature` in the payment layer.
 */
export type AuthProviderFeature =
  | 'organizations'          // Multi-tenant org/team primitives
  | 'organization_invites'   // Org invitation lifecycle
  | 'session_management'     // List / revoke individual sessions
  | 'user_profile_ui'        // Drop-in profile management component
  | 'sign_in_ui'             // Drop-in sign-in component
  | 'sign_up_ui'             // Drop-in sign-up component
  | 'organization_switcher_ui' // Drop-in org switcher component
  | 'webhooks'               // Inbound webhook event delivery
  | 'middleware'              // Edge-middleware auth gating
  | 'oauth'                  // OAuth / social login
  | 'magic_link'             // Passwordless magic-link
  | 'passkeys'               // WebAuthn / passkeys
  | 'mfa';                   // Multi-factor auth

// ---------------------------------------------------------------------------
// Standardised Data Shapes
// ---------------------------------------------------------------------------

/** The minimal session object returned from every server-side auth check. */
export interface AuthSession {
  userId: string | null;
  orgId?: string | null;
  sessionId?: string | null;
}

/** Standardised user object used across the app. */
export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  lastSignInAt?: Date | null;
  /** Clerk-style email verification status, if applicable. */
  emailVerified?: boolean;
}

/** A single active session with optional device metadata. */
export interface AuthSessionInfo {
  id: string;
  status: string;
  lastActiveAt?: Date | null;
  /** Optional device / geo info (Clerk provides this). */
  activity?: {
    browserName?: string | null;
    browserVersion?: string | null;
    deviceType?: string | null;
    ipAddress?: string | null;
    city?: string | null;
    country?: string | null;
    isMobile?: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Organization-Related Shapes
// ---------------------------------------------------------------------------

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string | null;
  /** The userId of the org creator / owner. */
  createdBy: string | null;
  maxAllowedMemberships?: number | null;
  publicMetadata?: Record<string, unknown>;
}

export interface AuthOrganizationMembership {
  userId: string;
  organizationId: string;
  role: string;           // e.g. 'org:admin' | 'org:member'
}

export interface AuthOrganizationInvite {
  id: string;
  emailAddress: string;
  organizationId: string;
  role: string;
  status: string;
  expiresAt?: Date | null;
}

// ---------------------------------------------------------------------------
// Webhook Shapes
// ---------------------------------------------------------------------------

export type AuthWebhookEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organizationMembership.created'
  | 'organizationMembership.updated'
  | 'organizationMembership.deleted'
  | 'organizationInvitation.created'
  | 'organizationInvitation.accepted'
  | 'organizationInvitation.revoked'
  | 'session.created'
  | 'session.ended'
  | 'other';

export interface AuthWebhookEvent {
  type: AuthWebhookEventType;
  /** Provider-normalised payload. */
  payload: Record<string, unknown>;
  /** Raw event from the vendor (for debugging / escape hatches). */
  originalEvent: unknown;
}

// ---------------------------------------------------------------------------
// Main Provider Interface
// ---------------------------------------------------------------------------

/**
 * The core auth provider contract.
 * Every method here is async to accommodate providers that hit an API.
 *
 * Methods are grouped exactly like `PaymentProvider`:
 *   • identity / name
 *   • feature detection
 *   • server-side session helpers
 *   • user management
 *   • organization management (optional — guarded by supportsFeature)
 *   • session management (optional)
 *   • webhook ingestion (optional)
 *   • middleware helper
 */
export interface AuthProvider {
  /** Unique provider name (e.g. 'clerk', 'nextauth'). */
  readonly name: string;

  // ── Feature Detection ────────────────────────────────────────────────
  supportsFeature(feature: AuthProviderFeature): boolean;

  // ── Server-Side Session ──────────────────────────────────────────────
  /** Get the current session from the request context (server components / route handlers). */
  getSession(): Promise<AuthSession>;

  /** Get the full user object for the current request (equivalent to Clerk's `currentUser()`). */
  getCurrentUser(): Promise<AuthUser | null>;

  // ── User Management (server-side, via admin/backend API) ─────────────
  /** Fetch a user by their provider-side ID. */
  getUser(userId: string): Promise<AuthUser | null>;

  /** List users, optionally filtered by email. */
  listUsers(opts?: { emailAddress?: string[]; limit?: number }): Promise<AuthUser[]>;

  /** Delete a user from the auth provider (account deletion flow). */
  deleteUser(userId: string): Promise<void>;

  /** Update a user's profile fields. */
  updateUser(userId: string, data: { firstName?: string; lastName?: string; imageUrl?: string }): Promise<AuthUser>;

  // ── Organization Management (optional) ───────────────────────────────
  createOrganization?(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization>;

  getOrganization?(organizationId: string): Promise<AuthOrganization | null>;

  updateOrganization?(organizationId: string, data: {
    name?: string;
    slug?: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization>;

  deleteOrganization?(organizationId: string): Promise<void>;

  createOrganizationMembership?(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership>;

  deleteOrganizationMembership?(opts: {
    organizationId: string;
    userId: string;
  }): Promise<void>;

  listOrganizationMemberships?(organizationId: string): Promise<AuthOrganizationMembership[]>;

  listUserOrganizations?(userId: string): Promise<AuthOrganization[]>;

  revokeOrganizationInvitation?(opts: {
    organizationId: string;
    invitationId: string;
    requestingUserId: string;
  }): Promise<void>;

  // ── Session Management (optional) ────────────────────────────────────
  /** List all sessions for a user. */
  getUserSessions?(userId: string): Promise<AuthSessionInfo[]>;

  /** Revoke a specific session by ID. */
  revokeSession?(sessionId: string): Promise<void>;

  // ── Webhook Processing (optional) ────────────────────────────────────
  /**
   * Verify & parse an inbound webhook request.
   * Returns a standardised event or `null` if signature verification fails.
   */
  verifyWebhook?(request: {
    body: string | Buffer;
    headers: Record<string, string>;
  }): Promise<AuthWebhookEvent | null>;

  // ── Middleware Helper (optional) ──────────────────────────────────────
  /**
   * Return a Next.js middleware handler.
   * The shape mirrors `clerkMiddleware` — it's a function that receives
   * `(auth, request)` and returns `void | Response`.
   */
  getMiddleware?(): unknown;
}
