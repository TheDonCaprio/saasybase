import { formatDate } from './formatDate';
import { ADMIN_API_INVENTORY } from './admin-api.inventory';

export type AdminApiAccessLevel = 'admin' | 'user' | 'public' | 'internal';

type AdminApiJsonValue =
  | string
  | number
  | boolean
  | null
  | AdminApiJsonObject
  | AdminApiJsonValue[];

interface AdminApiJsonObject {
  [key: string]: AdminApiJsonValue;
}

export interface AdminApiEndpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description?: string;
  access: AdminApiAccessLevel;
  source?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  notes?: string[];
  rateLimitTier?: 'admin' | 'user' | 'public' | 'internal';
  /** Example request body (shown as JSON in docs) */
  example?: AdminApiJsonValue;
  /** Example response payload (shown as JSON in docs) */
  response?: AdminApiJsonValue;
}

export interface AdminApiCategory {
  id: string;
  title: string;
  description: string;
  endpoints: AdminApiEndpoint[];
}

export interface AdminApiRateLimit {
  tier: 'admin' | 'user' | 'public';
  limit: string;
  burst?: string;
  notes?: string;
}

export interface AdminApiSummary {
  generatedAt: string;
  totalEndpoints: number;
  adminEndpoints: number;
  userEndpoints: number;
  publicEndpoints: number;
  internalEndpoints: number;
  categories: number;
  methods: Record<string, number>;
}

export interface AdminApiCatalog {
  summary: AdminApiSummary;
  categories: AdminApiCategory[];
  authentication: {
    guard: string;
    notes: string[];
  };
  rateLimiting: AdminApiRateLimit[];
  changelog: {
    version: string;
    releasedAt: string;
    notes: string[];
  }[];
}

const CURATED_CATEGORIES: AdminApiCategory[] = [
  {
    id: 'auth',
    title: 'Authentication',
    description: 'Register, sign in, verify email, and reset passwords. These routes are only active when AUTH_PROVIDER=nextauth.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/register',
        summary: 'Register a new user',
        description: 'Creates a new NextAuth user with email and password, stores a hashed password, and sends an email verification link.',
        access: 'public',
        body: {
          email: 'string — required; valid email',
          password: 'string — required; must meet password policy',
          name: 'string? — full name; validated and normalized',
          firstName: 'string? — optional when name is not provided',
          lastName: 'string? — optional when name is not provided',
        },
        notes: [
          'Rate limit: AUTH tier (strict).',
          'Only available when AUTH_PROVIDER=nextauth; Clerk handles registration via its own UI.',
          'Returns 409 if the email already exists.',
        ],
        rateLimitTier: 'public',
        example: { email: 'user@example.com', password: 'secureP@ss1', name: 'Jane Doe' },
        response: { id: 'user_abc123', email: 'user@example.com', requiresVerification: true }
      },
      {
        method: 'POST',
        path: '/api/auth/credentials-login',
        summary: 'Sign in with email and password',
        description: 'Authenticates the user via email/password. Sets a secure httpOnly session cookie and returns ok:true on success.',
        access: 'public',
        body: {
          email: 'string — required',
          password: 'string — required',
        },
        notes: [
          'Rate limit: AUTH tier (strict).',
          'Returns 403 with code EMAIL_NOT_VERIFIED when the user has not verified their email.',
          'Returns 401 for invalid credentials.',
        ],
        rateLimitTier: 'public',
        example: { email: 'user@example.com', password: 'secureP@ss1' },
        response: { ok: true }
      },
      {
        method: 'POST',
        path: '/api/auth/login-status',
        summary: 'Check whether credentials can sign in',
        description: 'Validates email/password without creating a session. Used to detect unverified-email accounts before attempting full sign-in.',
        access: 'public',
        body: {
          email: 'string — required',
          password: 'string — required',
        },
        notes: [
          'Rate limit: AUTH tier (strict).',
          'Returns 403 with code EMAIL_NOT_VERIFIED when credentials are correct but email verification is still pending.',
        ],
        rateLimitTier: 'public',
        example: { email: 'user@example.com', password: 'secureP@ss1' },
        response: { ok: true, canSignIn: true }
      },
      {
        method: 'POST',
        path: '/api/auth/verify-email',
        summary: 'Verify email address',
        description: 'POST sends a verification email to the authenticated user. GET with token/email query params completes verification and redirects instead of returning JSON.',
        access: 'user',
        params: {
          token: 'string? — GET only; raw verification token from the email link',
          email: 'string? — GET only; the email address being verified',
        },
        notes: [
          'POST requires authentication.',
          'GET is public (called from the email link); validates and consumes the token.',
        ],
        example: { query: { token: 'verify_abc123', email: 'user@example.com' } },
        response: { message: 'Verification email sent' }
      },
      {
        method: 'GET',
        path: '/api/auth/verify-email',
        summary: 'Complete email verification link',
        description: 'Consumes a verification token from the email link and redirects to sign-in or dashboard depending on the verification flow outcome.',
        access: 'public',
        params: {
          token: 'string — required; raw verification token from the email link',
          email: 'string — required; email being verified or confirmed',
        },
        notes: [
          'Public endpoint reached from the email link.',
          'Success returns an HTTP redirect rather than a JSON payload.',
          'Expired or invalid tokens redirect to a sign-in or dashboard error state.'
        ],
        rateLimitTier: 'public',
        example: { query: { token: 'verify_abc123', email: 'user@example.com' } },
        response: { redirect: '/sign-in?verification=success' }
      },
      {
        method: 'POST',
        path: '/api/auth/forgot-password',
        summary: 'Request password reset',
        description: 'Sends a password reset link to the given email. Always returns 200 to prevent email enumeration.',
        access: 'public',
        body: {
          email: 'string — required',
        },
        notes: [
          'Rate limit: 5 requests / 15 minutes (by IP).',
          'Response is always 200 regardless of whether the email exists.',
        ],
        rateLimitTier: 'public',
        example: { email: 'user@example.com' },
        response: { message: 'If an account with that email exists, a password reset link has been sent.' }
      },
      {
        method: 'POST',
        path: '/api/auth/reset-password',
        summary: 'Reset password with token',
        description: 'Resets the user password using a token received via the forgot-password email.',
        access: 'public',
        body: {
          token: 'string — required; from the reset email link',
          email: 'string — required',
          password: 'string — required; must meet password policy',
        },
        notes: [
          'Rate limit: 10 requests / 15 minutes (by IP).',
          'Returns 400 if token is expired or invalid.',
        ],
        rateLimitTier: 'public',
        example: { token: 'abc123...', email: 'user@example.com', password: 'newSecureP@ss1' },
        response: { message: 'Password has been reset successfully' }
      },
      {
        method: 'POST',
        path: '/api/auth/resend-verification',
        summary: 'Resend verification email',
        description: 'Accepts an email address and resends the verification email when that account exists and is still unverified.',
        access: 'public',
        body: {
          email: 'string — required',
        },
        notes: [
          'Rate limit: AUTH tier (strict).',
          'Returns the same 200 response whether or not the account exists to avoid user enumeration.',
        ],
        rateLimitTier: 'public',
        example: { email: 'user@example.com' },
        response: { ok: true, message: 'If that account exists and is awaiting verification, a verification email has been sent.' }
      },
    ]
  },
  {
    id: 'public',
    title: 'Public & account utilities',
    description: 'Health checks, contact form, and authenticated self-service account endpoints used by the dashboard.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/health',
        summary: 'Health check',
        description: 'Returns a minimal { status: "ok" } payload when unauthenticated in production, or a detailed health report when authorized (or in non-production).',
        access: 'public',
        notes: [
          'In production, a Bearer token is required for full details.',
          'Returns 503 when any critical check fails.',
        ],
        example: { headers: { Authorization: 'Bearer healthcheck_token' } },
        response: {
          status: 'healthy',
          timestamp: '2026-04-04T12:00:00Z',
          checks: { environment: true, database: true, auth: true, payments: true },
          providers: {
            auth: { active: 'nextauth', available: ['nextauth', 'clerk'], configured: ['nextauth'] },
            payments: { active: 'stripe', available: ['stripe', 'paystack', 'paddle', 'razorpay'], configured: ['stripe'] },
          },
          errors: []
        }
      },
      {
        method: 'POST',
        path: '/api/contact',
        summary: 'Submit contact form',
        description: 'Accepts a public contact form submission and sends an email to the configured support inbox.',
        access: 'public',
        body: {
          name: 'string — 2..120 chars',
          email: 'string — valid email',
          topic: 'string — 2..160 chars',
          message: 'string — 20..2000 chars',
          company: 'string? — 0..160 chars',
        },
        notes: [
          'Rate limit: 5 requests / hour (by IP).',
          'Returns field-level validation errors when input is invalid.',
        ],
        rateLimitTier: 'public',
        example: { name: 'Jane Doe', email: 'jane@example.com', topic: 'Billing question', message: 'I have a question about upgrading my plan to the Pro tier.' },
        response: { success: true }
      },
      {
        method: 'GET',
        path: '/api/settings/format',
        summary: 'Read public format preferences',
        description: 'Returns the global date/time formatting mode and optional timezone used by unauthenticated UI surfaces.',
        access: 'public',
        notes: ['Public endpoint (no auth). Returns 500 { ok:false, error } when format settings cannot be loaded.'],
        rateLimitTier: 'public',
        example: {},
        response: { ok: true, mode: 'short', timezone: 'America/New_York' }
      },
      {
        method: 'GET',
        path: '/api/site-info',
        summary: 'Read site branding info',
        description: 'Returns the configured site name and default token label for lightweight client-side branding and copy.',
        access: 'public',
        notes: ['Public endpoint (no auth). Falls back to NEXT_PUBLIC_SITE_NAME or SaaSyBase when the site name setting is unavailable.'],
        rateLimitTier: 'public',
        example: {},
        response: { siteName: 'SaaSyBase', tokenLabel: 'tokens' }
      },
      {
        method: 'GET',
        path: '/api/plan-preview',
        summary: 'Deprecated plan preview placeholder',
        description: 'Placeholder route that currently always returns 404 and does not expose plan preview data.',
        access: 'public',
        notes: ['Public endpoint (no auth). Success is not implemented.'],
        rateLimitTier: 'public',
        example: {},
        response: { error: 'Not found' }
      },
      {
        method: 'GET',
        path: '/api/billing/test',
        summary: 'Deprecated billing test placeholder',
        description: 'Legacy billing test endpoint that is intentionally disabled and always returns 404.',
        access: 'public',
        notes: ['Public endpoint (no auth). Success is not implemented.'],
        rateLimitTier: 'public',
        example: {},
        response: { error: 'Not found' }
      },
      {
        method: 'POST',
        path: '/api/fix-status',
        summary: 'Deprecated status fix placeholder',
        description: 'Legacy mutation endpoint that is intentionally disabled and always returns 404.',
        access: 'public',
        notes: ['Public endpoint (no auth). Success is not implemented.'],
        rateLimitTier: 'public',
        example: {},
        response: { error: 'Not found' }
      },
      {
        method: 'GET',
        path: '/api/minimal',
        summary: 'Minimal health stub',
        description: 'Returns a minimal success payload used for smoke testing the route layer.',
        access: 'public',
        notes: ['Public endpoint (no auth).'],
        rateLimitTier: 'public',
        example: {},
        response: { ok: true, message: 'Minimal API working' }
      },
      {
        method: 'GET',
        path: '/api/user/export-account-data',
        summary: 'Download account data',
        description: 'Streams a JSON export of all user-owned data: profile, security sessions, settings, billing, support history, notifications, and organizations.',
        access: 'user',
        notes: [
          'Rate limit: EXPORT tier (strict).',
          'Returns Content-Disposition: attachment header for download.',
          'Does not include other users\' internal IDs for privacy.',
        ],
        rateLimitTier: 'user',
        example: {},
        response: { exportedAt: '2026-04-04T12:00:00Z', version: 1, profile: { id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe' }, security: { sessions: [{ id: 'sess_1', status: 'ACTIVE', lastActiveAt: '2026-04-04T11:58:00Z', activity: null }] }, settings: [], billing: { subscriptions: [], payments: [] }, support: [], notifications: [], organizations: { memberships: [], owned: [] } }
      },
      {
        method: 'DELETE',
        path: '/api/user/delete-account',
        summary: 'Delete my account',
        description: 'Permanently deletes the authenticated user and all their owned data.',
        access: 'user',
        notes: [
          'This action is irreversible.',
          'Best-effort deletes the Clerk user too when applicable.',
        ],
        example: {},
        response: { success: true, message: 'Account data deleted successfully' }
      },
      {
        method: 'GET',
        path: '/api/user/profile',
        summary: 'Get current user profile',
        description: 'Returns the authenticated user profile, token balances, current subscription summary, organization context, and invitation state.',
        access: 'user',
        example: {},
        response: { user: { id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', role: 'USER' }, paidTokens: { tokenName: 'tokens', remaining: 100, isUnlimited: false, displayRemaining: '100' }, subscription: { planName: 'Pro', expiresAt: 'May 1, 2026', tokenName: 'tokens', tokens: { total: 1000, used: 900, remaining: 100, isUnlimited: false, displayRemaining: '100' } }, organization: null, sharedTokens: null, freeTokens: { tokenName: 'tokens', total: null, remaining: 50 }, planSource: 'PERSONAL', planActionLabel: 'Change Plan', canCreateOrganization: true, hasPendingTeamInvites: false }
      },
    ]
  },
  {
    id: 'users',
    title: 'User management',
    description:
      'Fetch users, elevate access, adjust token balances, and inspect payment history without leaving the dashboard.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/users',
        summary: 'List users',
        description:
          'Returns paginated users with optional search, role/billing filters, and cursor pagination. Response includes Clerk metadata best-effort.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          cursor: 'string? — keyset cursor; when sortBy=payments, cursor is base64("<paymentsCount>::<id>")',
          count: "'false'? — omit totalCount for faster responses",
          search: 'string? — matches email, name, or id (contains)',
          role: "string? — 'ADMIN' | 'USER' | 'ALL'",
          billing: "string? — 'ALL' | 'PAID' | 'FREE'",
          sortBy: "string? — 'createdAt' | 'name' | 'payments' (alias: sort)",
          sortOrder: "'asc' | 'desc'? (alias: order)"
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("users").',
          'Rate limit: admin-users:list (limit 240 / 120s).',
          'Clerk data enrichment is best-effort; failures return clerkData:null for that user.'
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', search: 'jane', role: 'USER', billing: 'PAID', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: {
          users: [{ id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', role: 'USER', createdAt: '2026-01-10T08:00:00.000Z', paymentsCount: 3, _count: { payments: 3 }, subscriptions: [{ id: 'sub_1', status: 'ACTIVE', expiresAt: '2026-05-01T00:00:00.000Z', plan: { id: 'plan_pro', name: 'Pro Monthly' } }], clerkData: null }],
          totalCount: 1,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          nextCursor: null
        }
      },
      {
        method: 'GET',
        path: '/api/admin/users/search',
        summary: 'Search users (typeahead)',
        description: 'Lightweight search by name/email for admin UX (returns up to 10 results).',
        access: 'admin',
        params: {
          q: 'string? — query; returns empty list when length < 2',
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("users").'],
        rateLimitTier: 'admin',
        example: { q: 'jane' },
        response: { users: [{ id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe' }] }
      },
      {
        method: 'GET',
        path: '/api/admin/users/[userId]',
        summary: 'Get user details',
        description: 'Fetches a user plus recent payments and all subscriptions (ordered newest first).',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("users").'],
        rateLimitTier: 'admin',
        example: { path: { userId: 'user_abc' } },
        response: { user: { id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', role: 'USER', tokenBalance: 150, createdAt: '2026-01-10T08:00:00.000Z', subscriptions: [{ id: 'sub_1', status: 'ACTIVE', plan: { id: 'plan_pro', name: 'Pro Monthly' }, createdAt: '2026-04-01T08:00:00.000Z' }], payments: [{ id: 'pay_1', amountCents: 2900, currency: 'usd', createdAt: '2026-04-01T08:00:00.000Z' }] } }
      },
      {
        method: 'PATCH',
        path: '/api/admin/users/[userId]',
        summary: 'Perform a user admin action',
        description:
          'Performs one of several action-based mutations. Request must be JSON and include an action string and action-specific fields.',
        access: 'admin',
        body: {
          action: "'updateProfile' | 'adjustTokens' | 'assignPlan' | 'updateRole' | 'expireSubscription'",
          role: "'USER' | 'ADMIN'? — only used for action=updateRole (admins only)",
          data: {
            updateProfile: {
              firstName: 'string?',
              lastName: 'string?',
              email: 'string? | null — empty string becomes null; moderators cannot change email on ADMIN targets',
              role: "'USER' | 'ADMIN'? — only applied when actor is ADMIN",
            },
            adjustTokens: {
              amount: 'number | string — coerced to integer; must be non-zero',
              reason: 'string? — trimmed; optional',
            },
            assignPlan: {
              planId: 'string — required; DB plan id',
            },
            expireSubscription: {
              clearPaidTokens: 'boolean? — when true, may clear token balance depending on paid-token policy',
            },
          },
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("users").',
          'Rate limit: admin-users:action (limit 60 / 120s).',
          'action=updateRole is admin-only; moderators will receive 403.',
          'On invalid action, returns 400 { error: "Invalid action" }.'
        ],
        rateLimitTier: 'admin',
        example: { action: 'adjustTokens', amount: 50, reason: 'Bonus for early adopter' },
        response: { success: true, user: { id: 'user_abc', tokenBalance: 150 } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/users/[userId]',
        summary: 'Delete a user',
        description: 'Deletes the user and dependent records (best-effort deletes Clerk user too).',
        access: 'admin',
        notes: [
          'Auth: requires admin/moderator, but only ADMIN can delete (403 otherwise).',
          'Rate limit: admin-users:delete (limit 10 / 120s).',
          'Cannot delete the currently signed-in admin (400).'
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { success: true }
      },
      {
        method: 'GET',
        path: '/api/admin/users/[userId]/payments',
        summary: 'Inspect user payments',
        description: 'Lists payments for the user (paged via page/limit) and returns optional totalCount.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          count: "'false'? — omit totalCount"
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("users").',
          'Rate limit: admin-users:payments:list (limit 240 / 120s).'
        ],
        rateLimitTier: 'admin',
        example: { path: { userId: 'user_abc' }, query: { page: '1', limit: '25', count: 'true' } },
        response: { payments: [{ id: 'pay_1', amount: 2900, amountFormatted: '$29.00', displayCurrency: 'USD', currency: 'usd', status: 'SUCCEEDED', createdAt: '2026-04-01T08:00:00.000Z', planName: 'Pro Monthly', paymentProvider: 'stripe', externalPaymentId: 'pi_123', externalSessionId: 'cs_123', externalRefundId: null, dashboardUrl: 'https://dashboard.stripe.com/payments/pi_123' }], totalCount: 1, currentPage: 1, totalPages: 1 }
      },
      {
        method: 'PATCH',
        path: '/api/admin/users/[userId]/role',
        summary: 'Change user role',
        description: 'Promote or demote a user between ADMIN and USER roles.',
        access: 'admin',
        body: {
          role: "'ADMIN' | 'USER'"
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin() (moderators are forbidden).',
          'Rate limit: admin-users:role (limit 60 / 120s).'
        ],
        rateLimitTier: 'admin',
        example: { role: 'ADMIN' },
        response: { success: true, user: { id: 'user_abc', email: 'jane@example.com', role: 'ADMIN' } }
      }
    ]
  },
  {
    id: 'payments',
    title: 'Payments & refunds',
    description: 'Manage invoices, trigger refunds, and backfill historical events.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/payments',
        summary: 'List payments',
        description: 'Returns paginated payments with optional search, status/date filters, and cursor pagination.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          cursor: 'string? — keyset cursor; depends on sortBy (see notes)',
          count: "'false'? — omit totalCount",
          search: 'string? — matches many fields (payment ids, user fields, plan name, provider refs)',
          status: "string? — 'ALL' | 'ACTIVE' | 'EXPIRED' | 'PENDING' | <payment status>",
          sortBy: "string? — 'createdAt' | 'amount' | 'expiresAt' (alias: sort)",
          sortOrder: "'asc' | 'desc'? (alias: order)",
          startDate: 'string? — ISO date/time or date; filters payment.createdAt >= startDate',
          endDate: 'string? — ISO date/time or date; filters payment.createdAt < endDate'
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("transactions").',
          'Cursor format: createdAt => base64("<createdAtIso>::<id>"); amount => base64("<amountCents>::<id>"); expiresAt => payment id (server derives subscription.expiresAt).'
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', search: 'jane@example.com', status: 'COMPLETED', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: {
          payments: [{ id: 'pay_123', provider: 'stripe', status: 'COMPLETED', amountCents: 2900, currency: 'usd', user: { email: 'jane@example.com' }, plan: { name: 'Pro' }, createdAt: '2026-03-15T10:00:00Z' }],
          totalCount: 42
        }
      },
      {
        method: 'POST',
        path: '/api/admin/payments/[paymentId]/refund',
        summary: 'Refund a payment (full refund)',
        description: 'Creates a provider refund for the payment and marks the local payment as REFUNDED. Optionally cancels/schedules cancellation for the associated subscription.',
        access: 'admin',
        body: {
          reason: "'duplicate' | 'fraudulent' | 'requested_by_customer' | 'testing'?",
          notes: 'string? — max 500',
          cancelSubscription: 'boolean? — if true and subscription has externalSubscriptionId, attempts provider cancellation',
          cancelMode: "'immediate' | 'period_end'? — provider cancellation mode when cancelSubscription=true",
          localCancelMode: "'immediate' | 'period_end'? — local subscription cancellation mode",
          clearPaidTokens: 'boolean? — when true, may clear token balance depending on paid-token policy'
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("transactions").',
          'Rate limit: admin-refund (limit 10 / 60s).',
          'Validation: body is validated by apiSchemas.refund (zod).',
          'This handler issues full refunds only (no amount parameter).'
        ],
        rateLimitTier: 'admin',
        example: { reason: 'requested_by_customer', notes: 'Customer requested refund', cancelSubscription: true, cancelMode: 'immediate' },
        response: { success: true, refundId: 're_abc123', status: 'REFUNDED' }
      },
      {
        method: 'POST',
        path: '/api/admin/payments/backfill-invoices',
        summary: 'Backfill Stripe external payment IDs',
        description: 'Scans recent Stripe payments missing externalPaymentId and attempts to backfill via Stripe Checkout Session or related subscription invoice.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'No request body is used.',
          'Legacy Stripe columns may still be read as migration inputs, but the route now writes provider-neutral external fields.',
          'Processes up to 100 payments per call.'
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { success: true, processed: 12, updated: 9, mode: 'externalPaymentId', errors: ['Payment pay_4: Duplicate paymentIntentId pi_123 (claimed by payment pay_existing)'] }
      }
    ]
  },
  {
    id: 'plans',
    title: 'Plans & subscriptions',
    description: 'Create, activate, and audit subscription plans across the catalog.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/plans',
        summary: 'List subscription plans',
        description: 'Returns all plans ordered by sortOrder ASC. Response is a JSON array (not wrapped).',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("users"). Rate limit: admin-plans:list (limit 240 / 120s).'],
        rateLimitTier: 'admin',
        example: {},
        response: [{ id: 'plan_1', name: 'Pro Monthly', shortDescription: 'For growing teams', description: '<p>Rich text description</p>', priceCents: 2900, durationHours: 720, active: true, stripePriceId: 'price_123', externalPriceId: 'price_123', externalPriceIds: '{"stripe":"price_123"}', externalProductIds: '{"stripe":"prod_123"}', autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1, sortOrder: 1, tokenLimit: 1000, tokenName: 'tokens', supportsOrganizations: true, organizationSeatLimit: 10, organizationTokenPoolStrategy: 'SHARED_FOR_ORG' }]
      },
      {
        method: 'POST',
        path: '/api/admin/plans',
        summary: 'Create plan',
        description: 'Creates a plan row and may auto-create provider products/prices when auto-create is enabled.',
        access: 'admin',
        body: {
          name: 'string — 1..120',
          shortDescription: 'string | null? — max 200',
          description: 'string | null? — max 2000 (sanitized when provided)',
          durationHours: 'number — int 1..8760',
          priceCents: 'number — int 0..500000',
          active: 'boolean? — default true',
          sortOrder: 'number? — int -1000..10000 (default 0)',
          externalPriceId: 'string? — preferred provider-neutral price ID; empty string treated as undefined',
          stripePriceId: 'string? — legacy alias for externalPriceId',
          autoRenew: 'boolean? — default false',
          recurringInterval: "'day' | 'week' | 'month' | 'year'? — required when autoRenew is true",
          recurringIntervalCount: 'number? — positive integer; default 1',
          tokenLimit: 'number? — positive integer or null (unlimited)',
          tokenName: 'string? — display label for tokens (e.g. "credits")',
          supportsOrganizations: 'boolean? — when true allows this plan to be used by team workspaces',
          organizationSeatLimit: 'number? — max members allowed in the workspace',
          organizationTokenPoolStrategy: "'SHARED_FOR_ORG' | 'PRIVATE_FOR_USER'? — default 'SHARED_FOR_ORG'",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-plans:create (60 / 120s).',
          'Automatic price creation: When enabled, the handler attempts to sync the new plan to all configured providers (Stripe, Paystack, Razorpay, Paddle) and may return warnings if some providers skip creation (e.g. daily plans on Razorpay).',
        ],
        rateLimitTier: 'admin',
        example: { name: 'Pro Monthly', priceCents: 2900, durationHours: 720, autoRenew: true, recurringInterval: 'month', supportsOrganizations: true, organizationSeatLimit: 10 },
        response: { success: true, plan: { id: 'plan_new', name: 'Pro Monthly', priceCents: 2900, active: true, autoRenew: true }, warnings: [] }
      },
      {
        method: 'PATCH',
        path: '/api/admin/plans/[planId]',
        summary: 'Toggle plan active flag',
        description: 'Sets active=true/false on the plan.',
        access: 'admin',
        body: {
          active: 'boolean'
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:toggle (limit 60 / 120s).',
          'Validation: apiSchemas.adminPlanToggle (zod).'
        ],
        rateLimitTier: 'admin',
        example: { active: false },
        response: { success: true, plan: { id: 'plan_1', name: 'Pro Monthly', active: false } }
      },
      {
        method: 'PUT',
        path: '/api/admin/plans/[planId]',
        summary: 'Update plan metadata',
        description: 'Updates selected mutable plan fields. Some billing-shape fields are immutable after creation.',
        access: 'admin',
        body: {
          name: 'string? — 1..120',
          shortDescription: 'string | null?',
          description: 'string | null? (sanitized)',
          priceCents: 'number? — int 0..500000',
          active: 'boolean?',
          sortOrder: 'number? — int -1000..10000',
          externalPriceId: 'string | null? — preferred provider-neutral price ID; empty string -> null; undefined means no change',
          stripePriceId: 'string | null? — legacy alias for externalPriceId',
          tokenLimit: 'number | null?',
          tokenName: 'string | null?',
          supportsOrganizations: 'boolean?',
          organizationSeatLimit: 'number | null?',
          organizationTokenPoolStrategy: "'SHARED_FOR_ORG' | null?",
          createStripePrice: 'boolean? — default false',
          recurringIntervalCount: 'number? — int 1..365',
          autoRenew: 'boolean? (immutable: cannot change)',
          recurringInterval: "'day' | 'week' | 'month' | 'year'? (immutable: cannot change)",
          durationHours: 'number? (immutable: cannot change)',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:update (limit 60 / 120s).',
          'Validation: apiSchemas.adminPlanUpdate (zod) requires at least one field.',
          'Server rejects changes to autoRenew, recurringInterval, and durationHours (400).',
          'When changing priceCents or recurringIntervalCount, server may auto-create prices across configured providers; recurringIntervalCount changes are blocked if active subscribers exist.'
        ],
        rateLimitTier: 'admin',
        example: { name: 'Pro Monthly v2', shortDescription: 'Updated plan copy', priceCents: 3900 },
        response: { success: true, plan: { id: 'plan_1', name: 'Pro Monthly v2', priceCents: 3900, externalPriceId: 'price_new_123' }, warnings: [] }
      },
      {
        method: 'DELETE',
        path: '/api/admin/plans/[planId]',
        summary: 'Delete plan',
        description: 'Deletes the plan. Blocks if ACTIVE (unexpired) or PENDING subscriptions exist unless forced.',
        access: 'admin',
        params: {
          force: "'1' | 'true'? — when provided, deletes historical subscriptions/payments and then deletes the plan",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:delete (limit 60 / 120s).',
          'force is a query parameter on the DELETE request, not a JSON body field.',
        ],
        rateLimitTier: 'admin',
        example: { query: { force: 'true' } },
        response: { success: true, deleted: { subscriptions: ['sub_old_1'], paymentsDeleted: 1 }, force: false }
      },
      {
        method: 'POST',
        path: '/api/admin/plans/[planId]/create-stripe',
        summary: 'Create provider price for a plan',
        description: 'Creates/finds a provider product and creates a price for the current provider; updates plan.externalPriceId and may persist env var for seeded plans.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:createPrice (limit 20 / 120s).',
          'Requires payment provider configuration and auto-create enabled (PAYMENT_AUTO_CREATE=true or a provider-specific *_AUTO_CREATE flag).'
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { success: true, message: 'Price created successfully', plan: { id: 'plan_1', externalPriceId: 'price_abc123' }, price: { id: 'price_abc123', amount: 2900, currency: 'USD', recurring: { interval: 'month', interval_count: 1 } }, product: { id: 'prod_123', name: 'Pro Monthly' }, activeSubscriptions: 3, warning: '3 active subscriptions will continue using the previous price. Manual migration required if desired.' }
      },
      {
        method: 'POST',
        path: '/api/admin/plans/verify',
        summary: 'Verify a provider price ID',
        description: 'Verifies a priceId against the active payment provider and returns a safe subset of fields.',
        access: 'admin',
        body: {
          priceId: 'string — required',
        },
        notes: ['Auth: requires ADMIN via requireAdmin(). On provider verify failure, returns 400 with error message.'],
        rateLimitTier: 'admin',
        example: { priceId: 'price_abc123' },
        response: { id: 'price_abc123', unit_amount: 2900, currency: 'USD', recurring: { interval: 'month', intervalCount: 1 }, product: 'prod_123', type: 'recurring' }
      }
    ]
  },
  {
    id: 'support',
    title: 'Support & notifications',
    description: 'Drive the helpdesk, reply to tickets, and broadcast announcements.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/support/tickets',
        summary: 'List my support tickets',
        description: 'Lists the signed-in user’s tickets with replies included. Supports page/limit and optional keyset cursor (createdAt desc).',
        access: 'user',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          status: "string? — 'ALL' or ticket status",
          search: 'string? — id/subject/message contains',
          sortBy: "'createdAt' | 'lastResponse'? — default createdAt",
          sortOrder: "'asc' | 'desc'? — default desc",
          cursor: 'string? — base64("<createdAtIso>::<id>") (only for sortBy=createdAt & sortOrder=desc)',
          count: "'false'? — omit totalCount",
        },
        notes: ['Rate limit: support-tickets:read (limit 300 / 60s).'],
        rateLimitTier: 'user',
        example: { query: { page: '1', limit: '20', status: 'OPEN', search: 'dashboard' } },
        response: { tickets: [{ id: 'ticket_1', subject: 'Need help', message: 'The dashboard is blank.', status: 'OPEN', category: 'GENERAL', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', replies: [{ id: 'reply_1', message: 'We are looking into this.', createdAt: '2026-04-04T12:05:00.000Z', user: { email: 'support@example.com', role: 'ADMIN' } }] }], totalCount: 1, currentPage: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/support/tickets',
        summary: 'Create support ticket',
        description: 'Creates a new support ticket for the signed-in user.',
        access: 'user',
        body: {
          subject: 'string — required; trimmed; must be non-empty',
          message: 'string — required; trimmed; must be non-empty'
        },
        notes: ['Rate limit: support-tickets:create (limit 30 / 60s).'],
        rateLimitTier: 'user',
        example: { subject: 'Cannot access dashboard', message: 'After upgrading to Pro, my dashboard shows an error.' },
        response: { ticket: { id: 'ticket_abc', subject: 'Cannot access dashboard', message: 'After upgrading to Pro, my dashboard shows an error.', category: 'GENERAL', status: 'OPEN', createdAt: '2026-04-04T12:00:00.000Z' } }
      },
      {
        method: 'GET',
        path: '/api/support/tickets/[ticketId]',
        summary: 'Get my support ticket',
        description: 'Fetches one ticket by id for the signed-in user, including replies.',
        access: 'user',
        rateLimitTier: 'user',
        example: { path: { ticketId: 'ticket_1' } },
        response: { id: 'ticket_1', subject: 'Need help', message: 'The dashboard is blank.', category: 'GENERAL', status: 'OPEN', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', replies: [{ id: 'reply_1', message: 'We are looking into this.', createdAt: '2026-04-04T12:05:00.000Z', user: { email: 'support@example.com', role: 'ADMIN' } }] }
      },
      {
        method: 'PATCH',
        path: '/api/support/tickets/[ticketId]',
        summary: 'Close my support ticket',
        description: 'Users can only set status=CLOSED on their own tickets.',
        access: 'user',
        body: {
          status: "'CLOSED' — any other status is rejected",
        },
        notes: ['Rate limit: support-tickets:update (limit 30 / 60s).'],
        rateLimitTier: 'user',
        example: { status: 'CLOSED' },
        response: { id: 'ticket_1', userId: 'user_abc', subject: 'Need help', message: 'The dashboard is blank.', category: 'GENERAL', status: 'CLOSED', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:30:00.000Z' }
      },
      {
        method: 'POST',
        path: '/api/support/tickets/[ticketId]/reply',
        summary: 'Reply to my ticket',
        description: 'Adds a user reply. Fails if ticket is CLOSED.',
        access: 'user',
        body: {
          message: 'string — required; trimmed; non-empty',
        },
        notes: ['Rate limit: support-tickets:reply (limit 30 / 60s).'],
        rateLimitTier: 'user',
        example: { message: 'I have attached the screenshot and more details.' },
        response: { reply: { id: 'reply_2', ticketId: 'ticket_1', userId: 'user_abc', message: 'I have attached the screenshot and more details.', createdAt: '2026-04-04T12:10:00.000Z' } }
      },
      {
        method: 'GET',
        path: '/api/admin/support/tickets',
        summary: 'List support tickets (admin)',
        description: 'Lists tickets across all users with optional filters and keyset cursor (createdAt desc).',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          status: "string? — 'ALL' or ticket status",
          search: 'string? — id/subject/message/user.email contains',
          sortBy: "'createdAt' | 'status' | 'lastResponse'?",
          sortOrder: "'asc' | 'desc'?",
          startDate: 'string? — YYYY-MM-DD (interpreted as UTC midnight, inclusive)',
          endDate: 'string? — YYYY-MM-DD (interpreted as UTC midnight, exclusive)',
          cursor: 'string? — base64("<createdAtIso>::<id>") when sortBy=createdAt & sortOrder=desc',
          count: "'false'? — omit totalCount",
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("support").'],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', status: 'OPEN', search: 'billing' } },
        response: { tickets: [{ id: 'ticket_1', userId: 'user_abc', subject: 'Need help', message: 'The dashboard is blank.', category: 'GENERAL', status: 'OPEN', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', user: { email: 'jane@example.com', name: 'Jane Doe' }, replies: [{ id: 'reply_1', message: 'We are looking into this.', createdAt: '2026-04-04T12:05:00.000Z', user: { email: 'support@example.com', name: 'Support Agent', role: 'ADMIN' } }] }], totalCount: 1, currentPage: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/admin/support/tickets',
        summary: 'Create ticket on behalf of a user',
        description: 'Creates a ticket with createdByRole=ADMIN for an existing user.',
        access: 'admin',
        body: {
          userId: 'string — required',
          subject: 'string — trimmed; 1..200',
          message: 'string — trimmed; 1..5000',
        },
        notes: ['Validation: zod schema createTicketSchema in handler.'],
        rateLimitTier: 'admin',
        example: { userId: 'user_abc', subject: 'Manual billing follow-up', message: 'We created this ticket on your behalf.', category: 'BILLING' },
        response: { ticket: { id: 'ticket_admin_1', userId: 'user_abc', subject: 'Manual billing follow-up', message: 'We created this ticket on your behalf.', category: 'BILLING', status: 'OPEN', createdByRole: 'ADMIN', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z' } }
      },
      {
        method: 'GET',
        path: '/api/admin/support/tickets/[ticketId]',
        summary: 'Get support ticket (admin)',
        description: 'Fetches a ticket by id including user and replies.',
        access: 'admin',
        rateLimitTier: 'admin',
        example: { path: { ticketId: 'ticket_1' } },
        response: { id: 'ticket_1', subject: 'Need help', message: 'The dashboard is blank.', category: 'GENERAL', status: 'OPEN', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', user: { email: 'jane@example.com', name: 'Jane Doe' }, replies: [{ id: 'reply_1', message: 'We are looking into this.', createdAt: '2026-04-04T12:05:00.000Z', user: { email: 'support@example.com', name: 'Support Agent', role: 'ADMIN' } }] }
      },
      {
        method: 'PATCH',
        path: '/api/admin/support/tickets/[ticketId]',
        summary: 'Update ticket status (admin)',
        description: 'Sets status to OPEN, IN_PROGRESS, or CLOSED.',
        access: 'admin',
        body: {
          status: "'OPEN' | 'IN_PROGRESS' | 'CLOSED'",
        },
        rateLimitTier: 'admin',
        example: { status: 'IN_PROGRESS' },
        response: { ticket: { id: 'ticket_1', userId: 'user_abc', subject: 'Need help', message: 'The dashboard is blank.', category: 'GENERAL', status: 'IN_PROGRESS', createdByRole: 'USER', createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:15:00.000Z' } }
      },
      {
        method: 'POST',
        path: '/api/admin/support/tickets/[ticketId]/reply',
        summary: 'Reply to ticket (admin)',
        description: 'Creates an admin reply; may auto-set ticket status to IN_PROGRESS when replying to OPEN.',
        access: 'admin',
        body: {
          message: 'string — required; trimmed; non-empty',
        },
        rateLimitTier: 'admin',
        example: { message: 'We have identified the issue and deployed a fix.' },
        response: { reply: { id: 'reply_admin_1', ticketId: 'ticket_1', userId: 'user_admin', message: 'We have identified the issue and deployed a fix.', createdAt: '2026-04-04T12:20:00.000Z' } }
      }
    ]
  },
  {
    id: 'team',
    title: 'Team & organizations',
    description: 'Provision team workspaces, manage invites, and adjust shared-token settings.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/team/summary',
        summary: 'Team dashboard summary',
        description: 'Returns derived org/membership state for the signed-in user.',
        access: 'user',
        params: {
          sync: "'1'? — force server-side sync before returning state",
        },
        notes: [
          'providerOrganizationId is the canonical backing-provider org identifier when one exists.',
          'clerkOrganizationId is retained only as a legacy compatibility alias and may be null even when providerOrganizationId is present.'
        ],
        rateLimitTier: 'user',
        example: { query: { sync: '1' } },
        response: {
          ok: true,
          access: {
            allowed: true,
            kind: 'OWNER',
            subscription: {
              id: 'sub_team_1',
              status: 'ACTIVE',
              expiresAt: '2026-05-01T00:00:00.000Z'
            },
            plan: {
              id: 'plan_team',
              name: 'Team Pro',
              tokenName: 'tokens',
              organizationSeatLimit: 10,
              supportsOrganizations: true
            }
          },
          organization: {
            id: 'org_1',
            providerOrganizationId: null,
            clerkOrganizationId: null,
            name: 'Acme Workspace',
            slug: 'acme-workspace',
            ownerUserId: 'user_1',
            planId: 'plan_team',
            planName: 'Team Pro',
            planTokenName: 'tokens',
            seatLimit: 10,
            tokenPoolStrategy: 'SHARED_FOR_ORG',
            memberTokenCap: null,
            memberCapStrategy: 'SOFT',
            memberCapResetIntervalHours: null,
            ownerExemptFromCaps: false,
            createdAt: '2026-04-01T00:00:00.000Z',
            members: [],
            invites: [],
            stats: { memberCount: 0, inviteCount: 0, seatsRemaining: 10 }
          }
        }
      },
      {
        method: 'POST',
        path: '/api/team/provision',
        summary: 'Provision a team workspace',
        description: 'Ensures the user has an organization workspace (creates if missing).',
        access: 'user',
        body: {
          name: "string? — optional; 1..30; regex /^[A-Za-z0-9\\-\\.\\s,']+$/",
        },
        notes: ['On invalid name, returns 400 with a descriptive error string.'],
        rateLimitTier: 'user',
        example: { name: 'Acme Workspace' },
        response: {
          ok: true,
          access: { allowed: true, kind: 'OWNER' },
          organization: {
            id: 'org_1',
            name: 'Acme Workspace',
            slug: 'acme-workspace',
            stats: { memberCount: 1, inviteCount: 0, seatsRemaining: 9 }
          }
        }
      },
      {
        method: 'PATCH',
        path: '/api/team/settings',
        summary: 'Update workspace shared-token caps',
        description: 'Updates org-level caps/strategy/reset interval. Only owners can update.',
        access: 'user',
        body: {
          memberTokenCap: 'number | string | null? — non-negative integer or null; allowZero=true',
          memberCapStrategy: "'SOFT' | 'HARD' | 'DISABLED'? (case-insensitive)",
          memberCapResetIntervalHours: 'number | string | null? — positive integer or null',
          ownerExemptFromCaps: 'boolean? — when true, workspace owner bypasses member cap enforcement',
        },
        notes: [
          'At least one of the three fields must be present (400 otherwise).',
          'Requires owner access; non-owners receive 403.',
        ],
        rateLimitTier: 'user',
        example: { memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, ownerExemptFromCaps: true },
        response: {
          ok: true,
          access: { allowed: true, kind: 'OWNER' },
          organization: {
            id: 'org_1',
            name: 'Acme Workspace',
            memberTokenCap: 250,
            memberCapStrategy: 'SOFT',
            memberCapResetIntervalHours: 24,
            ownerExemptFromCaps: true
          }
        }
      },
      {
        method: 'PATCH',
        path: '/api/team/members/cap-override',
        summary: 'Override a member shared-token cap',
        description: 'Lets the workspace owner set or clear a per-member shared-token cap override, then returns refreshed team dashboard state.',
        access: 'user',
        body: {
          userId: 'string — required member user id',
          capOverride: 'number | null — positive integer to set, null or 0 to clear',
        },
        notes: [
          'Auth: requires an authenticated session and owner access to the active workspace.',
          'Returns 403 when the caller is not the org owner.',
          'Returns 404 when the target user is not a member of the workspace.'
        ],
        rateLimitTier: 'user',
        example: { userId: 'user_member_1', capOverride: 150 },
        response: { ok: true, access: { allowed: true, kind: 'OWNER' }, organization: { id: 'org_1', name: 'Acme Workspace', memberTokenCap: 250, memberCapStrategy: 'SOFT', members: [{ userId: 'user_member_1', effectiveMemberCap: 150, memberTokenCapOverride: 150, memberTokenUsage: 25 }] } }
      },
      {
        method: 'POST',
        path: '/api/team/invite',
        summary: 'Invite a member',
        description: 'Creates/updates a site-hosted invite and emails the recipient.',
        access: 'user',
        body: {
          email: 'string — required; normalized to lowercase',
          role: 'string? — case-insensitive; anything containing "admin" maps to org:admin, else org:member',
        },
        notes: [
          'Requires a provisioned workspace; otherwise returns 400.',
          'Request role is normalized on input, while the returned invite snapshot uses persisted uppercase enum values such as MEMBER/ADMIN.',
          'In response payloads, clerkOrganizationId is a legacy compatibility alias for older Clerk-based consumers; prefer providerOrganizationId.'
        ],
        rateLimitTier: 'user',
        example: { email: 'teammate@example.com', role: 'member' },
        response: { ok: true, access: { allowed: true, kind: 'OWNER' }, organization: { id: 'org_1', providerOrganizationId: 'org_provider_1', clerkOrganizationId: 'legacy_clerk_org_compat_1', name: 'Acme Workspace', slug: 'acme-workspace', ownerUserId: 'user_owner', planId: 'plan_business', planName: 'Business', planTokenName: 'credits', seatLimit: 10, tokenPoolStrategy: 'SHARED_FOR_ORG', memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, ownerExemptFromCaps: true, createdAt: '2026-04-01T08:00:00.000Z', members: [{ id: 'membership_1', userId: 'user_owner', name: 'Jane Owner', email: 'owner@example.com', role: 'OWNER', status: 'ACTIVE', joinedAt: '2026-04-01T08:00:00.000Z', sharedTokenBalance: 250, memberTokenCapOverride: null, memberTokenUsage: 0, memberTokenUsageWindowStart: null, effectiveMemberCap: null, ownerExemptFromCaps: true }], invites: [{ id: 'invite_1', token: 'invite_token_1', email: 'teammate@example.com', role: 'MEMBER', status: 'PENDING', invitedByUserId: 'user_owner', invitedAt: '2026-04-04T10:00:00.000Z', expiresAt: '2026-04-11T10:00:00.000Z', acceptedAt: null }], stats: { memberCount: 1, inviteCount: 1, seatsRemaining: 9 } } }
      },
      {
        method: 'POST',
        path: '/api/team/invite/accept',
        summary: 'Accept invite',
        description: 'Accepts a site-hosted invitation token for the signed-in user.',
        access: 'user',
        body: {
          token: 'string — required',
        },
        notes: [
          'Rejects if invite email does not match viewer email (403).',
          'Rejects if seat limit reached (400).'
        ],
        rateLimitTier: 'user',
        example: { token: 'invite_token_1' },
        response: { ok: true, activeOrganizationId: 'org_1' }
      },
      {
        method: 'POST',
        path: '/api/team/invite/decline',
        summary: 'Decline invite',
        description: 'Expires an invite token. Token can be provided in JSON body or querystring.',
        access: 'public',
        body: {
          token: 'string? — token | invitationId | tokenId',
        },
        params: {
          token: 'string? — token | invitationId | id',
        },
        rateLimitTier: 'public',
        example: { token: 'invite_token_1' },
        response: { ok: true }
      },
      {
        method: 'POST',
        path: '/api/team/invite/resend',
        summary: 'Resend invite email',
        description: 'Resends the invite email. Only the organization owner may resend.',
        access: 'user',
        body: {
          token: 'string — required (alias: invitationId)',
        },
        notes: [
          'providerOrganizationId is the canonical backing-provider org id in the returned snapshot.',
          'clerkOrganizationId is included only as a legacy compatibility alias for older consumers.'
        ],
        rateLimitTier: 'user',
        example: { token: 'invite_token_1' },
        response: { ok: true, access: { allowed: true, kind: 'OWNER' }, organization: { id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', ownerUserId: 'user_owner', planId: 'plan_business', planName: 'Business', planTokenName: 'credits', seatLimit: 10, tokenPoolStrategy: 'SHARED_FOR_ORG', memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, ownerExemptFromCaps: true, createdAt: '2026-04-01T08:00:00.000Z', providerOrganizationId: 'org_provider_1', clerkOrganizationId: 'legacy_clerk_org_compat_1', members: [], invites: [{ id: 'invite_1', token: 'invite_token_1', email: 'teammate@example.com', role: 'MEMBER', status: 'PENDING', invitedByUserId: 'user_owner', invitedAt: '2026-04-04T10:00:00.000Z', expiresAt: '2026-04-11T10:00:00.000Z', acceptedAt: null }], stats: { memberCount: 1, inviteCount: 1, seatsRemaining: 9 } } }
      },
      {
        method: 'POST',
        path: '/api/team/invite/revoke',
        summary: 'Revoke invite',
        description: 'Attempts provider-level invite revocation when supported, then expires the local invite. Requires owner workspace.',
        access: 'user',
        body: {
          token: 'string — required (alias: invitationId)',
        },
        notes: [
          'providerOrganizationId is the canonical backing-provider org id in the returned snapshot.',
          'clerkOrganizationId is preserved only as a legacy compatibility alias for older Clerk-shaped clients.'
        ],
        rateLimitTier: 'user',
        example: { token: 'invite_token_1' },
        response: { ok: true, access: { allowed: true, kind: 'OWNER' }, organization: { id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', ownerUserId: 'user_owner', planId: 'plan_business', planName: 'Business', planTokenName: 'credits', seatLimit: 10, tokenPoolStrategy: 'SHARED_FOR_ORG', memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, ownerExemptFromCaps: true, createdAt: '2026-04-01T08:00:00.000Z', providerOrganizationId: 'org_provider_1', clerkOrganizationId: 'legacy_clerk_org_compat_1', members: [], invites: [], stats: { memberCount: 1, inviteCount: 0, seatsRemaining: 9 } } }
      },
      {
        method: 'POST',
        path: '/api/team/members/remove',
        summary: 'Remove a member',
        description: 'Removes a member from the backing auth-provider organization when supported and updates local membership. Owner-only.',
        access: 'user',
        body: {
          userId: 'string — required; cannot equal current userId',
        },
        notes: [
          'providerOrganizationId is the canonical backing-provider org id in the returned snapshot.',
          'clerkOrganizationId is preserved only as a legacy compatibility alias for older Clerk-shaped clients.'
        ],
        rateLimitTier: 'user',
        example: { userId: 'user_member' },
        response: { ok: true, access: { allowed: true, kind: 'OWNER' }, organization: { id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', ownerUserId: 'user_owner', planId: 'plan_business', planName: 'Business', planTokenName: 'credits', seatLimit: 10, tokenPoolStrategy: 'SHARED_FOR_ORG', memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, ownerExemptFromCaps: true, createdAt: '2026-04-01T08:00:00.000Z', providerOrganizationId: 'org_provider_1', clerkOrganizationId: 'legacy_clerk_org_compat_1', members: [{ id: 'membership_1', userId: 'user_owner', name: 'Jane Owner', email: 'owner@example.com', role: 'OWNER', status: 'ACTIVE', joinedAt: '2026-04-01T08:00:00.000Z', sharedTokenBalance: 250, memberTokenCapOverride: null, memberTokenUsage: 0, memberTokenUsageWindowStart: null, effectiveMemberCap: null, ownerExemptFromCaps: true }], invites: [], stats: { memberCount: 1, inviteCount: 0, seatsRemaining: 9 } } }
      },
    ]
  },
  {
    id: 'checkout',
    title: 'Checkout',
    description: 'Initiate checkouts and confirm completion across payment providers.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/checkout',
        summary: 'Create hosted checkout session',
        description: 'Creates a hosted checkout session and returns { url } for redirect.',
        access: 'user',
        body: {
          planId: 'string — required (apiSchemas.checkout)',
          couponCode: 'string? — /^[A-Za-z0-9-]{3,64}$/ (must be redeemed by user first)',
          skipProrationCheck: 'boolean? — when true, bypasses proration guard for recurring plan changes',
          prorationFallbackReason: 'string? — 1..100; only used when skipProrationCheck=true',
        },
        notes: [
          'Accepts application/json or form-data (planId, couponCode).',
          'Rate limit: 10 / 60s (keyed by user id when available).',
          'If recurring-proration is enabled and user is switching recurring plans, returns 409 { prorationRequired: true } unless skipProrationCheck is set.'
        ],
        rateLimitTier: 'user',
        example: { planId: 'plan_pro_monthly', couponCode: 'SAVE20' },
        response: { url: 'https://checkout.stripe.com/pay/cs_live_abc123...' }
      },
      {
        method: 'GET',
        path: '/api/checkout/confirm',
        summary: 'Confirm checkout completion',
        description: 'Checks completion by session_id or via recent=1 flow (for hosted flows without reliable session ids).',
        access: 'user',
        params: {
          session_id: 'string? — provider checkout session id',
          recent: "'1'? — enable recent-payment polling mode",
          since: 'number? — epoch ms; used only when recent=1 to detect a new SUCCEEDED payment created >= since',
        },
        notes: [
          'Requires auth (dev fallback exists in non-production).',
          'Can also accept payment_id for providers like Razorpay when session_id is unavailable.',
          'Depending on state, may return completed=false, pending=true, already=true, or active subscription info for recent=1 polling.',
        ],
        rateLimitTier: 'user',
        example: { query: { session_id: 'cs_test_123' } },
        response: { ok: true, completed: true, topup: false, paymentId: 'pay_1', createdAt: '2026-04-05T10:00:00.000Z', plan: 'Pro Monthly' }
      },
      {
        method: 'GET',
        path: '/api/checkout/embedded',
        summary: 'Create embedded checkout intent (or redirect)',
        description: 'Creates a payment/subscription intent when provider supports embedded flows; otherwise returns redirect URL.',
        access: 'user',
        params: {
          amount: 'number|string? — optional; defaults to plan price',
          currency: 'string? — optional',
          planId: 'string? — plan seed id or DB plan id',
          priceId: 'string? — optional; may be overridden by planId resolution',
          mode: "'payment' | 'subscription'?",
          dedupeKey: 'string? — optional; defaults to random UUID',
        },
        notes: [
          'Also supports POST with JSON body using the same fields.',
          'Success payload varies by provider: embedded-capable providers return clientSecret/paymentIntentId, while redirect-only flows return { redirect:true, url, sessionId }.',
        ],
        rateLimitTier: 'user',
        example: { query: { planId: 'plan_pro_monthly', mode: 'payment', currency: 'USD' } },
        response: { clientSecret: 'pi_client_secret_123', paymentIntentId: 'pi_123', provider: 'stripe', amount: 2900, originalAmount: 2900, discountCents: 0, couponCode: null, email: 'jane@example.com', currency: 'USD', planName: 'Pro Monthly', metadata: { userId: 'user_abc', planId: 'plan_pro_monthly', priceId: 'price_123', checkoutMode: 'payment' } }
      },
      {
        method: 'POST',
        path: '/api/checkout/embedded',
        summary: 'Create embedded checkout intent (or redirect)',
        description: 'POST variant of /api/checkout/embedded.',
        access: 'user',
        body: {
          amount: 'number|string? — optional; defaults to plan price',
          currency: 'string? — optional',
          planId: 'string? — plan seed id or DB plan id',
          priceId: 'string? — optional; may be overridden by planId resolution',
          mode: "'payment' | 'subscription'?",
          dedupeKey: 'string? — optional',
        },
        notes: ['Success payload mirrors GET /api/checkout/embedded and may be embedded or redirect-shaped depending on provider and mode.'],
        rateLimitTier: 'user',
        example: { planId: 'plan_pro_monthly', mode: 'payment', currency: 'USD', couponCode: 'SAVE20' },
        response: { clientSecret: 'pi_client_secret_123', paymentIntentId: 'pi_123', provider: 'stripe', amount: 2320, originalAmount: 2900, discountCents: 580, couponCode: 'SAVE20', email: 'jane@example.com', currency: 'USD', planName: 'Pro Monthly', metadata: { userId: 'user_abc', planId: 'plan_pro_monthly', priceId: 'price_123', checkoutMode: 'payment', couponCode: 'SAVE20', couponId: 'coupon_1', couponRedemptionId: 'red_1', inAppDiscountCents: '580', originalPriceCents: '2900' } }
      },
      {
        method: 'GET',
        path: '/api/checkout/embedded/confirm',
        summary: 'Confirm embedded checkout',
        description: 'Confirms a PaymentIntent/transaction by reference and triggers webhook-style processing.',
        access: 'user',
        params: {
          payment_intent: 'string? — Stripe-style payment intent id',
          reference: 'string? — Paystack reference (alias: trxref)',
          trxref: 'string? — Paystack reference',
          provider: 'string? — used to disambiguate paystack vs others',
          redirect_status: "string? — when 'failed' returns 400",
        },
        notes: [
          'Requires authentication.',
          'Accepts provider callback params such as Stripe payment_intent or Paystack reference/trxref.',
          'Returns 400 when redirect_status=failed or when the provider reports requires_payment_method.',
        ],
        rateLimitTier: 'user',
        example: { query: { payment_intent: 'pi_123', provider: 'stripe' } },
        response: { ok: true, active: true, plan: 'Pro', purchasedPlan: 'Pro' }
      },
    ]
  },
  {
    id: 'billing',
    title: 'Billing & subscriptions',
    description: 'Manage billing portal access, cancellations, invoices, and subscription lifecycle (including proration upgrades).',
    endpoints: [
      {
        method: 'POST',
        path: '/api/billing/customer-portal',
        summary: 'Open customer billing portal',
        description:
          'Creates a provider portal session when supported (Stripe) or returns a safe fallback URL/message when not supported (Paystack/Razorpay).',
        access: 'user',
        notes: [
          'Rate limit: 5 / 60s (keyed by user id when authenticated, otherwise by client IP).',
          'Provider selection prefers the most recent ACTIVE/PAST_DUE/PENDING subscription provider, then user.paymentProvider, then the configured active provider.',
          'Paystack and Razorpay portal UX is subscription-scoped; this endpoint will look up an active subscription id to generate a management URL, otherwise returns supported=false with a message.',
        ],
        rateLimitTier: 'user',
        example: {},
        response: { url: 'https://billing.stripe.com/session/test_123', provider: 'stripe', supported: true }
      },
      {
        method: 'POST',
        path: '/api/billing/cancel',
        summary: 'Schedule cancellation at period end',
        description:
          'Schedules a recurring subscription to cancel at the end of the current billing period. For non-recurring plans or missing provider subscription id, returns a local “non_recurring” response.',
        access: 'user',
        notes: [
          'Requires auth. Returns 400 when no active subscription exists.',
          'Uses the subscription’s recorded paymentProvider to call provider.cancelSubscription(subId, false).',
          'Paystack does not support native cancel-at-period-end; the route stores cancelAtPeriodEnd=true for later cleanup.',
          'Sends cancellation notifications best-effort; failures do not block scheduling.',
        ],
        rateLimitTier: 'user',
        example: {},
        response: { ok: true, message: 'cancellation_scheduled', expiresAt: '2026-05-01T00:00:00Z' }
      },
      {
        method: 'POST',
        path: '/api/billing/undo-cancel',
        summary: 'Undo scheduled cancellation',
        description:
          'Reverts a scheduled cancel-at-period-end. If a provider subscription id exists, calls provider.undoCancelSubscription(subId) and clears local canceledAt/cancelAtPeriodEnd.',
        access: 'user',
        rateLimitTier: 'user',
        example: {},
        response: { ok: true, message: 'undo_succeeded', subscription: { id: 'sub_provider_1', status: 'active', cancelAtPeriodEnd: false } }
      },
      {
        method: 'GET',
        path: '/api/billing/invoice/[paymentId]',
        summary: 'Download invoice PDF',
        description:
          'Generates and returns a PDF invoice (Content-Type: application/pdf) for a payment owned by the signed-in user.',
        access: 'user',
        notes: [
          'If local pricing fields are missing and the payment has externalSessionId, the handler attempts to hydrate subtotal/discount/couponCode from provider.getCheckoutSession().',
          'Returns 404 when paymentId does not belong to the user.',
          'Success response is a binary PDF download, not JSON. Error responses remain JSON { error, code }.',
        ],
        rateLimitTier: 'user',
        example: { path: { paymentId: 'pay_1' } },
        response: { contentType: 'application/pdf', contentDisposition: 'attachment; filename="invoice-pay_1.pdf"' }
      },
      {
        method: 'GET',
        path: '/api/billing/refund-receipt/[paymentId]',
        summary: 'Download refund receipt PDF',
        description:
          'Generates and returns a PDF refund receipt for a REFUNDED payment owned by the signed-in user.',
        access: 'user',
        notes: [
          'Returns 400 when payment.status is not REFUNDED.',
          'Attempts to hydrate refund details via provider.getRefundDetails(externalPaymentId) or via session.paymentIntentId; falls back to local payment amount for full refunds.',
          'Success response is a binary PDF download, not JSON. Error responses remain JSON { error, code }.',
        ],
        rateLimitTier: 'user',
        example: { path: { paymentId: 'pay_1' } },
        response: { contentType: 'application/pdf', contentDisposition: 'attachment; filename="refund-pay_1.pdf"' }
      },
      {
        method: 'GET',
        path: '/api/subscription',
        summary: 'Get subscription status',
        description:
          'Returns the current subscription state for the signed-in user (ACTIVE personal subscription, organization-granted access, and/or any PENDING manual-activation subscription).',
        access: 'user',
        notes: [
          'Does not auto-activate PENDING subscriptions; it only expires stale PENDING rows whose expiresAt is in the past.',
          'When no personal ACTIVE subscription exists, may return organization plan context as source=organization.',
        ],
        rateLimitTier: 'user',
        example: {},
        response: { ok: true, ownedActiveSubscriptions: [{ id: 'sub_1', planId: 'plan_pro', plan: 'Pro Monthly', family: 'solo', planAutoRenew: true, planSupportsOrganizations: false, expiresAt: '2026-05-01T00:00:00.000Z', status: 'ACTIVE' }], active: true, source: 'personal', planId: 'plan_pro', plan: 'Pro Monthly', planAutoRenew: true, planSupportsOrganizations: false, expiresAt: '2026-05-01T00:00:00.000Z', status: 'ACTIVE', pending: { id: 'sub_pending_1', plan: 'Business', planAutoRenew: true, planSupportsOrganizations: true, pendingConfirmation: true, startsAt: null, expiresAt: '2026-06-01T00:00:00.000Z', pendingSince: '2026-04-04T12:00:00.000Z' } }
      },
      {
        method: 'POST',
        path: '/api/subscription/activate',
        summary: 'Activate a pending subscription',
        description:
          'Promotes a PENDING subscription to ACTIVE for the signed-in user (manual-activation flow). Expires any existing ACTIVE subscriptions first.',
        access: 'user',
        body: {
          subscriptionId: 'string — required',
        },
        notes: ['Returns 404 when subscription is not found, not owned by user, or not in PENDING status.'],
        rateLimitTier: 'user',
        example: { subscriptionId: 'sub_pending_1' },
        response: { ok: true, activated: true, subscriptionId: 'sub_pending_1', startsAt: '2026-04-05T12:00:00.000Z', expiresAt: '2026-05-05T12:00:00.000Z' }
      },
      {
        method: 'GET',
        path: '/api/subscription/proration',
        summary: 'Preview proration (recurring plan swap)',
        description:
          'Returns a provider proration preview for switching between two recurring plans when recurring-proration is enabled; otherwise returns 409.',
        access: 'user',
        params: {
          planId: 'string — required (target plan id)',
        },
        notes: [
          'Returns 409 { prorationEnabled: false } when disabled or when the preview cannot be performed safely (fallback-to-checkout).',
          'When provider.supportsFeature("proration") is false but subscription_updates is supported, the response may instead return supportsInlineSwitch plus either a local estimate (prorationEnabled:true, isEstimate:true) or a no-preview fallback (prorationEnabled:false).',
          'When a previous switch is still processing, returns 409 { prorationPending: true, code: "PRORATION_PENDING" }.',
          'In non-production only, may fall back to an admin user when not authenticated.',
        ],
        rateLimitTier: 'user',
        example: { query: { planId: 'plan_business' } },
        response: {
          prorationEnabled: true,
          amountDue: 700,
          currency: 'usd',
          nextPaymentAttempt: 1772476800,
          lineItems: [
            { description: 'Unused time on Pro Monthly after 5 Apr 2026', amount: -2200, proration: true },
            { description: 'Remaining time on Business Monthly after 5 Apr 2026', amount: 2900, proration: true }
          ],
          providerKey: 'stripe',
          currentPlan: { id: 'plan_pro', name: 'Pro Monthly', priceCents: 2900 },
          targetPlan: { id: 'plan_business', name: 'Business Monthly', priceCents: 5900 },
          currentPeriodEnd: null
        }
      },
      {
        method: 'POST',
        path: '/api/subscription/proration',
        summary: 'Apply proration (recurring plan swap)',
        description:
          'Updates the current recurring subscription to a different recurring plan and immediately updates the local subscription record and (optionally) token balance.',
        access: 'user',
        body: {
          planId: 'string — required (target plan id)',
        },
        notes: [
          'Returns 409 when proration is disabled or when preconditions fail (no active recurring sub, same plan, missing customer/subscription ids, target plan missing provider price id).',
          'Returns { ok: true, requiresAction: true, clientSecret, newPlan } when the provider requires SCA/3D Secure before the plan change can complete.',
          'Returns { ok: true, scheduled: true, ... } when the client explicitly requests a cycle-end change or when the Razorpay no-captured-payments fallback schedules the switch instead.',
          'Paystack switch-now flows can return { ok: true, pendingConfirmation: true, ... } while the replacement subscription waits for payment confirmation.',
          'Sends upgrade/downgrade notifications best-effort.',
        ],
        rateLimitTier: 'user',
        example: { planId: 'plan_business' },
        response: {
          ok: true,
          newPlan: { id: 'plan_business', name: 'Business Monthly', priceCents: 5900 },
          currentPeriodEnd: '2026-05-01T00:00:00.000Z',
          invoiceId: 'in_123',
          actualAmountCharged: 700
        }
      },
      {
        method: 'GET',
        path: '/api/admin/subscriptions',
        summary: 'List subscriptions (admin/moderator)',
        description:
          'Lists recurring subscriptions with optional search, status filters (including payment statuses), date filtering, and keyset cursor pagination.',
        access: 'admin',
        params: {
          page: 'number? — default 1 (offset pagination fallback)',
          limit: 'number? — default 50, max 100',
          cursor: 'string? — base64("<sortValue>::<id>"); <sortValue> is ISO date for createdAt/expiresAt, or number for amount',
          count: "'false'? — omit totalCount",
          search: 'string? — contains match against ids, user, plan, and payment identifiers',
          status:
            "string? — 'ALL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SCHEDULED_CANCEL' | 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED'",
          sortBy: "string? — 'createdAt' | 'expiresAt' | 'amount' (alias: sort)",
          sortOrder: "string? — 'asc' | 'desc' (alias: order)",
          startDate: 'string? — ISO or YYYY-MM-DD; filters createdAt >= startDate',
          endDate: 'string? — ISO or YYYY-MM-DD; filters createdAt < endDate',
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("subscriptions").'],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', status: 'ACTIVE', search: 'jane@example.com', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: {
          subscriptions: [{
            id: 'sub_1',
            planName: 'Pro Monthly',
            planAutoRenew: true,
            userName: 'Jane Doe',
            userEmail: 'jane@example.com',
            userId: 'user_abc',
            status: 'ACTIVE',
            expiresAt: '2026-05-01T00:00:00.000Z',
            canceledAt: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            externalSubscriptionId: 'sub_ext_123',
            dashboardUrl: 'https://dashboard.stripe.com/subscriptions/sub_ext_123',
            paymentProvider: 'stripe',
            latestPayment: {
              id: 'pay_1',
              amountCents: 2900,
              subtotalCents: 2900,
              discountCents: null,
              amountFormatted: '$29.00',
              subtotalFormatted: '$29.00',
              discountFormatted: null,
              couponCode: null,
              currency: 'usd',
              createdAt: '2026-04-01T00:00:00.000Z',
              externalPaymentId: 'pi_123',
              externalSessionId: 'cs_123',
              externalRefundId: null,
              status: 'SUCCEEDED',
              dashboardUrl: 'https://dashboard.stripe.com/payments/pi_123',
              paymentProvider: 'stripe'
            }
          }],
          totalCount: 1,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          nextCursor: null
        }
      },
      {
        method: 'POST',
        path: '/api/admin/subscriptions/[id]/schedule-cancel',
        summary: 'Schedule cancellation (admin)',
        description:
          'Schedules cancel-at-period-end for a subscription. Attempts provider call, but always updates local DB; may return a warning when provider call fails.',
        access: 'admin',
        body: {
          clearPaidTokens: 'boolean? — when true, records intent to clear paid tokens on expiry (does not clear immediately)',
        },
        notes: ['Rate limit: admin-subscriptions:schedule-cancel (60 / 120s).'],
        rateLimitTier: 'admin',
        example: { clearPaidTokens: false },
        response: { ok: true, warning: 'Subscription scheduled for cancellation locally but provider cancellation failed. Manual cleanup may be needed on the payment provider dashboard.' }
      },
      {
        method: 'POST',
        path: '/api/admin/subscriptions/[id]/undo',
        summary: 'Undo cancellation (admin)',
        description:
          'Undoes scheduled cancellation; restores local canceledAt/cancelAtPeriodEnd and attempts provider undo when a provider subscription id exists.',
        access: 'admin',
        notes: [
          'Rate limit: admin-subscriptions:undo (60 / 120s).',
          'For Paystack, returns 409 when the provider subscription is already terminal-cancelled and cannot be reactivated.',
          'May return 502 when provider undo fails.',
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { ok: true }
      },
      {
        method: 'POST',
        path: '/api/admin/subscriptions/[id]/force-cancel',
        summary: 'Force cancel immediately (admin)',
        description:
          'Cancels immediately (provider best-effort) and marks local subscription as CANCELLED with expiresAt=now; also revokes org access immediately.',
        access: 'admin',
        body: {
          clearPaidTokens: 'boolean? — when true, clears paid tokens on force-cancel if shouldClearPaidTokensOnExpiry(...) resolves to true',
        },
        notes: ['Rate limit: admin-subscriptions:force-cancel (60 / 120s).'],
        rateLimitTier: 'admin',
        example: { clearPaidTokens: true },
        response: { ok: true, warning: 'Subscription cancelled locally but provider cancellation failed. Manual cleanup may be needed on the payment provider dashboard.' }
      },
      {
        method: 'POST',
        path: '/api/admin/subscriptions/[id]/expire',
        summary: 'Expire subscription (admin)',
        description:
          'Marks a subscription EXPIRED and may clear paid tokens depending on request flag and server settings; triggers eligibility sync and notifications.',
        access: 'admin',
        body: {
          clearPaidTokens: 'boolean? — optional (defaults false)',
        },
        notes: ['No explicit adminRateLimit in handler.'],
        rateLimitTier: 'admin',
        example: { clearPaidTokens: true },
        response: { ok: true }
      },
      {
        method: 'POST',
        path: '/api/admin/subscriptions/[id]/edit',
        summary: 'Edit subscription state and billing date',
        description:
          'Edits a subscription locally, with optional provider-state verification for reactivation, expiry, billing date changes, and clearing scheduled cancellation.',
        access: 'admin',
        body: {
          status: '"ACTIVE" | "EXPIRED"? — optional desired local status',
          expiresAt: 'string? — ISO billing date override',
          allowLocalOverride: 'boolean? — allow local-only changes when provider state differs or cannot be fetched',
          clearScheduledCancellation: 'boolean? — clears cancel-at-period-end locally and attempts provider undo when applicable',
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("subscriptions").',
          'Rate limit: admin-subscriptions:edit (60 / 120s).',
          'Returns 409 when provider state conflicts with the requested edit unless allowLocalOverride is true.',
          'Returns 502 when provider verification fails and local override is not enabled.',
        ],
        rateLimitTier: 'admin',
        example: { status: 'ACTIVE', expiresAt: '2026-05-15T00:00:00.000Z', allowLocalOverride: true, clearScheduledCancellation: true },
        response: { ok: true, warning: 'Saved a local billing date that differs from stripe\'s current period end.', subscription: { id: 'sub_1', status: 'ACTIVE', expiresAt: '2026-05-15T00:00:00.000Z', canceledAt: null, cancelAtPeriodEnd: false } }
      },
      {
        method: 'POST',
        path: '/api/admin/billing/sync',
        summary: 'Sync billing catalog (admin)',
        description:
          'Ensures plans and coupons have provider artifacts (products/prices/coupons/promotion codes) across configured payment providers.',
        access: 'admin',
        body: {
          scope: "'all' | 'plans' | 'coupons'? — default 'all'",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-billing:sync (12 / 120s).',
          'Razorpay recurring daily plans require interval_count >= 7; those are skipped with an error counter update.',
          'Expired coupons are not created on providers (providers may reject artifacts with past expiresAt).',
        ],
        rateLimitTier: 'admin',
        example: { scope: 'all' },
        response: {
          success: true,
          result: {
            providers: ['stripe', 'paddle'],
            plans: { scanned: 12, updated: 4, createdPrices: 6, errors: 0, skippedNotSupported: 1 },
            coupons: {
              scanned: 5,
              updated: 3,
              createdArtifacts: 4,
              errors: 0,
              skippedNoNativeSupport: 0,
              skippedExpired: 1,
              skippedNotSupported: 0,
            }
          }
        }
      },
      {
        method: 'GET',
        path: '/api/admin/billing/paddle-config',
        summary: 'Paddle config health check (admin)',
        description:
          'Performs a Paddle API ping and a checkout probe to detect missing credentials and missing Default Payment Link configuration.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-billing:paddle-config (60 / 60s).',
          'Returns 200 with a structured { issues: [...] } payload even when misconfigured (for dashboard display).',
        ],
        rateLimitTier: 'admin',
        example: {},
        response: {
          provider: 'paddle',
          apiBaseUrl: 'https://sandbox-api.paddle.com',
          env: { apiKeySet: true, webhookSecretSet: true },
          apiReachable: true,
          issues: [],
          probe: { usedPriceId: 'pri_123', usedCustomerEmail: 'paddle-config-check+1712313600000@example.com' }
        }
      },
    ]
  },
  {
    id: 'organizations',
    title: 'Organizations (admin)',
    description: 'Inspect and administer organization workspaces: seat limits, token pooling policies, and membership caps.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/organizations',
        summary: 'List organizations',
        description: 'Lists organizations that have at least one ACTIVE membership. Supports search, sorting, and status-like filters.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 25, max 100',
          search: 'string? — contains match against name, slug, billingEmail, owner.name, owner.email',
          status: "string? — 'ALL' | 'SEAT_LIMITED' | 'UNLIMITED_SEATS' | 'HARD_CAP' | 'SOFT_CAP' | 'NO_CAP'",
          sortBy: "string? — 'createdAt'(default) | 'name' | 'members' | 'tokenBalance' | 'pendingInvites'",
          sortOrder: "string? — 'asc' | 'desc' (default desc)",
        },
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:list (240 / 120s).',
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', status: 'SOFT_CAP', search: 'acme', sortBy: 'members', sortOrder: 'desc' } },
        response: {
          data: [{ id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', owner: { id: 'user_owner', name: 'Jane Owner', email: 'owner@example.com' }, billingEmail: 'billing@acme.com', plan: { id: 'plan_business', name: 'Business' }, tokenBalance: 4200, memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, tokenPoolStrategy: 'SHARED_FOR_ORG', seatLimit: 10, activeMembers: 6, pendingInvites: 2, createdAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-04T09:30:00.000Z' }],
          totalCount: 1,
          totalPages: 1,
          page: 1,
          limit: 25,
          pageInfo: { page: 1, limit: 25, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
        }
      },
      {
        method: 'GET',
        path: '/api/admin/organizations/[orgId]',
        summary: 'Get organization detail',
        description: 'Fetches organization detail plus stats: activeMembers, totalMembers, pendingInvites.',
        access: 'admin',
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:get (240 / 120s).',
        ],
        rateLimitTier: 'admin',
        example: { path: { orgId: 'org_1' } },
        response: {
          organization: { id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', billingEmail: 'billing@acme.com', plan: { id: 'plan_business', name: 'Business' }, owner: { id: 'user_owner', name: 'Jane Owner', email: 'owner@example.com' }, tokenBalance: 4200, memberTokenCap: 250, memberCapStrategy: 'SOFT', memberCapResetIntervalHours: 24, tokenPoolStrategy: 'SHARED_FOR_ORG', seatLimit: 10, ownerExemptFromCaps: true, stats: { activeMembers: 6, totalMembers: 6, pendingInvites: 2 }, createdAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-04T09:30:00.000Z' }
        }
      },
      {
        method: 'PATCH',
        path: '/api/admin/organizations/[orgId]',
        summary: 'Update organization',
        description: 'Updates allowed organization fields. Rejects empty updates and validates slug/limits.',
        access: 'admin',
        body: {
          name: 'string? — trimmed; must be non-empty if provided',
          slug: 'string? — /^[a-z0-9-]{3,64}$/ (lowercased)',
          billingEmail: 'string|null? — empty string clears to null',
          seatLimit: 'number|null? — positive integer; null clears',
          memberTokenCap: 'number|null? — integer >= 0; null clears',
          memberCapStrategy: "string? — 'SOFT' | 'HARD' | 'DISABLED'",
          memberCapResetIntervalHours: 'number|null? — integer >= 1; null clears',
          tokenPoolStrategy: 'string? — trimmed uppercased; must be non-empty',
          ownerExemptFromCaps: 'boolean? — when present, explicitly sets the owner cap exemption flag',
        },
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:update (120 / 120s).',
          'Returns 400 when slug is already used (Prisma P2002).',
        ],
        rateLimitTier: 'admin',
        example: { name: 'Acme Workspace', seatLimit: 12, memberTokenCap: 300, memberCapStrategy: 'HARD', memberCapResetIntervalHours: 24, tokenPoolStrategy: 'SHARED_FOR_ORG', ownerExemptFromCaps: true },
        response: {
          success: true,
          organization: { id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', billingEmail: 'billing@acme.com', plan: { id: 'plan_business', name: 'Business' }, owner: { id: 'user_owner', name: 'Jane Owner', email: 'owner@example.com' }, tokenBalance: 4200, memberTokenCap: 300, memberCapStrategy: 'HARD', memberCapResetIntervalHours: 24, tokenPoolStrategy: 'SHARED_FOR_ORG', seatLimit: 12, ownerExemptFromCaps: true, stats: { activeMembers: 6, totalMembers: 6, pendingInvites: 2 }, createdAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-04T09:45:00.000Z' }
        }
      },
      {
        method: 'GET',
        path: '/api/admin/organizations/[orgId]/members',
        summary: 'List organization members + invites',
        description: 'Returns memberships (with embedded user fields) and pending invites for the organization.',
        access: 'admin',
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:members (240 / 120s).',
          'Returns 404 when organization does not exist.',
        ],
        rateLimitTier: 'admin',
        example: { path: { orgId: 'org_1' } },
        response: {
          organization: { id: 'org_1', name: 'Acme Workspace' },
          members: [{ id: 'membership_1', userId: 'user_member', role: 'MEMBER', status: 'ACTIVE', sharedTokenBalance: 250, memberTokenCapOverride: null, memberTokenUsage: 50, memberTokenUsageWindowStart: '2026-04-04T00:00:00.000Z', user: { id: 'user_member', name: 'John Member', email: 'john@example.com', role: 'USER' }, createdAt: '2026-04-02T09:00:00.000Z', updatedAt: '2026-04-04T09:00:00.000Z' }],
          invites: [{ id: 'invite_1', email: 'newmember@example.com', role: 'MEMBER', status: 'PENDING', expiresAt: '2026-04-11T09:00:00.000Z', createdAt: '2026-04-04T09:00:00.000Z' }]
        }
      },
      {
        method: 'DELETE',
        path: '/api/admin/organizations/[orgId]/members/[membershipId]',
        summary: 'Remove member from organization',
        description: 'Deletes an organization membership by membershipId. Prevents removing the org owner.',
        access: 'admin',
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:remove-member (120 / 120s).',
          'Returns 404 when membership does not exist.',
          'Returns 400 when membership does not belong to orgId or when attempting to remove the owner.',
        ],
        rateLimitTier: 'admin',
        example: { path: { orgId: 'org_1', membershipId: 'membership_1' } },
        response: { success: true, message: 'Member removed successfully' }
      },
      {
        method: 'POST',
        path: '/api/admin/organizations/[orgId]/adjust-balance',
        summary: 'Adjust organization token balance',
        description: 'Applies a signed integer delta to organization.tokenBalance. Can block negative balances unless force=true.',
        access: 'admin',
        body: {
          amount: 'number|string — required; non-zero integer (delta)',
          reason: 'string? — optional; stored in audit log',
          force: 'boolean? — when true allows resulting negative balances',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin() (note: this route does not use requireAdminSectionAccess).',
          'Rate limit: admin-orgs:adjust-balance (60 / 120s).',
          'Returns 400 when amount is not a non-zero integer, org is missing, or resulting balance would be negative without force.',
        ],
        rateLimitTier: 'admin',
        example: { amount: 500, reason: 'Quarterly bonus allocation', force: false },
        response: { success: true, org: { id: 'org_1', name: 'Acme Workspace', tokenBalance: 4700 } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/organizations/[orgId]/delete',
        summary: 'Delete organization',
        description: 'Deletes an organization and related records. Attempts to delete the backing auth-provider organization first when present (best-effort).',
        access: 'admin',
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:delete (60 / 120s).',
          'Returns 404 when organization does not exist.',
        ],
        rateLimitTier: 'admin',
        example: { path: { orgId: 'org_1' } },
        response: { success: true, message: 'Organization deleted successfully' }
      },
    ]
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'User inbox notifications and admin broadcast tooling.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/notifications',
        summary: 'List my notifications',
        description: 'Lists notifications for the signed-in user. Supports cursor keyset pagination and optional counts breakdown.',
        access: 'user',
        params: {
          page: 'number? — default 1 (used only when cursor is not provided)',
          limit: 'number? — default 50, max 100',
          count: "'false'? — omit totalCount + per-type counts",
          cursor: 'string? — base64("<createdAtIso>::<id>") (createdAt desc)',
          read: 'string? — "true" | "false" (when provided filters by read flag)',
          type: "string? — 'ALL' or a notification type (GENERAL/BILLING/SUPPORT/ACCOUNT)",
          search: 'string? — contains match against title/message',
        },
        notes: ['When cursor is invalid, returns 400 { error: "Invalid cursor" }.'],
        rateLimitTier: 'user',
        example: { query: { page: '1', limit: '20', read: 'false', type: 'BILLING' } },
        response: {
          notifications: [{ id: 'notif_1', title: 'Payment received', message: 'Your subscription payment succeeded.', type: 'BILLING', url: '/dashboard/billing', read: false, createdAt: '2026-04-04T12:00:00.000Z' }],
          totalCount: 1,
          unreadCount: 1,
          readCount: 0,
          generalCount: 0,
          billingCount: 1,
          supportCount: 0,
          accountCount: 0,
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          nextCursor: null
        }
      },
      {
        method: 'POST',
        path: '/api/notifications/mark-all-read',
        summary: 'Mark all notifications read',
        description: 'Marks all unread notifications as read for the signed-in user.',
        access: 'user',
        rateLimitTier: 'user',
        example: {},
        response: { success: true }
      },
      {
        method: 'PATCH',
        path: '/api/notifications/[id]/read',
        summary: 'Mark a notification read',
        description: 'Marks a single notification read if it belongs to the signed-in user. Returns { updated: 0|1 }.',
        access: 'user',
        rateLimitTier: 'user',
        example: { path: { id: 'notif_1' } },
        response: { updated: 1 }
      },
      {
        method: 'POST',
        path: '/api/notifications/[id]/read',
        summary: 'Mark a notification read',
        description: 'POST alias for PATCH /api/notifications/[id]/read.',
        access: 'user',
        rateLimitTier: 'user',
        example: { path: { id: 'notif_1' } },
        response: { updated: 1 }
      },
      {
        method: 'GET',
        path: '/api/admin/notifications',
        summary: 'List notifications (admin/moderator)',
        description: 'Lists notifications across users with optional search, type/status filters, and cursor pagination.',
        access: 'admin',
        params: {
          limit: 'number? — default 50, max 100',
          count: "'false'? — omit totalCount and per-type counts",
          cursor: 'string? — base64("<createdAtIso>::<id>") (createdAt desc)',
          page: 'number? — offset pagination fallback when cursor not provided',
          search: 'string? — contains match against title/message/user.email',
          status: "string? — 'ALL' | 'READ' | 'UNREAD' | a type value (GENERAL/BILLING/SUPPORT/ACCOUNT)",
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("notifications").'],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', status: 'UNREAD', search: 'maintenance' } },
        response: {
          items: [{ id: 'notif_1', title: 'Maintenance notice', message: 'Scheduled maintenance at 02:00 UTC.', type: 'GENERAL', read: false, userEmail: 'jane@example.com', createdAt: '2026-04-04T12:00:00.000Z' }],
          totalCount: 1,
          generalCount: 1,
          billingCount: 0,
          supportCount: 0,
          accountCount: 0,
          nextCursor: null
        }
      },
      {
        method: 'POST',
        path: '/api/admin/notifications/create',
        summary: 'Create notification (admin/moderator)',
        description: 'Creates notifications for all users (target=all) or for a single user by email (targetEmail).',
        access: 'admin',
        body: {
          title: 'string — required',
          message: 'string — required',
          type: 'string? — optional notification type',
          target: "string? — 'all' to broadcast; otherwise send to one user",
          targetEmail: 'string? — required when target is not "all"',
        },
        notes: ['Rate limit: admin-notifications:create (40 / 120s).'],
        rateLimitTier: 'admin',
        example: { title: 'Maintenance notice', message: 'Scheduled maintenance tonight at 02:00 UTC.', type: 'GENERAL', target: 'all' },
        response: { success: true, message: 'Notification sent to 125 users' }
      },
    ]
  },
  {
    id: 'emails',
    title: 'Emails (admin)',
    description: 'Manage stored email templates and send test emails using rendered variables.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/emails',
        summary: 'List email templates',
        description: 'Lists email templates ordered by name. Can optionally filter to active templates only.',
        access: 'admin',
        params: {
          active: "'true'? — when set, returns only active templates",
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { query: { active: 'true' } },
        response: { templates: [{ id: 'tmpl_1', name: 'Welcome email', key: 'welcome_email', description: 'Sent after registration', subject: 'Welcome to {{siteName}}', htmlBody: '<p>Hello {{firstName}}</p>', textBody: 'Hello {{firstName}}', variables: '{"firstName":"Recipient first name"}', active: true, createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z' }] }
      },
      {
        method: 'POST',
        path: '/api/admin/emails',
        summary: 'Create email template',
        description: 'Creates a new stored email template.',
        access: 'admin',
        body: {
          name: 'string — required',
          key: 'string — required (unique identifier for rendering)',
          description: 'string? — optional; empty becomes null',
          subject: 'string — required (template string)',
          htmlBody: 'string — required (template string)',
          textBody: 'string? — optional',
          variables: 'string|object? — optional; persisted as-is (often JSON string)',
          active: 'boolean? — default true',
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { name: 'Welcome email', key: 'welcome_email', description: 'Sent after registration', subject: 'Welcome to {{siteName}}', htmlBody: '<p>Hello {{firstName}}</p>', textBody: 'Hello {{firstName}}', variables: '{"firstName":"Recipient first name"}', active: true },
        response: { template: { id: 'tmpl_1', name: 'Welcome email', key: 'welcome_email', description: 'Sent after registration', subject: 'Welcome to {{siteName}}', htmlBody: '<p>Hello {{firstName}}</p>', textBody: 'Hello {{firstName}}', variables: '{"firstName":"Recipient first name"}', active: true, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z' } }
      },
      {
        method: 'GET',
        path: '/api/admin/emails/[templateId]',
        summary: 'Get email template',
        description: 'Fetches a template by id.',
        access: 'admin',
        notes: ['Returns 404 when templateId does not exist.'],
        rateLimitTier: 'admin',
        example: { path: { templateId: 'tmpl_1' } },
        response: { template: { id: 'tmpl_1', name: 'Welcome email', key: 'welcome_email', description: 'Sent after registration', subject: 'Welcome to {{siteName}}', htmlBody: '<p>Hello {{firstName}}</p>', textBody: 'Hello {{firstName}}', variables: '{"firstName":"Recipient first name"}', active: true, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T00:00:00.000Z' } }
      },
      {
        method: 'PATCH',
        path: '/api/admin/emails/[templateId]',
        summary: 'Update email template',
        description: 'Updates template fields by id.',
        access: 'admin',
        body: {
          name: 'string?',
          description: 'string|null?',
          subject: 'string?',
          htmlBody: 'string?',
          textBody: 'string|null?',
          variables: 'string|null?',
          active: 'boolean?',
        },
        rateLimitTier: 'admin',
        example: { subject: 'Welcome to {{siteName}}', active: false },
        response: { template: { id: 'tmpl_1', name: 'Welcome email', key: 'welcome_email', description: 'Sent after registration', subject: 'Welcome to {{siteName}}', htmlBody: '<p>Hello {{firstName}}</p>', textBody: 'Hello {{firstName}}', variables: '{"firstName":"Recipient first name"}', active: false, createdAt: '2026-04-04T00:00:00.000Z', updatedAt: '2026-04-04T01:00:00.000Z' } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/emails/[templateId]',
        summary: 'Delete email template',
        description: 'Deletes a stored template by id.',
        access: 'admin',
        rateLimitTier: 'admin',
        example: { path: { templateId: 'tmpl_1' } },
        response: { success: true }
      },
      {
        method: 'POST',
        path: '/api/admin/emails/seed',
        summary: 'Seed default templates',
        description: 'Creates default templates if missing (idempotent). Returns created/skipped counts.',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: {},
        response: { success: true, created: 8, skipped: 12, message: 'Created 8 templates, skipped 12 existing templates' }
      },
      {
        method: 'POST',
        path: '/api/admin/emails/test',
        summary: 'Send test email',
        description: 'Renders a template by id or key with merged variables and sends a test email.',
        access: 'admin',
        body: {
          to: 'string — required; recipient email',
          templateId: 'string? — template id (required if templateKey not provided)',
          templateKey: 'string? — template key (required if templateId not provided)',
          variables: 'object? — overrides; merged over template default variables plus siteName/supportEmail/siteLogo',
        },
        notes: [
          'If both templateId and templateKey are provided, templateId is used.',
          'Handler ensures variables.dashboardUrl and variables.billingUrl defaults when missing.',
        ],
        rateLimitTier: 'admin',
        example: { to: 'jane@example.com', templateKey: 'welcome_email', variables: { firstName: 'Jane' } },
        response: { success: true }
      },
    ]
  },
  {
    id: 'payment-providers',
    title: 'Payment providers',
    description: 'Inspect supported payment providers and configuration status without exposing secrets.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/payment-providers',
        summary: 'List payment providers + configuration status',
        description:
          'Returns the active provider id plus a list of providers including whether required env vars are set (values are never returned) and whether the webhook secret is set.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-providers:read (limit 60 / 60s).',
          'On rate limit, returns 429 with Retry-After; if rate limiter is unavailable returns 503.'
        ],
        rateLimitTier: 'admin',
        example: {},
        response: {
          activeProvider: 'stripe',
          activeCurrency: 'USD',
          providers: [{ id: 'stripe', displayName: 'Stripe', description: 'Global card and wallet payments', logoUrl: '/payments/stripe.svg', features: ['checkout', 'subscriptions', 'webhooks'], supportedCurrencies: ['USD', 'EUR'], docsUrl: 'https://docs.stripe.com', configured: true, isActive: true, envVarStatus: [{ key: 'STRIPE_SECRET_KEY', label: 'Secret key', isSet: true, isPublic: false }, { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', label: 'Publishable key', isSet: true, isPublic: true }], webhookSecretSet: true }]
        }
      }
    ]
  },
  {
    id: 'content',
    title: 'Content (pages & blog)',
    description: 'Create and manage site pages, blog posts, and blog categories.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/pages',
        summary: 'List site pages',
        description: 'Offset-paginated listing with status filters and optional status totals.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 20, max 100',
          status: "'all' | 'published' | 'draft' | 'trashed' | 'system'? — default 'all'",
          sortBy: "'publishedAt' | 'updatedAt' | 'createdAt'? — default 'publishedAt'",
          sortOrder: "'asc' | 'desc'? — default 'desc'",
          search: 'string? — search string',
          count: "'false'? — when 'false', omit status totals"
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '20', status: 'published', sortBy: 'publishedAt', sortOrder: 'desc', search: 'pricing' } },
        response: { pages: [{ id: 'page_1', slug: 'pricing', title: 'Pricing', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null }], totalCount: 1, page: 1, pageSize: 20, publishedCount: 1, draftCount: 0, trashedCount: 0, systemCount: 0, totalPageCount: 1, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/admin/pages',
        summary: 'Create site page',
        description: 'Creates a new site page with SEO metadata; validates request using zod.',
        access: 'admin',
        body: {
          title: 'string — 2..120',
          slug: 'string — 2..64',
          description: 'string? | null — max 320',
          content: 'string — min 10',
          published: 'boolean?',
          metaTitle: 'string? | null — max 60',
          metaDescription: 'string? | null — max 160',
          canonicalUrl: 'string? | null — url | ""',
          noIndex: 'boolean?',
          ogTitle: 'string? | null — max 60',
          ogDescription: 'string? | null — max 160',
          ogImage: 'string? | null — url | "" | relative path ("/...")'
        },
        notes: ['Returns 201 on success.', 'Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { title: 'Pricing', slug: 'pricing', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true },
        response: { page: { id: 'page_1', slug: 'pricing', title: 'Pricing', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null } }
      },
      {
        method: 'GET',
        path: '/api/admin/pages/[id]',
        summary: 'Read site page',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin().', 'Returns 404 when the page does not exist.'],
        rateLimitTier: 'admin',
        example: { path: { id: 'page_1' } },
        response: { page: { id: 'page_1', slug: 'pricing', title: 'Pricing', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null } }
      },
      {
        method: 'PUT',
        path: '/api/admin/pages/[id]',
        summary: 'Update site page (replace fields)',
        description: 'Validates request using zod; updates the page by id.',
        access: 'admin',
        body: {
          title: 'string? — 2..120',
          slug: 'string? — 2..64',
          description: 'string? | null — max 320',
          content: 'string? — min 10',
          published: 'boolean?',
          metaTitle: 'string? | null — max 60',
          metaDescription: 'string? | null — max 160',
          canonicalUrl: 'string? | null — url | ""',
          noIndex: 'boolean?',
          ogTitle: 'string? | null — max 60',
          ogDescription: 'string? | null — max 160',
          ogImage: 'string? | null — url | "" | relative path ("/...")'
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { title: 'Pricing v2', published: true },
        response: { page: { id: 'page_1', slug: 'pricing', title: 'Pricing v2', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null } }
      },
      {
        method: 'PATCH',
        path: '/api/admin/pages/[id]',
        summary: 'Update site page (partial)',
        description: 'Same schema as PUT (all fields optional); updates the page by id.',
        access: 'admin',
        body: {
          title: 'string?',
          slug: 'string?',
          description: 'string? | null',
          content: 'string?',
          published: 'boolean?',
          metaTitle: 'string? | null',
          metaDescription: 'string? | null',
          canonicalUrl: 'string? | null',
          noIndex: 'boolean?',
          ogTitle: 'string? | null',
          ogDescription: 'string? | null',
          ogImage: 'string? | null'
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { title: 'Pricing refresh', noIndex: false },
        response: { page: { id: 'page_1', slug: 'pricing', title: 'Pricing v2', description: 'Pricing overview', content: '<h1>Pricing</h1>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/pages/[id]',
        summary: 'Trash site page',
        description: 'Moves a page to trashed state and returns the number of records affected.',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { path: { id: 'page_1' } },
        response: { trashed: 1 }
      },
      {
        method: 'POST',
        path: '/api/admin/pages/bulk',
        summary: 'Bulk page action (trash/restore/delete)',
        description: 'Performs a bulk action for a list of page ids.',
        access: 'admin',
        body: {
          action: "'trash' | 'restore' | 'delete'",
          ids: 'string[] — min 1'
        },
        notes: ['Auth: requires ADMIN via requireAdmin().', 'On validation error returns 400 { error: "Invalid request payload" }.'],
        rateLimitTier: 'admin',
        example: { action: 'trash', ids: ['page_1', 'page_2'] },
        response: { action: 'trash', affected: 2 }
      },
      {
        method: 'GET',
        path: '/api/admin/blog',
        summary: 'List blog posts',
        description: 'Offset-paginated listing with status filters and optional status totals.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 20, max 100',
          status: "'all' | 'published' | 'draft' | 'trashed' | 'system'? — default 'all'",
          sortBy: "'publishedAt' | 'updatedAt' | 'createdAt'? — default 'publishedAt'",
          sortOrder: "'asc' | 'desc'? — default 'desc'",
          search: 'string? — search string',
          count: "'false'? — when 'false', omit status totals"
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("blog").',
          'Response key is pages (contains post DTOs).'
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '20', status: 'published', sortBy: 'publishedAt', sortOrder: 'desc', search: 'launch' } },
        response: { pages: [{ id: 'post_1', slug: 'launch-post', title: 'Launch post', description: 'Launch recap', content: '<p>Hello world</p>', published: true, system: false, publishedAt: '2026-04-01T00:00:00.000Z', trashedAt: null, createdAt: '2026-03-31T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null, categories: [{ id: 'cat_1', slug: 'news', title: 'News', description: null, postCount: 1 }] }], totalCount: 1, page: 1, pageSize: 20, publishedCount: 1, draftCount: 0, trashedCount: 0, systemCount: 0, totalPageCount: 1, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/admin/blog',
        summary: 'Create blog post',
        description: 'Creates a blog post and optionally attaches categories; validates request using zod.',
        access: 'admin',
        body: {
          title: 'string — 2..120',
          slug: 'string — 2..64',
          description: 'string? | null — max 320',
          content: 'string — min 10',
          published: 'boolean?',
          metaTitle: 'string? | null — max 60',
          metaDescription: 'string? | null — max 160',
          canonicalUrl: 'string? | null — url | ""',
          noIndex: 'boolean?',
          ogTitle: 'string? | null — max 60',
          ogDescription: 'string? | null — max 160',
          ogImage: 'string? | null — url | "" | relative path ("/...")',
          categoryIds: 'string[]? — category ids'
        },
        notes: ['Returns 201 on success.', 'Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { title: 'Launch post', slug: 'launch-post', description: 'Launch recap', content: '<p>Hello world</p>', published: true, categoryIds: ['cat_1'] },
        response: { page: { id: 'post_1', slug: 'launch-post', title: 'Launch post', description: 'Launch recap', content: '<p>Hello world</p>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null, categories: [{ id: 'cat_1', slug: 'news', title: 'News', description: null, postCount: 0 }] } }
      },
      {
        method: 'GET',
        path: '/api/admin/blog/[id]',
        summary: 'Read blog post',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").', 'Returns 404 when the post does not exist.'],
        rateLimitTier: 'admin',
        example: { path: { id: 'post_1' } },
        response: { page: { id: 'post_1', slug: 'launch-post', title: 'Launch post', description: 'Launch recap', content: '<p>Hello world</p>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null, categories: [{ id: 'cat_1', slug: 'news', title: 'News', description: null, postCount: 0 }] } }
      },
      {
        method: 'PUT',
        path: '/api/admin/blog/[id]',
        summary: 'Update blog post (replace fields)',
        description: 'Validates request using zod; updates the post by id.',
        access: 'admin',
        body: {
          title: 'string?',
          slug: 'string?',
          description: 'string? | null',
          content: 'string?',
          published: 'boolean?',
          metaTitle: 'string? | null',
          metaDescription: 'string? | null',
          canonicalUrl: 'string? | null',
          noIndex: 'boolean?',
          ogTitle: 'string? | null',
          ogDescription: 'string? | null',
          ogImage: 'string? | null',
          categoryIds: 'string[]?'
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { title: 'Launch post edited', categoryIds: ['cat_1'] },
        response: { page: { id: 'post_1', slug: 'launch-post', title: 'Launch post edited', description: 'Launch recap', content: '<p>Hello world</p>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null, categories: [] } }
      },
      {
        method: 'PATCH',
        path: '/api/admin/blog/[id]',
        summary: 'Update blog post (partial)',
        description: 'Same schema as PUT (all fields optional); updates the post by id.',
        access: 'admin',
        body: {
          title: 'string?',
          slug: 'string?',
          description: 'string? | null',
          content: 'string?',
          published: 'boolean?',
          metaTitle: 'string? | null',
          metaDescription: 'string? | null',
          canonicalUrl: 'string? | null',
          noIndex: 'boolean?',
          ogTitle: 'string? | null',
          ogDescription: 'string? | null',
          ogImage: 'string? | null',
          categoryIds: 'string[]?'
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { published: false, metaTitle: 'Launch post' },
        response: { page: { id: 'post_1', slug: 'launch-post', title: 'Launch post edited', description: 'Launch recap', content: '<p>Hello world</p>', published: true, system: false, publishedAt: '2026-04-04T12:00:00.000Z', trashedAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:05:00.000Z', metaTitle: null, metaDescription: null, canonicalUrl: null, noIndex: false, ogTitle: null, ogDescription: null, ogImage: null, categories: [] } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/blog/[id]',
        summary: 'Trash blog post',
        description: 'Moves the post to trashed state and returns the number of records affected.',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { path: { id: 'post_1' } },
        response: { trashed: 1 }
      },
      {
        method: 'POST',
        path: '/api/admin/blog/bulk',
        summary: 'Bulk blog action (trash/restore/delete)',
        description: 'Performs a bulk action for a list of blog ids.',
        access: 'admin',
        body: {
          action: "'trash' | 'restore' | 'delete'",
          ids: 'string[] — min 1'
        },
        notes: ['Auth: requires ADMIN via requireAdmin().', 'On validation error returns 400 { error: "Invalid request payload" }.'],
        rateLimitTier: 'admin',
        example: { action: 'restore', ids: ['post_1', 'post_2'] },
        response: { action: 'restore', affected: 2 }
      },
      {
        method: 'GET',
        path: '/api/admin/blog/categories',
        summary: 'List blog categories',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: {},
        response: { categories: [{ id: 'cat_1', slug: 'product-updates', title: 'Product updates', description: 'Launch notes and release summaries', postCount: 4 }] }
      },
      {
        method: 'POST',
        path: '/api/admin/blog/categories',
        summary: 'Create blog category',
        access: 'admin',
        body: {
          title: 'string — 2..80',
          slug: 'string? — 2..64',
          description: 'string? | null — max 280'
        },
        notes: ['Returns 201 on success.', 'Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { title: 'Product updates', slug: 'product-updates', description: 'Launch notes and release summaries' },
        response: { category: { id: 'cat_1', slug: 'product-updates', title: 'Product updates', description: 'Launch notes and release summaries', postCount: 0 } }
      },
      {
        method: 'PATCH',
        path: '/api/admin/blog/categories/[id]',
        summary: 'Update blog category',
        access: 'admin',
        body: {
          title: 'string? — 2..80',
          slug: 'string? — 2..64',
          description: 'string? | null — max 280'
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { title: 'Announcements' },
        response: { category: { id: 'cat_1', slug: 'product-updates', title: 'Announcements', description: 'Launch notes and release summaries', postCount: 4 } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/blog/categories/[id]',
        summary: 'Delete blog category',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin',
        example: { path: { id: 'cat_1' } },
        response: { success: true }
      }
    ]
  },
  {
    id: 'coupons',
    title: 'Coupons',
    description: 'Create and manage discount coupons, including provider artifacts and redemption safety rules.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/coupons',
        summary: 'List coupons',
        description: 'Lists coupons with optional cursor pagination, search, access/status filters, and sorting.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          cursor: 'string? — coupon id cursor; when provided, server uses cursor-based paging (not base64)',
          count: "'false'? — omit totalCount",
          search: 'string? — contains match against code/description',
          access: "'active' | 'expired' | 'scheduled'? — derived from startsAt/endsAt vs now",
          status: "'published' | 'unpublished'? — maps to active=true/false",
          sortBy: "'createdAt' | 'startsAt' | 'endsAt' | 'redemptionCount' | 'maxRedemptions'? — default 'createdAt'",
          sortOrder: "'asc' | 'desc'? — default 'desc'",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Response includes pendingRedemptions (unconsumed redemption rows) and eligiblePlans for each coupon.',
          'nextCursor is the last coupon id when a full page is returned.',
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', search: 'SAVE', access: 'active', status: 'published', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: { coupons: [{ id: 'coupon_1', code: 'SAVE20', description: 'Spring promo', percentOff: 20, amountOffCents: null, currency: null, duration: 'once', durationInMonths: null, minimumPurchaseCents: null, active: true, maxRedemptions: 100, redemptionCount: 5, startsAt: null, endsAt: null, createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z', pendingRedemptions: 0, eligiblePlans: [{ id: 'plan_pro', name: 'Pro' }] }], totalCount: 1, currentPage: 1, pageSize: 50, hasNextPage: false, hasPreviousPage: false, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/admin/coupons',
        summary: 'Create coupon',
        description: 'Creates a coupon and optional plan mappings, then ensures provider artifacts exist across payment providers.',
        access: 'admin',
        body: {
          code: 'string — required; normalized; must match /^[A-Z0-9-]{3,64}$/',
          description: 'string? — max 255',
          percentOff: 'number|string? — provide percentOff OR amountOffCents (not both); 1..100',
          amountOffCents: 'number|string? — > 0',
          maxRedemptions: 'number|string|null? — when provided must be > 0',
          active: 'boolean? — default true',
          startsAt: 'string|Date? — optional; must be <= endsAt when both provided',
          endsAt: 'string|Date? — optional; cannot be in the past when active=true',
          planIds: 'string[]? — optional; validates that all plan ids exist',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Returns 409 when the coupon code already exists.',
          'Returns 400 when discount fields are invalid or when active=true with a past endsAt.',
        ],
        rateLimitTier: 'admin',
        example: { code: 'LAUNCH2026', percentOff: 20, maxRedemptions: 100, active: true, planIds: ['plan_pro'] },
        response: { coupon: { id: 'coupon_new', code: 'LAUNCH2026', description: null, percentOff: 20, amountOffCents: null, currency: null, duration: 'once', durationInMonths: null, minimumPurchaseCents: null, active: true, maxRedemptions: 100, redemptionCount: 0, startsAt: null, endsAt: null, createdAt: '2026-04-04T12:00:00.000Z', updatedAt: '2026-04-04T12:00:00.000Z', pendingRedemptions: 0, eligiblePlans: [{ id: 'plan_pro', name: 'Pro Monthly' }] } }
      },
      {
        method: 'PUT',
        path: '/api/admin/coupons/[couponId]',
        summary: 'Update coupon (limited fields)',
        description: 'Updates only supported fields (description, active, maxRedemptions, startsAt, endsAt). Coupon code and discount values cannot be changed.',
        access: 'admin',
        body: {
          description: 'string|null?',
          active: 'boolean?',
          maxRedemptions: 'number|string|null?',
          startsAt: 'string|Date?',
          endsAt: 'string|Date|null?',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Returns 404 when couponId does not exist.',
          'Returns 400 for unsupported changes (code/discount changes), invalid dates, or empty updates.',
          'When active is changed, handler syncs provider promotion state best-effort.',
        ],
        rateLimitTier: 'admin',
        example: { description: 'Spring promo', active: false, maxRedemptions: 200 },
        response: { coupon: { id: 'coupon_1', code: 'SAVE20', description: 'Spring promo', percentOff: 20, amountOffCents: null, currency: null, duration: 'once', durationInMonths: null, minimumPurchaseCents: null, active: false, maxRedemptions: 200, redemptionCount: 5, startsAt: null, endsAt: null, createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-05T12:00:00.000Z', pendingRedemptions: 0, eligiblePlans: [{ id: 'plan_pro', name: 'Pro Monthly' }] } }
      },
      {
        method: 'DELETE',
        path: '/api/admin/coupons/[couponId]',
        summary: 'Delete coupon',
        description: 'Deletes a coupon. Coupons with any redemptions require ?force=true (or force=1). Attempts to deactivate provider artifacts best-effort before deleting.',
        access: 'admin',
        params: {
          force: "'true' | '1'? — required when coupon has redemptionCount > 0 or pending redemptions",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Returns 400 { requiresForce:true } when coupon has redemptions and force is not provided.',
          'Returns 404 when couponId does not exist.',
        ],
        rateLimitTier: 'admin',
        example: { query: { force: 'true' } },
        response: { success: true, forced: true }
      },
    ]
  },
  {
    id: 'purchases',
    title: 'One-time purchases (admin)',
    description: 'Inspect and manage non-recurring purchases; supports refund + forced expiry flows.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/purchases',
        summary: 'List one-time purchases',
        description: 'Lists payments whose underlying plan is non-autoRenew (one-time). Supports offset pagination and keyset cursor pagination.',
        access: 'admin',
        params: {
          page: 'number? — default 1 (offset pagination)',
          limit: 'number? — default 50, max 100',
          search: 'string? — matches user fields, payment refs, subscription refs, plan name',
          status: "string? — default 'ALL'; PENDING matches PENDING + PENDING_SUBSCRIPTION",
          access: "'ACTIVE' | 'EXPIRED'? — derived from subscription status/expiresAt",
          sortBy: "'createdAt' | 'expiresAt' | 'amount'? (alias: sort)",
          sortOrder: "'asc' | 'desc'? (alias: order)",
          startDate: 'string? — filters createdAt >= startDate when parseable',
          endDate: 'string? — filters createdAt < endDate when parseable',
          count: "'false'? — omit totalCount",
          cursor: 'string? — base64("<sortValue>::<id>") for keyset pagination',
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("purchases").',
          'Rate limit: admin-purchases:list (120 / 60s).',
          'Cursor sortValue: amount uses amountCents; expiresAt uses subscription.expiresAt ISO; createdAt uses createdAt ISO.',
          'When cursor is used, totalCount is not computed.',
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', search: 'Lifetime', status: 'SUCCEEDED', access: 'ACTIVE', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: { purchases: [{ id: 'pay_1', planName: 'Lifetime Pro', userName: 'Jane Doe', userEmail: 'jane@example.com', userId: 'user_abc', amountCents: 9900, amountFormatted: '$99.00', subtotalCents: 11900, subtotalFormatted: '$119.00', discountCents: 2000, discountFormatted: '$20.00', couponCode: 'WELCOME20', currency: 'usd', status: 'SUCCEEDED', createdAt: '2026-04-04T10:00:00.000Z', externalPaymentId: 'pi_123', externalSessionId: 'cs_123', dashboardUrl: 'https://dashboard.stripe.com/payments/pi_123', paymentProvider: 'stripe', subscription: { id: 'sub_1', status: 'ACTIVE', externalSubscriptionId: 'sub_ext_123', expiresAt: '2027-04-04T10:00:00.000Z' } }], totalCount: 1, currentPage: 1, totalPages: 1, hasNextPage: false, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/admin/purchases/[id]/[action]',
        summary: 'Refund a purchase',
        description: 'Issues a refund for a SUCCEEDED payment when action=refund; cancels the associated subscription if present and may clear paid tokens based on flags and policy.',
        access: 'admin',
        body: {
          clearPaidTokens: 'boolean? — optional; default false',
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("purchases").',
          'Rate limit: admin-purchases:action (60 / 120s).',
          'Returns 400 when action is not refund, when payment status is not SUCCEEDED, or when provider refund fails.',
          'Returns 404 when payment id is not found.',
        ],
        rateLimitTier: 'admin',
        example: { clearPaidTokens: true },
        response: { success: true }
      },
      {
        method: 'POST',
        path: '/api/admin/purchases/[id]/expire',
        summary: 'Expire a purchase subscription',
        description: 'Marks the associated subscription as EXPIRED immediately (requires ACTIVE subscription) and may clear paid tokens based on flags and policy.',
        access: 'admin',
        body: {
          clearPaidTokens: 'boolean? — optional; default false',
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("purchases").',
          'Rate limit: admin-purchases:expire (60 / 120s).',
          'Returns 400 when there is no subscription for the payment or the subscription is not ACTIVE.',
          'Returns 404 when payment id is not found.',
        ],
        rateLimitTier: 'admin',
        example: { clearPaidTokens: false },
        response: { success: true }
      },
    ]
  },
  {
    id: 'files',
    title: 'Files & uploads (admin)',
    description: 'Upload and manage images/assets used by the dashboard and marketing pages.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/file/list',
        summary: 'List uploaded admin files',
        description: 'Returns stored files with cursor pagination and optional search.',
        access: 'admin',
        params: {
          limit: 'number? — default 20',
          cursor: 'string? — storage cursor',
          search: 'string? — filters by filename/key',
          scope: "'file' | 'logo' | 'blog'? — default 'file'",
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { query: { scope: 'file', limit: '20', search: 'hero-banner' } },
        response: { files: [{ url: 'https://cdn.example.com/admin/hero-banner-1234abcd.webp', filename: 'hero-banner-1234abcd.webp', size: 184321, uploadedAt: '2026-04-04T10:00:00.000Z', key: 'file/hero-banner-1234abcd.webp' }], pagination: { limit: 20, hasMore: false, nextCursor: null, total: 1 } }
      },
      {
        method: 'POST',
        path: '/api/admin/file/upload',
        summary: 'Upload an image file',
        description: 'Uploads a single image via raw request body; scope controls whether the asset is treated as a logo or general file. SVG uploads are sanitized server-side.',
        access: 'admin',
        notes: [
          'Auth: API route uses requireAdmin(); auth failures return JSON via toAuthGuardErrorResponse().',
          'Rate limit: admin-upload:<scope> (20 / 120s), where scope is logo|file.',
          'Scope: ?scope=logo|file or header x-upload-scope; defaults to file.',
          'Headers: x-mimetype (hint), x-filename (optional original name).',
          'Allowed mimes: image/png, image/jpeg, image/webp, image/svg+xml, image/x-icon, image/vnd.microsoft.icon.',
          'Max size: 2MB; returns 413 when exceeded.',
          'Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.'
        ],
        rateLimitTier: 'admin',
        example: { query: { scope: 'file' }, headers: { 'x-filename': 'hero-banner.webp', 'x-mimetype': 'image/webp' } },
        response: { url: 'https://cdn.example.com/admin/hero-banner-1234abcd.webp' }
      },
      {
        method: 'DELETE',
        path: '/api/admin/file/delete',
        summary: 'Delete an uploaded admin file',
        description: 'Deletes a stored file by key. Key can be passed via JSON body { key } or ?key=... query param.',
        access: 'admin',
        body: {
          key: 'string? — file key (body or query param)',
        },
        notes: ['Auth: requires ADMIN via requireAdmin().', 'Returns 400 when key is missing.'],
        rateLimitTier: 'admin',
        example: { key: 'file/hero-banner-1234abcd.webp' },
        response: { success: true }
      },
      {
        method: 'POST',
        path: '/api/admin/logo/upload',
        summary: 'Legacy logo upload endpoint (moved)',
        description: 'This endpoint is deprecated and returns 410 with a message pointing to /api/admin/file/upload.',
        access: 'admin',
        notes: ['Returns 410 Gone.'],
        rateLimitTier: 'admin',
        example: {},
        response: { error: 'This endpoint has moved to /api/admin/file/upload. Please update your client to use the new URL.' }
      },
      {
        method: 'POST',
        path: '/api/admin/upload',
        summary: 'Legacy form-data upload (deprecated)',
        description: 'Uploads a single image from multipart/form-data field "file" and writes to public/uploads. Prefer /api/admin/file/upload for authenticated admin uploads.',
        access: 'admin',
        body: {
          file: 'File — required (multipart/form-data)',
        },
        notes: [
          'Auth: API route uses requireAdmin(); auth failures return JSON via toAuthGuardErrorResponse().',
          'Rate limit: admin-upload:legacy-form-data (20 / 120s). Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.',
          'Allowed mimes: image/jpeg, image/jpg, image/png, image/gif, image/webp.',
          'Max size: 5MB.',
        ],
        rateLimitTier: 'admin',
        example: { formData: { file: 'hero-banner.jpg' } },
        response: { url: '/uploads/1712227200000-a1b2c3d4.jpg', filename: '1712227200000-a1b2c3d4.jpg', size: 184321, type: 'image/jpeg' }
      },
    ]
  },
  {
    id: 'theme',
    title: 'Theme & branding (admin)',
    description: 'Manage theme links, footer text, and injected custom code snippets.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/theme',
        summary: 'Read theme settings',
        description: 'Returns header/footer links, footer text, custom CSS, and custom head/body snippets. Includes X-RateLimit-* headers.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-theme:get (120 / 120s).',
          'Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.',
        ],
        rateLimitTier: 'admin',
        example: {},
        response: {
          headerLinks: [{ label: 'Pricing', href: '/pricing' }],
          footerLinks: [{ label: 'Privacy', href: '/privacy' }],
          footerText: 'Built with SaaSyBase',
          customCss: '.hero { letter-spacing: -0.02em; }',
          customHead: '<meta name="theme-color" content="#0f172a" />',
          customBody: '<script>window.__themeLoaded=true;</script>',
          legacySnippet: '',
          colorPalette: {
            light: { bgPrimary: '#fff8ef', bgSecondary: '#ffffff', panelBg: '#ffffff', heroBg: '#fff1d6', bgTertiary: '#f7e6c7', bgQuaternary: '#edd9b0', textPrimary: '#20150f', textSecondary: '#6b4f3a', textTertiary: '#8a6b54', borderPrimary: '#d9c2a0', borderSecondary: '#ead9bc', accentPrimary: '#c75b12', accentHover: '#a84a0e', headerBg: '#fff8eff2', headerOpacity: 1, headerText: '#20150f', headerBlur: 12, headerBorder: '#d9c2a0', headerBorderOpacity: 1, headerBorderWidth: 1, headerMenuFontSize: 14, headerMenuFontWeight: 500, stickyHeaderBg: '#fff8eff2', stickyHeaderOpacity: 1, stickyHeaderBlur: 14, stickyHeaderText: '#20150f', stickyHeaderBorder: '#d9c2a0', stickyHeaderBorderOpacity: 1, stickyHeaderBorderWidth: 1, sidebarBg: '#fff8eff2', sidebarOpacity: 1, sidebarBorder: '#d9c2a0', headerShadow: '#00000014', headerShadowBlur: 30, headerShadowSpread: -22, stickyHeaderShadow: '#00000014', stickyHeaderShadowBlur: 30, stickyHeaderShadowSpread: -22, pageGradientFrom: '#fff8ef', pageGradientVia: '#fff1d6', pageGradientTo: '#ffe4bd', heroGradientFrom: '#fff8ef', heroGradientVia: '#fff1d6', heroGradientTo: '#ffe4bd', cardGradientFrom: '#fffdf9', cardGradientVia: '#fff4e4', cardGradientTo: '#ffe8c6', tabsGradientFrom: '#fff8ef', tabsGradientVia: '#fff1d6', tabsGradientTo: '#ffe4bd', pageGlow: '#f59e0b33', glowOpacity: 1 },
            dark: { bgPrimary: '#120f0b', bgSecondary: '#1b1712', panelBg: '#1b1712', heroBg: '#221b13', bgTertiary: '#2c2319', bgQuaternary: '#382c20', textPrimary: '#f8ecdd', textSecondary: '#d0baa5', textTertiary: '#aa927b', borderPrimary: '#4a3a2a', borderSecondary: '#5a4735', accentPrimary: '#f59e0b', accentHover: '#fbbf24', headerBg: '#120f0bf2', headerOpacity: 1, headerText: '#f8ecdd', headerBlur: 12, headerBorder: '#4a3a2a', headerBorderOpacity: 1, headerBorderWidth: 1, headerMenuFontSize: 14, headerMenuFontWeight: 500, stickyHeaderBg: '#120f0bf2', stickyHeaderOpacity: 1, stickyHeaderBlur: 14, stickyHeaderText: '#f8ecdd', stickyHeaderBorder: '#4a3a2a', stickyHeaderBorderOpacity: 1, stickyHeaderBorderWidth: 1, sidebarBg: '#120f0bf2', sidebarOpacity: 1, sidebarBorder: '#4a3a2a', headerShadow: '#00000033', headerShadowBlur: 30, headerShadowSpread: -22, stickyHeaderShadow: '#00000033', stickyHeaderShadowBlur: 30, stickyHeaderShadowSpread: -22, pageGradientFrom: '#120f0b', pageGradientVia: '#1b1712', pageGradientTo: '#221b13', heroGradientFrom: '#120f0b', heroGradientVia: '#1b1712', heroGradientTo: '#221b13', cardGradientFrom: '#1b1712', cardGradientVia: '#241d15', cardGradientTo: '#2c2319', tabsGradientFrom: '#120f0b', tabsGradientVia: '#1b1712', tabsGradientTo: '#221b13', pageGlow: '#f59e0b26', glowOpacity: 1 }
          }
        }
      },
      {
        method: 'PUT',
        path: '/api/admin/theme',
        summary: 'Update theme settings',
        description: 'Updates theme settings and clears settings cache. Supports reset=true to restore defaults.',
        access: 'admin',
        body: {
          reset: 'boolean? — when true resets theme settings to defaults',
          headerLinks: 'Array<{label:string, href:string}>? — max 10; href must start with http(s):// or /',
          footerLinks: 'Array<{label:string, href:string}>? — max 10; href must start with http(s):// or /',
          footerText: 'string? — trimmed; empty becomes default',
          customCss: 'string? — max 10k chars',
          customHead: 'string? — max 10k chars',
          customBody: 'string? — max 10k chars (aliases: customCode/customJs)',
          colorPalette: 'object? — sanitized light/dark theme token palette',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-theme:update (40 / 120s).',
          'Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.',
        ],
        rateLimitTier: 'admin',
        example: { headerLinks: [{ label: 'Pricing', href: '/pricing' }], footerLinks: [{ label: 'Privacy', href: '/privacy' }], footerText: 'Built with SaaSyBase', customCss: '.hero { letter-spacing: -0.02em; }', customHead: '<meta name="theme-color" content="#0f172a" />', customBody: '<script>window.__themeLoaded=true;</script>', colorPalette: { light: { accentPrimary: '#c75b12' }, dark: { accentPrimary: '#f59e0b' } } },
        response: { headerLinks: [{ label: 'Pricing', href: '/pricing' }], footerLinks: [{ label: 'Privacy', href: '/privacy' }], footerText: 'Built with SaaSyBase', customCss: '.hero { letter-spacing: -0.02em; }', customHead: '<meta name="theme-color" content="#0f172a" />', customBody: '<script>window.__themeLoaded=true;</script>', legacySnippet: '', colorPalette: { light: { accentPrimary: '#c75b12' }, dark: { accentPrimary: '#f59e0b' } } }
      },
      {
        method: 'GET',
        path: '/api/admin/theme/export',
        summary: 'Export theme settings',
        description: 'Exports theme-managed settings as a downloadable JSON snapshot, including defaults for theme keys not yet persisted in the database.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-theme:export (10 / 120s).',
          'Response is JSON with Content-Disposition attachment headers for download.',
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { _meta: { type: 'saasybase-theme', version: 1, exportedAt: '2026-04-05T12:00:00.000Z', count: 42 }, settings: { FOOTER_TEXT: 'Built with SaaSyBase', CUSTOM_CSS: '.hero { letter-spacing: -0.02em; }', HEADER_LINKS: '[{"label":"Pricing","href":"/pricing"}]' } }
      },
      {
        method: 'POST',
        path: '/api/admin/theme/import',
        summary: 'Import theme settings',
        description: 'Imports a previously exported theme snapshot, ignoring non-theme keys and clearing the settings cache afterward.',
        access: 'admin',
        body: {
          _meta: { type: '"saasybase-theme" — required', version: '1 — required' },
          settings: 'Record<string, string> — theme settings from /api/admin/theme/export',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-theme:import (5 / 120s).',
          'Returns 400 for invalid envelopes, empty imports, or when no valid theme keys are present.',
        ],
        rateLimitTier: 'admin',
        example: { _meta: { type: 'saasybase-theme', version: 1 }, settings: { FOOTER_TEXT: 'Built with SaaSyBase', CUSTOM_CSS: '.hero { letter-spacing: -0.02em; }' } },
        response: { imported: 2, skipped: 0 }
      },
    ]
  },
  {
    id: 'maintenance',
    title: 'Maintenance & operations (admin)',
    description: 'Operational helpers for internal cache inspection and cleanup tasks.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/maintenance/discounted-subscription-price-cache',
        summary: 'Inspect discounted subscription price cache',
        description: 'Returns aggregate stats for discounted subscription price cache entries, including stale pending rows, aged ready rows, and invalid payloads.',
        access: 'admin',
        params: {
          pendingOlderThanMinutes: 'number|string? — stale pending threshold; default 10, min 1, max 1440',
          readyOlderThanDays: 'number|string? — old ready threshold; default 90, min 1, max 3650',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: 30 / 60s per admin for stats reads.',
          'Scans up to 5000 settings keys with the discounted_subscription_price_v1: prefix.',
        ],
        rateLimitTier: 'admin',
        example: { query: { pendingOlderThanMinutes: '15', readyOlderThanDays: '120' } },
        response: { stats: { prefix: 'discounted_subscription_price_v1:', total: 18, pending: 3, ready: 12, stalePending: 1, oldReady: 4, invalid: 2, scanned: 18 }, thresholds: { pendingOlderThanMinutes: 15, readyOlderThanDays: 120 }, limits: { maxScan: 5000 } }
      },
      {
        method: 'POST',
        path: '/api/admin/maintenance/discounted-subscription-price-cache',
        summary: 'Clean discounted subscription price cache',
        description: 'Deletes invalid or expired discounted subscription cache entries. Dry-run mode is enabled by default.',
        access: 'admin',
        body: {
          pendingOlderThanMinutes: 'number|string? — stale pending threshold; default 10',
          readyOlderThanDays: 'number|string? — old ready threshold; default 90',
          dryRun: 'boolean? — default true; when false, matching keys are deleted',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: 10 / 60s per admin for cleanup runs.',
          'Returns both the action summary and post-cleanup stats.',
        ],
        rateLimitTier: 'admin',
        example: { pendingOlderThanMinutes: 15, readyOlderThanDays: 120, dryRun: false },
        response: { dryRun: false, scanned: 18, wouldDelete: 7, deleted: 7, thresholds: { pendingOlderThanMinutes: 15, readyOlderThanDays: 120 }, reasons: { stalePending: 1, oldReady: 4, invalid: 2 }, statsAfter: { prefix: 'discounted_subscription_price_v1:', total: 11, pending: 2, ready: 9, stalePending: 0, oldReady: 0, invalid: 0, scanned: 11 } }
      },
    ]
  },
  {
    id: 'audit',
    title: 'Logs & audit (admin)',
    description: 'Inspect server logs and administrator/moderator actions for operational debugging and compliance.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/logs',
        summary: 'List system logs',
        description: 'Lists system logs with pagination, filters, and sorting. When the SystemLog model is not available, returns an empty result set.',
        access: 'admin',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          search: 'string? — contains match against message/level',
          level: 'string? — exact match (e.g. info/warn/error)',
          sortBy: "'createdAt' | 'level' | 'message'? — default 'createdAt'",
          sortOrder: "'asc' | 'desc'? — default 'desc'",
          startDate: 'string? — YYYY-MM-DD (inclusive, UTC 00:00)',
          endDate: 'string? — YYYY-MM-DD (exclusive, UTC 00:00)',
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '50', level: 'error', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: { logs: [{ id: 'log_1', level: 'error', message: 'Failed to send email', meta: { templateId: 'tmpl_1' }, context: { job: 'email_queue' }, createdAt: '2026-04-04T10:00:00.000Z', createdAtFormatted: 'Apr 4, 2026, 10:00 AM', createdAtRelative: '2 minutes ago', createdAtDisplay: 'Apr 4, 2026, 10:00 AM • 2 minutes ago' }], total: 1, page: 1, pageCount: 1, limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }
      },
      {
        method: 'DELETE',
        path: '/api/admin/logs',
        summary: 'Clear system logs',
        description: 'Deletes all system logs and returns the number cleared. When the SystemLog model is not available, returns cleared=0.',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin',
        example: {},
        response: { success: true, cleared: 142 }
      },
      {
        method: 'GET',
        path: '/api/admin/moderator-actions',
        summary: 'List admin/moderator actions (admin only)',
        description: 'Returns a paginated audit log of admin/moderator actions with filters and cursor paging. Moderators are forbidden even if authenticated.',
        access: 'admin',
        params: {
          cursor: 'string? — cursor pagination',
          limit: 'number? — positive integer',
          page: 'number? — positive integer (offset pagination mode)',
          search: 'string? — search filter',
          actorRole: "'ADMIN' | 'MODERATOR'?",
          actionGroup: 'string? — group prefix; when not ALL, server filters by "<group>."',
          targetType: "string? — when NONE maps to null; when ALL disables filter",
          sortBy: 'string? — see AdminActionFilters',
          sortOrder: "'asc' | 'desc'?",
          startDate: 'string? — filter window start',
          endDate: 'string? — filter window end',
        },
        notes: [
          'Auth: requires requireAdminOrModerator(), then enforces actor.role===ADMIN (403 otherwise).',
          'Response includes availableActionGroups and previousCursor/nextCursor.',
        ],
        rateLimitTier: 'admin',
        example: { query: { page: '1', limit: '25', actorRole: 'ADMIN', actionGroup: 'users', sortBy: 'createdAt', sortOrder: 'desc' } },
        response: { entries: [{ id: 'act_1', action: 'users.updateRole', actor: { id: 'user_admin', name: 'Admin User', email: 'admin@example.com', role: 'ADMIN' }, actorRole: 'ADMIN', target: { id: 'user_abc', name: 'Jane Doe', email: 'jane@example.com', role: 'USER' }, targetType: 'USER', details: { role: 'ADMIN' }, createdAt: '2026-04-04T10:00:00.000Z' }], totalCount: 1, nextCursor: null, previousCursor: null, pageInfo: { totalCount: 1, hasNextPage: false, hasPreviousPage: false }, availableActionGroups: ['users', 'plans', 'settings'], availableActions: ['users.updateRole', 'settings.update'] }
      },
      {
        method: 'DELETE',
        path: '/api/admin/moderator-actions',
        summary: 'Clear admin/moderator action log (admin only)',
        description: 'Deletes audit log entries and returns deletedCount. Moderators are forbidden.',
        access: 'admin',
        notes: ['Auth: requires admin role (moderators are forbidden).'],
        rateLimitTier: 'admin',
        example: {},
        response: { ok: true, deletedCount: 87 }
      },
    ]
  },
  {
    id: 'settings',
    title: 'Configuration & preferences',
    description: 'Read and update global settings, plus user preference storage.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/settings',
        summary: 'Read a setting by key',
        description: 'Fetches a single setting key/value pair. Requires ?key=... query param; server falls back to SETTING_DEFAULTS when missing in DB.',
        access: 'admin',
        params: {
          key: 'string — required'
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-settings:list (limit 240 / 120s).',
          'Response includes X-RateLimit-Limit / Remaining / Reset headers on success.'
        ],
        rateLimitTier: 'admin',
        example: { query: { key: 'SITE_NAME' } },
        response: { key: 'SITE_NAME', value: 'SaaSyBase' }
      },
      {
        method: 'GET',
        path: '/api/admin/settings/export',
        summary: 'Export settings snapshot',
        description: 'Exports all non-theme settings as a downloadable JSON snapshot, merging known defaults with database overrides.',
        access: 'admin',
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-settings:export (10 / 120s).',
          'Theme-managed keys are excluded from this export.',
          'Response is JSON with Content-Disposition attachment headers for download.',
        ],
        rateLimitTier: 'admin',
        example: {},
        response: { _meta: { type: 'saasybase-settings', version: 1, exportedAt: '2026-04-05T12:00:00.000Z', count: 128, dbCount: 63, includesDefaults: true, excludesTheme: true, themeExcludedCount: 42 }, settings: { SITE_NAME: 'SaaSyBase', SUPPORT_EMAIL: 'support@example.com', DEFAULT_CURRENCY: 'USD' } }
      },
      {
        method: 'POST',
        path: '/api/admin/settings/import',
        summary: 'Import settings snapshot',
        description: 'Imports a previously exported settings snapshot, skipping theme-managed keys and clearing the settings cache afterward.',
        access: 'admin',
        body: {
          _meta: { type: '"saasybase-settings" — required', version: '1 — required' },
          settings: 'Record<string, string> — non-theme settings from /api/admin/settings/export',
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-settings:import (5 / 120s).',
          'Returns 400 for invalid envelopes, empty imports, or when the payload exceeds 2000 settings.',
        ],
        rateLimitTier: 'admin',
        example: { _meta: { type: 'saasybase-settings', version: 1 }, settings: { SITE_NAME: 'SaaSyBase', SUPPORT_EMAIL: 'support@example.com' } },
        response: { imported: 2, skippedTheme: 0 }
      },
      {
        method: 'POST',
        path: '/api/admin/settings',
        summary: 'Set a setting (cache-aware)',
        description: 'Updates a setting via setSetting(key,value). For DEFAULT_CURRENCY, enforces provider-specific currency restrictions when active provider is paystack or razorpay.',
        access: 'admin',
        body: {
          key: 'string — required',
          value: 'unknown — stored as String(value ?? "")'
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-settings:write (limit 60 / 120s).',
          'DEFAULT_CURRENCY validation: must be a 3-letter ISO code; may return 400 if unsupported by active provider.'
        ],
        rateLimitTier: 'admin',
        example: { key: 'SITE_NAME', value: 'SaaSyBase' },
        response: { key: 'SITE_NAME', value: 'SaaSyBase' }
      },
      {
        method: 'PATCH',
        path: '/api/admin/settings',
        summary: 'Upsert a setting (direct DB)',
        description: 'Upserts a single setting via { key, value } or bulk upserts via { updates: [{ key, value }] }, then clears the settings cache so changes take effect immediately.',
        access: 'admin',
        body: {
          key: 'string? — required for single upsert mode',
          value: 'unknown? — stored as String(value ?? "") in single upsert mode',
          updates: 'Array<{ key: string; value: unknown }> ? — bulk mode; first 50 valid items are applied'
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin().',
          'Rate limit: admin-settings:write (limit 60 / 120s).'
        ],
        rateLimitTier: 'admin',
        example: { updates: [{ key: 'SITE_NAME', value: 'SaaSyBase' }, { key: 'SUPPORT_EMAIL', value: 'support@example.com' }] },
        response: { settings: [{ key: 'SITE_NAME', value: 'SaaSyBase' }, { key: 'SUPPORT_EMAIL', value: 'support@example.com' }] }
      },
      {
        method: 'GET',
        path: '/api/user/settings',
        summary: 'List user settings',
        description: 'Returns all settings stored for the current Clerk user.',
        access: 'user',
        notes: ['Auth: Clerk auth(); returns 401 when userId is missing.'],
        rateLimitTier: 'user',
        example: {},
        response: { settings: [{ id: 'uset_1', key: 'TIMEZONE', value: 'America/New_York' }, { id: 'uset_2', key: 'EMAIL_NOTIFICATIONS', value: 'true' }] }
      },
      {
        method: 'PATCH',
        path: '/api/user/settings',
        summary: 'Update a user setting',
        description: 'Upserts a user setting for the current Clerk user. Only a whitelist of keys is editable.',
        access: 'user',
        body: {
          key: "'EMAIL_NOTIFICATIONS' | 'EXPORT_QUALITY' | 'THEME_PREFERENCE' | 'TIMEZONE'",
          value: 'unknown'
        },
        notes: ['Returns 400 { error: "Setting not editable" } when key is not whitelisted.'],
        rateLimitTier: 'user',
        example: { key: 'TIMEZONE', value: 'America/New_York' },
        response: { success: true, setting: { id: 'uset_1', key: 'TIMEZONE', value: 'America/New_York' } }
      },
      {
        method: 'GET',
        path: '/api/settings/tokens',
        summary: 'Read token reset policy flags',
        description:
          'Returns token-related settings that the client and external integrations may need for UI hints (e.g. whether one-time renewals reset paid tokens).',
        access: 'public',
        notes: [
          'Public endpoint (no auth).',
          'Response: { ok: true, oneTimeRenewalResetsTokens: boolean } on success; { ok: false, error } with status 500 on failure.'
        ],
        rateLimitTier: 'public',
        example: {},
        response: { ok: true, oneTimeRenewalResetsTokens: false, recurringRenewalResetsTokens: true }
      }
    ]
  },
  {
    id: 'account',
    title: 'Account & entitlements',
    description: 'Fetch current-user profile, token balances, and entitlement checks used by the app runtime.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/internal/spend-tokens',
        summary: 'Spend/deduct tokens (internal, server-to-server)',
        description:
          'Atomically spends tokens from the appropriate bucket (paid/free/shared workspace pool). This is intended for server-to-server integrations, not browsers.',
        access: 'internal',
        body: {
          userId: 'string — required',
          amount: 'number | string — required; positive integer',
          bucket: "'auto' | 'paid' | 'free' | 'shared'? — default 'auto'",
          feature: 'string? — free-form label for audit/analytics (max 120 chars)',
          organizationId: 'string? — when bucket=shared, optionally pin to a specific workspace membership',
          requestId: 'string? — opaque request label for audit logs (not idempotency)',
        },
        notes: [
          'Auth: production requires Authorization: Bearer INTERNAL_API_TOKEN and returns 404 for unauthorized calls to reduce endpoint discovery.',
          'Non-prod: also accepts X-Internal-API: true for dev convenience; unauthorized calls return 401 { error: "Unauthorized" }.',
          "bucket=auto chooses: active personal subscription → paid; else active workspace membership → shared; else free.",
          'On insufficient funds, returns 409 { error: "insufficient_tokens", required, available, bucket }.',
        ],
        rateLimitTier: 'internal',
        example: { userId: 'user_abc', amount: 25, bucket: 'shared', feature: 'image_generation', organizationId: 'org_1', requestId: 'req_123' },
        response: { ok: true, userId: 'user_abc', amount: 25, bucket: 'shared', organizationId: 'org_1', warnings: [{ code: 'soft_cap_exceeded', message: 'Member has exceeded their shared token cap (SOFT mode).', cap: 100, usageBefore: 90, usageAfter: 115 }], sharedCap: { strategy: 'SOFT', cap: 100, usageBefore: 90, usageAfter: 115, remainingBefore: 10, remainingAfter: 0, windowStart: '2026-04-04T00:00:00.000Z', resetIntervalHours: 24 }, balances: { paid: 400, free: 50, sharedPool: 975 } }
      },
      {
        method: 'GET',
        path: '/api/user/profile',
        summary: 'Fetch current user profile + token balances',
        description:
          'Returns the authenticated user profile and a detailed view of paid/free/shared token balances, plus subscription and workspace plan context when available.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'Returns 401 { error: "Unauthorized" } when not authenticated.',
          'Returns 404 when the user id is not present in the local database.',
          'Response includes permissions for admins/moderators (used to hide/show admin navigation).' 
        ],
        rateLimitTier: 'user',
        example: {},
        response: { user: { id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', role: 'USER' }, paidTokens: { tokenName: 'tokens', remaining: 100, isUnlimited: false, displayRemaining: '100' }, subscription: { planName: 'Pro', expiresAt: 'May 1, 2026', tokenName: 'tokens', tokens: { total: 1000, used: 900, remaining: 100, isUnlimited: false, displayRemaining: '100' } }, organization: null, sharedTokens: null, freeTokens: { tokenName: 'tokens', total: null, remaining: 50 }, planSource: 'PERSONAL', planActionLabel: 'Change Plan', canCreateOrganization: true, hasPendingTeamInvites: false }
      },
      {
        method: 'PATCH',
        path: '/api/user/profile',
        summary: 'Update current user profile',
        description: 'Updates the authenticated user name and/or email address. Providers that require verification-backed email changes may return a pending state instead of applying the new email immediately.',
        access: 'user',
        body: {
          name: 'string? — full name; normalized and validated when provided',
          firstName: 'string? — optional when using split-name input',
          lastName: 'string? — optional when using split-name input',
          email: 'string? — new email address; uniqueness checked before update or pending verification',
        },
        notes: [
          'Auth: requires an authenticated session.',
          'Returns 409 when the requested email is already in use.',
          'For providers that stage email changes behind verification, the response can include emailChangePending=true until the verification link is completed.',
          'The current implementation supports deferred email changes for NextAuth password accounts.'
        ],
        rateLimitTier: 'user',
        example: { name: 'Jane Doe', email: 'jane.new@example.com' },
        response: { user: { id: 'user_abc', name: 'Jane Doe', email: 'jane@example.com' }, verificationRequired: true, emailChangePending: true, pendingEmail: 'jane.new@example.com' }
      },
      {
        method: 'GET',
        path: '/api/user/active-org',
        summary: 'Get active workspace selection',
        description: 'Returns the organizations the user belongs to and the currently selected active organization for providers or clients that use the app-managed workspace cookie.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'If the active-org cookie points at a workspace the user no longer belongs to, the cookie is cleared and activeOrgId is returned as null.',
          'Providers with native organization switching may not rely on this endpoint, but it remains useful for app-managed workspace selection flows.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: { activeOrgId: 'org_1', organizations: [{ id: 'org_1', name: 'Acme Workspace', slug: 'acme-workspace', role: 'OWNER', isOwner: true, planName: 'Business' }] }
      },
      {
        method: 'POST',
        path: '/api/user/active-org',
        summary: 'Set active workspace selection',
        description: 'Stores the active organization id in an httpOnly cookie or clears it to switch back to the personal workspace.',
        access: 'user',
        body: {
          orgId: 'string | null — target organization id; null clears the active workspace',
        },
        notes: [
          'Auth: requires an authenticated session.',
          'Returns 403 when the user is not an active member of the requested organization.'
        ],
        rateLimitTier: 'user',
        example: { orgId: 'org_1' },
        response: { activeOrgId: 'org_1' }
      },
      {
        method: 'POST',
        path: '/api/user/change-password',
        summary: 'Change password',
        description: 'Changes the current user password after verifying the existing password, then revokes other sessions by bumping tokenVersion and deleting stored sessions.',
        access: 'user',
        body: {
          currentPassword: 'string — required',
          newPassword: 'string — required; must satisfy password policy',
        },
        notes: [
          'Auth: requires an authenticated session.',
          'Password-based accounts only; social-login-only users receive a 400 explaining that they must use forgot-password.',
          'Rate limited per user.'
        ],
        rateLimitTier: 'user',
        example: { currentPassword: 'oldSecureP@ss1', newPassword: 'newSecureP@ss2' },
        response: { message: 'Password changed successfully' }
      },
      {
        method: 'DELETE',
        path: '/api/user/pending-email-change',
        summary: 'Cancel pending email change',
        description: 'Cancels a pending NextAuth email-change verification flow for the current user.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'Only supported when AUTH_PROVIDER=nextauth; other auth providers return 400.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: { ok: true }
      },
      {
        method: 'GET',
        path: '/api/user/sessions',
        summary: 'List current user sessions',
        description: 'Returns the authenticated user sessions from the active auth provider, normalized for the account security UI.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'Works with both NextAuth and Clerk through the auth abstraction.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: [{ id: 'sess_1', status: 'active', lastActiveAt: '2026-04-05T11:58:00.000Z', latestActivity: 'Viewed dashboard', isCurrent: true }]
      },
      {
        method: 'GET',
        path: '/api/user/grace-status',
        summary: 'Check paid-token expiry grace window',
        description:
          'Computes whether the current user is within the configured natural-expiry grace window after a subscription ends. Used to keep access and/or cleanup UX consistent.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'When in grace, response includes expiresAt, graceEndsAt, graceHours, and plan metadata.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: { inGrace: true, graceHours: 72, expiresAt: '2026-04-02T00:00:00.000Z', graceEndsAt: '2026-04-05T00:00:00.000Z', plan: { name: 'Business', supportsOrganizations: true, autoRenew: true } }
      },
      {
        method: 'POST',
        path: '/api/user/ping-expiry-cleanup',
        summary: 'Trigger lazy paid-token cleanup check',
        description:
          'Runs a lightweight server-side check that may clear paid tokens after natural expiry grace has elapsed. Intended to be safe to call periodically from the client.',
        access: 'user',
        notes: [
          'Auth: requires an authenticated session.',
          'Failures are treated as non-fatal and returned as { ok: false, error } (status may still be 200).' 
        ],
        rateLimitTier: 'user',
        example: {},
        response: { ok: true, clearedPaidTokens: false, reason: 'still_in_grace' }
      },
      {
        method: 'POST',
        path: '/api/user/validate-org-access',
        summary: 'Validate workspace access against owner plan',
        description:
          'Validates whether the user still has access to any workspaces they belong to. If all workspace owners have expired beyond the grace window, triggers a scoped deactivation cleanup and returns { valid: false }.',
        access: 'user',
        notes: [
          'Auth: attempts requireUser(); if the check fails (including unauthenticated), the endpoint returns { valid: true, error? } and logs a warning (non-fatal by design).',
          'When cleanup runs, it only deactivates organizations whose owners are beyond grace.'
        ],
        rateLimitTier: 'user',
        example: { activeOrgId: 'org_1' },
        response: { valid: false, reason: 'org_expired', message: 'Organization access has expired.', clearActiveOrg: true, activeOrgReason: 'active_org_provider_missing' }
      },
      {
        method: 'POST',
        path: '/api/user/spend-tokens',
        summary: 'Spend tokens for user actions',
        description: 'Atomically deducts tokens from the best available user bucket (paid, shared, or free) and records usage for app-level features.',
        access: 'user',
        body: {
          amount: 'number | string — required; positive integer <= 100000',
          bucket: "'auto' | 'paid' | 'free' | 'shared'? — default 'auto'",
          feature: 'string? — free-form feature label for logging and analytics',
          organizationId: 'string? — target workspace id when spending from shared balance',
          requestId: 'string? — opaque request label for audit/logging',
        },
        notes: [
          'Auth: requires an authenticated session.',
          'Rate limited under the general API limiter.',
          'Returns 409 with error="insufficient_tokens" when the chosen bucket cannot satisfy the spend.'
        ],
        rateLimitTier: 'user',
        example: { amount: 25, bucket: 'shared', feature: 'image_generation', organizationId: 'org_1', requestId: 'req_123' },
        response: { ok: true, userId: 'user_abc', amount: 25, bucket: 'shared', organizationId: 'org_1', warnings: [{ code: 'soft_cap_exceeded', message: 'Member has exceeded their shared token cap (SOFT mode).', cap: 100, usageBefore: 90, usageAfter: 115 }], sharedCap: { strategy: 'SOFT', cap: 100, usageBefore: 90, usageAfter: 115, remainingBefore: 10, remainingAfter: 0, windowStart: '2026-04-04T00:00:00.000Z', resetIntervalHours: 24 }, balances: { paid: 400, free: 50, sharedPool: 975 } }
      },
      {
        method: 'GET',
        path: '/api/internal/payment-scripts',
        summary: 'Resolve active payment provider scripts',
        description: 'Returns the active payment provider and the client-side script definitions that should be injected for checkout flows.',
        access: 'internal',
        notes: ['Used by PaymentProviderScripts to decide which provider assets to load. Returns { scripts: [] } when the active provider config is missing.'],
        rateLimitTier: 'internal',
        example: {},
        response: { provider: 'stripe', scripts: [{ src: 'https://js.stripe.com/v3/', strategy: 'afterInteractive' }] }
      },
      {
        method: 'POST',
        path: '/api/internal/track-visit',
        summary: 'Record a visit log entry',
        description: 'Stores a visit log row for analytics/tracking. In production it requires INTERNAL_API_TOKEN; in non-production it requires X-Internal-API: true.',
        access: 'internal',
        body: {
          sessionId: 'string — required session identifier',
          ip: 'string? — visitor IP address',
          userAgent: 'string? — request user agent',
          country: 'string? — visitor country',
          referrer: 'string? — referring URL/path',
          path: 'string — required visited path',
        },
        notes: [
          'Production authorization: Authorization: Bearer INTERNAL_API_TOKEN; unauthorized requests return 404.',
          'Non-production authorization: X-Internal-API: true; unauthorized requests return 401.',
          'If VisitLog does not exist yet, the route creates the table and retries the insert once.',
        ],
        rateLimitTier: 'internal',
        example: { sessionId: 'sess_123', ip: '203.0.113.10', userAgent: 'Mozilla/5.0', country: 'US', referrer: 'https://google.com', path: '/pricing' },
        response: { success: true }
      },
      {
        method: 'POST',
        path: '/api/user/welcome',
        summary: 'Send welcome email (idempotent)',
        description:
          'Sends a welcome email to the authenticated user if not already sent. Requires a verified primary email address in Clerk.',
        access: 'user',
        notes: [
          'Auth: Clerk auth(); returns 401 when userId is missing.',
          'Returns 400 when email is missing or not verified.',
          'Returns 500 on Clerk lookup failures or email send failures.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: { ok: true, sent: true }
      },
      {
        method: 'DELETE',
        path: '/api/user/delete-account',
        summary: 'Delete current user data (DB only)',
        description:
          'Deletes user-related records and the local user record in a transaction. Intended for self-serve account deletion flows.',
        access: 'user',
        notes: [
          'Auth: Clerk auth(); returns 401 when userId is missing.',
          'This does not delete the Clerk identity; it deletes local database records only.',
          'Returns 500 { error } when deletion fails.'
        ],
        rateLimitTier: 'user',
        example: {},
        response: { success: true, message: 'Account data deleted successfully' }
      },
    ]
  },
  {
    id: 'sessions',
    title: 'Sessions & security',
    description: 'Inspect and revoke active auth sessions for the signed-in user when the active auth provider supports session management.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/sessions/[sessionId]',
        summary: 'Get session detail',
        description: 'Returns a single session summary for the signed-in user.',
        access: 'user',
        notes: [
          'Auth: requires a signed-in session.',
          'Returns 501 when the active auth provider does not support session management.',
          'Returns 404 when the session id is not one of the current user sessions.'
        ],
        rateLimitTier: 'user',
        example: { path: { sessionId: 'sess_1' } },
        response: { id: 'sess_1', status: 'ACTIVE', lastActiveAt: '2026-04-05T11:58:00.000Z', latestActivity: 'Viewed billing settings' }
      },
      {
        method: 'POST',
        path: '/api/sessions/[sessionId]/revoke',
        summary: 'Revoke one session',
        description: 'Revokes a specific session belonging to the signed-in user.',
        access: 'user',
        notes: [
          'Auth: requires a signed-in session.',
          'Returns 501 when the active auth provider does not support session management.',
          'Returns 403 when the session id is not owned by the current user.'
        ],
        rateLimitTier: 'user',
        example: { path: { sessionId: 'sess_1' } },
        response: { revoked: true }
      },
      {
        method: 'POST',
        path: '/api/sessions/revoke-others',
        summary: 'Revoke all other sessions',
        description: 'Revokes every session for the signed-in user except an optional keepSessionId.',
        access: 'user',
        body: {
          keepSessionId: 'string? — current session id to preserve while revoking the rest',
        },
        notes: [
          'Auth: requires a signed-in session.',
          'Returns 501 when the active auth provider does not support session management or cannot enumerate sessions.'
        ],
        rateLimitTier: 'user',
        example: { keepSessionId: 'sess_current' },
        response: { revoked: ['sess_old_1', 'sess_old_2'], failed: [] }
      },
      {
        method: 'GET',
        path: '/api/recent-sessions',
        summary: 'Deprecated recent sessions placeholder',
        description: 'Placeholder route that currently always returns 404 instead of a recent-session listing.',
        access: 'user',
        notes: ['Requires no request body. Success is not implemented.'],
        rateLimitTier: 'user',
        example: {},
        response: { error: 'Not found' }
      },
      {
        method: 'POST',
        path: '/api/sessions/[sessionId]',
        summary: 'Deprecated session detail alias',
        description: 'Legacy POST alias for the session detail route that currently returns 404 and performs no action.',
        access: 'user',
        notes: ['Success is not implemented.'],
        rateLimitTier: 'user',
        example: { path: { sessionId: 'sess_1' } },
        response: { error: 'Not found' }
      },
      {
        method: 'GET',
        path: '/api/sessions/[sessionId]/revoke',
        summary: 'Deprecated session revoke alias',
        description: 'Legacy GET alias for session revoke that currently returns 404 and performs no revocation.',
        access: 'user',
        notes: ['Success is not implemented.'],
        rateLimitTier: 'user',
        example: { path: { sessionId: 'sess_1' } },
        response: { error: 'Not found' }
      },
      {
        method: 'GET',
        path: '/api/sessions/revoke-others',
        summary: 'Deprecated revoke-others alias',
        description: 'Legacy GET alias for revoke-others that currently returns 404 and performs no revocation.',
        access: 'user',
        notes: ['Success is not implemented.'],
        rateLimitTier: 'user',
        example: {},
        response: { error: 'Not found' }
      },
    ]
  },
  {
    id: 'dashboard-utilities',
    title: 'Dashboard utilities',
    description: 'Signed-in user helpers for redeemed coupons and payment history shown in the dashboard UI.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/dashboard/coupons',
        summary: 'List my redeemed coupons',
        description: 'Lists coupon redemptions for the current user with eligibility and formatted date fields.',
        access: 'user',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 20, max 100',
          cursor: 'string? — coupon redemption cursor id',
          count: "'false'? — omit totalCount",
          search: 'string? — matches coupon code or description',
          unusedOnly: 'booleanish? — only return active, unconsumed redemptions',
        },
        notes: ['Auth: requires a signed-in session.'],
        rateLimitTier: 'user',
        example: { query: { page: '1', limit: '20', search: 'WELCOME', unusedOnly: 'true' } },
        response: { coupons: [{ id: 'red_1', couponId: 'coupon_1', code: 'WELCOME20', description: '20% off first purchase', percentOff: 20, amountOffCents: null, redeemedAt: '2026-04-05T10:00:00.000Z', redeemedAtFormatted: 'Apr 5, 2026, 10:00 AM', consumedAt: null, consumedAtFormatted: null, startsAt: null, startsAtFormatted: null, endsAt: '2026-05-01T00:00:00.000Z', endsAtFormatted: 'May 1, 2026', active: true, currentlyActive: true, eligiblePlans: [{ id: 'plan_pro', name: 'Pro' }] }], totalCount: 1, currentPage: 1, pageSize: 20, hasNextPage: false, hasPreviousPage: false, nextCursor: null }
      },
      {
        method: 'POST',
        path: '/api/dashboard/coupons',
        summary: 'Redeem coupon',
        description: 'Redeems a coupon for the current user after validating activity, date window, limits, and duplicate redemption state.',
        access: 'user',
        body: {
          code: 'string — required coupon code',
        },
        notes: ['Auth: requires a signed-in session.'],
        rateLimitTier: 'user',
        example: { code: 'WELCOME20' },
        response: { redemption: { id: 'red_1', couponId: 'coupon_1', code: 'WELCOME20', description: '20% off first purchase', percentOff: 20, amountOffCents: null, redeemedAt: '2026-04-05T10:00:00.000Z', redeemedAtFormatted: 'Apr 5, 2026, 10:00 AM', consumedAt: null, consumedAtFormatted: null, startsAt: null, startsAtFormatted: null, endsAt: '2026-05-01T00:00:00.000Z', endsAtFormatted: 'May 1, 2026', active: true, currentlyActive: true, stripePromotionCodeId: 'promo_123', eligiblePlans: [{ id: 'plan_pro', name: 'Pro' }] } }
      },
      {
        method: 'GET',
        path: '/api/dashboard/payments',
        summary: 'List my payments',
        description: 'Returns the signed-in user payment history with formatted amounts, optional count totals, and cursor pagination.',
        access: 'user',
        params: {
          page: 'number? — default 1',
          limit: 'number? — default 50, max 100',
          status: "string? — 'ALL' or payment status; PENDING matches PENDING + PENDING_SUBSCRIPTION",
          search: 'string? — matches payment id or subscription plan name',
          cursor: 'string? — base64("<createdAtIso>::<id>")',
          count: "'false'? — omit totalCount and use current page totals only",
        },
        notes: ['Auth: requires a signed-in session.'],
        rateLimitTier: 'user',
        example: { query: { page: '1', limit: '20', status: 'SUCCEEDED', search: 'Pro Monthly' } },
        response: { payments: [{ id: 'pay_1', amountCents: 2900, subtotalCents: 2900, discountCents: null, couponCode: null, currency: 'usd', amountFormatted: '$29.00', subtotalFormatted: '$29.00', discountFormatted: null, status: 'SUCCEEDED', createdAt: '2026-04-05T10:00:00.000Z', subscription: { id: 'sub_1', status: 'ACTIVE', startedAt: '2026-04-05T10:00:00.000Z', expiresAt: '2026-05-05T10:00:00.000Z', plan: { name: 'Pro Monthly', durationHours: 720, tokenLimit: 1000, tokenName: 'tokens' } }, plan: { id: 'plan_pro', name: 'Pro Monthly', tokenLimit: 1000, tokenName: 'tokens' } }], totalCount: 1, totalSpent: 2900, totalSpentFormatted: '$29.00', currentPage: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, nextCursor: null }
      },
    ]
  },
  {
    id: 'analytics',
    title: 'Analytics & traffic',
    description: 'Query revenue, subscriber, and engagement dashboards programmatically.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/admin/analytics',
        summary: 'Analytics snapshot',
        description: 'Returns revenue, subscriber, and conversion metrics for the requested period.',
        access: 'admin',
        params: {
          period: "AdminAnalyticsPeriod? — default '30d'"
        },
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("analytics").'],
        rateLimitTier: 'admin',
        example: { query: { period: '30d' } },
        response: { period: '30d', startDate: '2026-03-05T00:00:00.000Z', endDate: '2026-04-04T23:59:59.999Z', revenue: { total: 12450, currentPeriod: 2450, previousPeriod: 1980, daily: 120, yesterday: 95, growth: 23.74, mrr: 9800, arr: 117600, chartData: [{ date: '2026-04-01', revenue: 120 }, { date: '2026-04-02', revenue: 90 }] }, users: { total: 840, active: 312, currentPeriod: 54, previousPeriod: 43, growth: 25.58, growthData: [{ date: '2026-04-01', users: 4 }, { date: '2026-04-02', users: 3 }], today: 2, thisWeek: 11 }, subscriptions: { total: 225, active: 184, pending: 9, canceled: 32, currentPeriod: 18, previousPeriod: 15, growth: 20, conversionRate: 26.79, churnRate: 4.8, chartData: [{ date: '2026-04-01', subscriptions: 2 }, { date: '2026-04-02', subscriptions: 1 }] }, plans: [{ id: 'plan_pro', name: 'Pro', revenue: 7800, users: 96, percentage: 62.65 }], features: [{ name: 'AI credits', usage: 1240, users: 180, adoptionRate: 57.69 }], visits: { total: 18400, currentPeriod: 2400, previousPeriod: 2100, growth: 14.29, uniqueVisitors: 1310, bounceRate: 38.4, countries: [{ country: 'United States', visits: 1200, percentage: 50 }], pages: [{ path: '/pricing', views: 840, percentage: 35 }] }, charts: { revenue: [{ date: '2026-04-01', revenue: 120 }], subscriptions: [{ date: '2026-04-01', subscriptions: 2 }], users: [{ date: '2026-04-01', users: 4 }] } }
      },
      {
        method: 'GET',
        path: '/api/admin/traffic',
        summary: 'Traffic snapshot',
        description: 'Returns a traffic snapshot for the requested period/filters. Use group=... to fetch a paginated breakdown instead of the snapshot.',
        access: 'admin',
        params: {
          period: "AdminTrafficFilters['period']? — default '30d'; must be one of ADMIN_TRAFFIC_PERIODS values",
          country: 'string?',
          page: 'string? — page path filter',
          deviceType: 'string?',
          startDate: 'string? — ISO date; used with custom filters',
          endDate: 'string? — ISO date; used with custom filters',
          group: "BreakdownGroup? — when present returns a breakdown payload (not snapshot)",
          pageNumber: 'number? — breakdown pagination; default 1',
          pageSize: 'number? — breakdown pagination; default 25, max 100'
        },
        notes: [
          'Auth: requires admin/moderator via requireAdminOrModerator("traffic").',
          'Returns 400 for invalid filters or invalid group.',
          'May return 503 when Google Analytics configuration is missing.'
        ],
        rateLimitTier: 'admin',
        example: { query: { period: '30d', country: 'United States', deviceType: 'desktop' } },
        response: { period: '30d', filters: { period: '30d' }, range: { start: '2026-03-05', end: '2026-04-04', days: 31 }, totals: { visits: 2400, uniqueVisitors: 1310, pageViews: 3600, newUsers: 410, engagedSessions: 1420, engagementRate: 59.17, averageSessionDurationSeconds: 142 }, derived: { dailyVisits: 77.42, uniqueVisitorShare: 54.58, newUserShare: 17.08, engagedSessionShare: 59.17 }, charts: { visits: [{ date: '2026-04-01', value: 82 }], pageViews: [{ date: '2026-04-01', value: 129 }], granularity: 'daily' }, breakdowns: { countries: [{ name: 'United States', visits: 1200, share: 50 }], pages: [{ path: '/pricing', views: 840, share: 35 }], devices: [{ type: 'desktop', sessions: 1400, share: 58.33 }], referrers: [{ label: '(direct)', sessions: 900, share: 37.5 }], events: [{ name: 'page_view', count: 3600 }] }, filterOptions: { countries: ['United States'], pages: ['/pricing'], deviceTypes: ['desktop', 'mobile', 'tablet'] } }
      },
      {
        method: 'GET',
        path: '/api/admin/traffic?group=devices',
        summary: 'Traffic breakdown',
        description: 'Convenience example for breakdown mode; supply any supported group (TRAFFIC_BREAKDOWN_GROUPS) plus optional filters and pagination.',
        access: 'admin',
        params: {
          group: 'string — required for breakdown mode',
          pageNumber: 'number? — default 1',
          pageSize: 'number? — default 25, max 100'
        },
        rateLimitTier: 'admin',
        example: { query: { group: 'devices', pageNumber: '1', pageSize: '25' } },
        response: { rows: [{ label: 'desktop', count: 1400, percentage: 58.33 }, { label: 'mobile', count: 900, percentage: 37.5 }], totalRows: 3, totalMetricValue: 2400, page: 1, pageSize: 25, hasMore: false }
      }
    ]
  },
  {
    id: 'webhooks',
    title: 'Webhook ingress',
    description: 'Inbound webhook endpoints for payments and auth providers. All payment webhooks enforce signature verification and shared routing behavior.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/webhooks/payments',
        summary: 'Unified payments webhook router',
        description: 'Accepts Stripe, Paystack, Paddle, or Razorpay webhook payloads and routes them to the matching provider based on signature headers.',
        access: 'public',
        body: {
          event: 'provider-specific webhook payload — raw JSON body is required for signature verification',
        },
        notes: [
          'Signature header auto-detection: stripe-signature, x-paystack-signature, paddle-signature, x-razorpay-signature.',
          'Shared payment webhook responses: 400 missing/invalid signature, 413 payload too large, 429 rate limited, 499 aborted, 503 rate limiter unavailable.',
          'Successful responses return the resolved provider key in routed.',
        ],
        rateLimitTier: 'public',
        example: { headers: { 'stripe-signature': 't=1712320000,v1=signature' }, body: { id: 'evt_123', type: 'checkout.session.completed' } },
        response: { received: true, routed: 'stripe' }
      },
      {
        method: 'POST',
        path: '/api/webhooks/stripe',
        summary: 'Stripe webhook ingress',
        description: 'Provider-specific Stripe webhook endpoint that routes Stripe payloads and also tolerates Paystack signatures for legacy compatibility.',
        access: 'public',
        body: {
          event: 'Stripe webhook event payload — raw JSON body is required',
        },
        notes: [
          'Primary signature header: stripe-signature.',
          'Also accepts x-paystack-signature due to shared legacy routing behavior in this endpoint.',
        ],
        rateLimitTier: 'public',
        example: { headers: { 'stripe-signature': 't=1712320000,v1=signature' }, body: { id: 'evt_123', type: 'invoice.payment_succeeded' } },
        response: { received: true, routed: 'stripe' }
      },
      {
        method: 'POST',
        path: '/api/webhooks/paystack',
        summary: 'Paystack webhook ingress',
        description: 'Provider-specific Paystack webhook endpoint that routes Paystack payloads and also tolerates Stripe signatures for legacy compatibility.',
        access: 'public',
        body: {
          event: 'Paystack webhook event payload — raw JSON body is required',
        },
        notes: [
          'Primary signature header: x-paystack-signature.',
          'Also accepts stripe-signature due to shared legacy routing behavior in this endpoint.',
        ],
        rateLimitTier: 'public',
        example: { headers: { 'x-paystack-signature': 'signature' }, body: { event: 'charge.success', data: { reference: 'pay_ref_123' } } },
        response: { received: true, routed: 'paystack' }
      },
      {
        method: 'POST',
        path: '/api/webhooks/paddle',
        summary: 'Paddle webhook ingress',
        description: 'Provider-specific Paddle webhook endpoint that validates paddle-signature and routes standardized events through the payment service.',
        access: 'public',
        body: {
          event: 'Paddle webhook event payload — raw JSON body is required',
        },
        notes: ['Primary signature header: paddle-signature.'],
        rateLimitTier: 'public',
        example: { headers: { 'paddle-signature': 'ts=1712320000;h1=signature' }, body: { event_type: 'transaction.completed', data: { id: 'txn_123' } } },
        response: { received: true, routed: 'paddle' }
      },
      {
        method: 'POST',
        path: '/api/webhooks/clerk',
        summary: 'Clerk webhook ingress',
        description: 'Processes Clerk-signed auth, user, organization, membership, and invite events, synchronizing local records and welcome-email side effects.',
        access: 'public',
        body: {
          type: 'string — Clerk event type such as user.created or organizationMembership.created',
          data: 'object — provider-specific Clerk payload',
        },
        notes: [
          'Signature headers may be provided as clerk-signature, x-clerk-signature, svix-signature, or webhook-signature.',
          'Unsigned requests are rejected by default in all environments unless ALLOW_UNSIGNED_CLERK_WEBHOOKS=true in non-production.',
          'Organization, membership, and invite events can return specialized sync results such as organizationId, membershipId, inviteId, accepted, expired, or deleted.',
        ],
        rateLimitTier: 'public',
        example: { headers: { 'svix-signature': 'v1,signature' }, body: { type: 'user.created', data: { id: 'user_123', email_addresses: [{ email_address: 'jane@example.com' }] } } },
        response: { ok: true, sent: true }
      },
      {
        method: 'POST',
        path: '/api/stripe/webhook',
        summary: 'Legacy Stripe webhook alias',
        description: 'Legacy Stripe webhook endpoint that uses the shared payment webhook router with route label legacy-stripe and supports Stripe or Paystack signatures.',
        access: 'public',
        body: {
          event: 'Stripe or Paystack webhook payload — raw JSON body is required',
        },
        notes: [
          'Primary signature headers: stripe-signature or x-paystack-signature.',
          'Successful responses return the resolved provider in routed.',
        ],
        rateLimitTier: 'public',
        example: { headers: { 'stripe-signature': 't=1712320000,v1=signature' }, body: { id: 'evt_legacy_123', type: 'checkout.session.completed' } },
        response: { received: true, routed: 'stripe' }
      },
    ]
  },
  {
    id: 'cron',
    title: 'Cron & lifecycle jobs',
    description: 'Privileged maintenance endpoints intended for scheduled jobs and internal automation.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/cron/process-expiry',
        summary: 'Process subscription expiry and org cleanup',
        description: 'Expires outdated subscriptions, clears paid tokens after the natural-expiry grace window, and dismantles organizations whose owners no longer have valid team access.',
        access: 'internal',
        notes: [
          'Authorization: production requires Bearer token matching CRON_PROCESS_EXPIRY_TOKEN, CRON_SECRET, CRON_TOKEN, or INTERNAL_API_TOKEN.',
          'Non-production also allows X-Internal-API: true.',
          'Returns 404 instead of 401 for unauthorized production requests to reduce endpoint discovery.',
          'Rate limit: 2 requests / minute per client IP.',
        ],
        rateLimitTier: 'internal',
        example: { headers: { Authorization: 'Bearer cron_secret_token' } },
        response: { success: true, timestamp: '2026-04-05T12:00:00.000Z', results: { expiredSubscriptions: 3, clearedPaidTokenUsers: 2, dismantledOrganizations: 1, errors: [] } }
      },
    ]
  },
];

const RATE_LIMITS: AdminApiRateLimit[] = [
  { tier: 'admin', limit: '100 requests / minute', notes: 'Bursting is automatically smoothed via sliding window.' },
  { tier: 'user', limit: '60 requests / minute', notes: 'Throttle resets rolling after 60 seconds of inactivity.' },
  { tier: 'public', limit: '30 requests / minute', notes: 'Public endpoints are limited to read-only operations.' }
];

const CHANGELOG = [
  {
    version: '2026.04',
    releasedAt: '2026-04-06T00:00:00.000Z',
    notes: [
      'Audited curated request, response, and auth notes against the live route handlers and corrected drift.',
      'Updated shared authentication guidance to describe provider-aware sessions instead of Clerk-specific behavior.',
      'Refreshed health, refund, and internal token-spend entries to match current response shapes, rate limits, and auth outcomes.',
      'This changelog now tracks API-reference changes only; broader product release notes belong in the app changelog.'
    ]
  },
  {
    version: '2026.02',
    releasedAt: '2026-02-07T00:00:00.000Z',
    notes: [
      'Added internal server-to-server token spend endpoint (POST /api/internal/spend-tokens).',
      'Added user token spend endpoint for SaaSyApp (POST /api/user/spend-tokens).',
      'Expanded token-spend coverage in the reference to distinguish browser and server-to-server callers.',
      'Expanded curated docs for token/account endpoints to reduce inventory drift.',
      'Hardened legacy admin upload endpoint (API admin guard + rate limiting).',
      'API docs UI: body schema rows wrap cleanly on narrow screens.'
    ]
  },
  {
    version: '2025.09',
    releasedAt: '2025-09-20T00:00:00.000Z',
    notes: ['Traffic API now exposes breakdown pagination.', 'Notification broadcasts support INFO | SUCCESS | WARNING | ERROR types.']
  },
  {
    version: '2025.07',
    releasedAt: '2025-07-12T00:00:00.000Z',
    notes: ['User PATCH endpoint adds assignPlan action.', 'Payments backfill can repair missing Stripe payment_intent IDs.']
  }
];

function groupInventoryPath(path: string) {
  const clean = path.replace(/^\/api\/?/, '');
  const first = clean.split('/')[0] || 'misc';
  if (first === '_debug' || first === 'debug') return 'debug';
  if (first === 'dev') return 'dev';
  if (first === 'internal') return 'internal';
  return first;
}

function endpointKey(method: AdminApiEndpoint['method'], path: string) {
  return `${method} ${path}`;
}

function buildCuratedEndpointKeySet(categories: AdminApiCategory[]) {
  const keys = new Set<string>();
  for (const category of categories) {
    for (const endpoint of category.endpoints) {
      keys.add(endpointKey(endpoint.method, endpoint.path));
    }
  }
  return keys;
}

function buildInventoryCategories(): AdminApiCategory[] {
  const grouped = new Map<string, AdminApiEndpoint[]>();
  const curatedKeys = buildCuratedEndpointKeySet(CURATED_CATEGORIES);

  for (const entry of ADMIN_API_INVENTORY) {
    if (curatedKeys.has(endpointKey(entry.method, entry.path))) continue;
    const group = groupInventoryPath(entry.path);
    const access: AdminApiAccessLevel = group === 'internal' ? 'internal' : entry.access;
    const endpoint: AdminApiEndpoint = {
      method: entry.method,
      path: entry.path,
      summary: entry.summary,
      access,
      rateLimitTier: access,
      source: entry.source,
      notes: [
        ...(entry.notes ?? []),
        `Source: ${entry.source}`,
      ],
    };

    const prev = grouped.get(group) ?? [];
    prev.push(endpoint);
    grouped.set(group, prev);
  }

  const order = [
    'admin',
    'user',
    'billing',
    'checkout',
    'subscription',
    'team',
    'support',
    'notifications',
    'sessions',
    'settings',
    'webhooks',
    'cron',
    'internal',
    'dev',
    'debug',
    'misc',
  ];

  const groups = Array.from(grouped.keys()).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return groups.map((id) => {
    const endpoints = (grouped.get(id) ?? []).sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.method.localeCompare(b.method);
    });

    const titleMap: Record<string, { title: string; description: string }> = {
      admin: { title: 'Admin endpoints (inventory)', description: 'Auto-discovered endpoints under /api/admin.' },
      user: { title: 'User endpoints (inventory)', description: 'Auto-discovered user/session scoped endpoints.' },
      billing: { title: 'Billing endpoints (inventory)', description: 'User billing actions (cancel, portal, invoices).' },
      checkout: { title: 'Checkout endpoints (inventory)', description: 'Checkout initiation/confirmation endpoints used by the client.' },
      subscription: { title: 'Subscription endpoints (inventory)', description: 'Subscription status and proration endpoints.' },
      team: { title: 'Team endpoints (inventory)', description: 'Organizations, invites, and membership management endpoints.' },
      support: { title: 'Support endpoints (inventory)', description: 'Support ticket endpoints.' },
      notifications: { title: 'Notifications endpoints (inventory)', description: 'In-app notifications endpoints.' },
      sessions: { title: 'Sessions endpoints (inventory)', description: 'Session introspection and revocation helpers.' },
      settings: { title: 'Settings endpoints (inventory)', description: 'Formatting/token label and app settings endpoints.' },
      webhooks: { title: 'Webhook endpoints (inventory)', description: 'Public ingress for webhook callbacks (signature verification required).' },
      cron: { title: 'Cron endpoints (inventory)', description: 'Cron/maintenance endpoints.' },
      internal: { title: 'Internal endpoints (inventory)', description: 'Internal-only endpoints used by the app runtime.' },
      dev: { title: 'Dev endpoints (inventory)', description: 'Development helpers (do not expose in production).' },
      debug: { title: 'Debug endpoints (inventory)', description: 'Debug helpers (do not expose in production).' },
      misc: { title: 'Misc endpoints (inventory)', description: 'Auto-discovered endpoints that do not fit other groups.' },
    };

    const meta = titleMap[id] ?? { title: `${id} endpoints (inventory)`, description: 'Auto-discovered endpoints.' };
    return { id: `inventory-${id}`, title: meta.title, description: meta.description, endpoints };
  });
}

function buildSummary(categories: AdminApiCategory[]): AdminApiSummary {
  const generatedAt = new Date().toISOString();
  const totalEndpoints = categories.reduce((total, category) => total + category.endpoints.length, 0);
  const adminEndpoints = categories.reduce(
    (total, category) => total + category.endpoints.filter((endpoint) => endpoint.access === 'admin').length,
    0
  );
  const userEndpoints = categories.reduce(
    (total, category) => total + category.endpoints.filter((endpoint) => endpoint.access === 'user').length,
    0
  );
  const publicEndpoints = categories.reduce(
    (total, category) => total + category.endpoints.filter((endpoint) => endpoint.access === 'public').length,
    0
  );
  const internalEndpoints = categories.reduce(
    (total, category) => total + category.endpoints.filter((endpoint) => endpoint.access === 'internal').length,
    0
  );

  const methods: Record<string, number> = {};
  for (const category of categories) {
    for (const endpoint of category.endpoints) {
      methods[endpoint.method] = (methods[endpoint.method] || 0) + 1;
    }
  }

  return {
    generatedAt,
    totalEndpoints,
    adminEndpoints,
    userEndpoints,
    publicEndpoints,
    internalEndpoints,
    categories: categories.length,
    methods,
  };
}

export async function getAdminApiCatalog(): Promise<AdminApiCatalog> {
  const inventoryCategories = buildInventoryCategories();
  const categories = [...CURATED_CATEGORIES, ...inventoryCategories];
  const summary = buildSummary(categories);

  return {
    summary,
    categories,
    authentication: {
      guard:
        'Access is determined per endpoint: admin endpoints require an authenticated session whose resolved role is ADMIN, or moderator access where the handler explicitly allows it; user endpoints require an authenticated session from the active auth provider; public endpoints are unauthenticated; internal endpoints require a server-to-server Bearer token.',
      notes: [
        'Dashboard requests automatically forward the active auth-provider session cookies.',
        'The /admin/api page itself uses requireAdminPageAccess() and redirects unauthenticated users to sign-in or non-admins to /access-denied; API routes generally use requireAdmin() or requireAdminOrModerator() to return JSON auth errors.',
        'User-scoped endpoints validate the requester against the resource owner and will return 403 when mismatched.',
        'Internal endpoints (e.g. /api/internal/*) are intended for server-to-server calls: use Authorization: Bearer <INTERNAL_API_TOKEN>. In non-prod environments, some internal endpoints also accept X-Internal-API: true for local tooling.',
        'Some internal endpoints intentionally respond with 404 when unauthorized to reduce endpoint discovery.'
      ]
    },
    rateLimiting: RATE_LIMITS,
    changelog: CHANGELOG
  };
}

export function formatAdminApiDate(value: string) {
  return formatDate(value, { mode: 'datetime' });
}
