import { formatDate } from './formatDate';
import { ADMIN_API_INVENTORY } from './admin-api.inventory';

export type AdminApiAccessLevel = 'admin' | 'user' | 'public' | 'internal';

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
  example?: Record<string, unknown>;
  /** Example response payload (shown as JSON in docs) */
  response?: Record<string, unknown>;
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
        response: { message: 'Verification email sent' }
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
        response: { status: 'healthy', timestamp: '2026-04-04T12:00:00Z', checks: { environment: true, database: true, stripe: true, clerk: true }, errors: [] }
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
        response: { success: true, message: 'Account data deleted successfully' }
      },
      {
        method: 'GET',
        path: '/api/user/profile',
        summary: 'Get current user profile',
        description: 'Returns the authenticated user profile, token balances, current subscription summary, organization context, and invitation state.',
        access: 'user',
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
        response: {
          users: [{ id: 'user_abc', email: 'jane@example.com', name: 'Jane Doe', role: 'USER', createdAt: '2026-01-10T08:00:00.000Z', paymentsCount: 3, subscriptions: [{ id: 'sub_1', status: 'ACTIVE', expiresAt: '2026-05-01T00:00:00.000Z', plan: { id: 'plan_pro', name: 'Pro Monthly' } }], clerkData: null }],
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
        rateLimitTier: 'admin'
      },
      {
        method: 'GET',
        path: '/api/admin/users/[userId]',
        summary: 'Get user details',
        description: 'Fetches a user plus recent payments and all subscriptions (ordered newest first).',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("users").'],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        summary: 'List plans',
        description: 'Returns all plans ordered by sortOrder ASC. Response is a JSON array (not wrapped).',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:list (limit 240 / 120s).'],
        rateLimitTier: 'admin',
        response: {
          _note: 'Array of plan objects (not wrapped)',
          _example: [{ id: 'plan_1', name: 'Pro Monthly', shortDescription: 'For growing teams', description: '<p>Rich text description</p>', priceCents: 2900, durationHours: 720, active: true, stripePriceId: 'price_123', externalPriceId: 'price_123', externalPriceIds: '{"stripe":"price_123"}', externalProductIds: '{"stripe":"prod_123"}', autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1, sortOrder: 1, tokenLimit: 1000, tokenName: 'tokens', supportsOrganizations: true, organizationSeatLimit: 10, organizationTokenPoolStrategy: 'SHARED_FOR_ORG' }]
        }
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
          recurringInterval: "'day' | 'week' | 'month' | 'year'? (default 'month')",
          recurringIntervalCount: 'number? — int 1..365 (default 1)',
          tokenLimit: 'number | null?',
          tokenName: 'string | null? — max 100',
          supportsOrganizations: 'boolean? — default false',
          organizationSeatLimit: 'number | null?',
          organizationTokenPoolStrategy: "'SHARED_FOR_ORG' | null?",
        },
        notes: [
          'Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:create (limit 60 / 120s).',
          'Validation: apiSchemas.adminPlanCreate (zod).'
        ],
        rateLimitTier: 'admin',
        example: { name: 'Pro Monthly', priceCents: 2900, durationHours: 720, autoRenew: true, recurringInterval: 'month', tokenLimit: 1000, active: true },
        response: { success: true, plan: { id: 'plan_new', name: 'Pro Monthly', priceCents: 2900, durationHours: 720, active: true, externalPriceId: 'price_abc123', autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1, scope: 'INDIVIDUAL' }, warnings: [] }
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
        notes: ['Auth: requires ADMIN via requireAdmin(). Rate limit: admin-plans:delete (limit 60 / 120s).'],
        rateLimitTier: 'admin',
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'GET',
        path: '/api/admin/support/tickets/[ticketId]',
        summary: 'Get support ticket (admin)',
        description: 'Fetches a ticket by id including user and replies.',
        access: 'admin',
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'user',
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
        method: 'POST',
        path: '/api/team/invite',
        summary: 'Invite a member',
        description: 'Creates/updates a site-hosted invite and emails the recipient.',
        access: 'user',
        body: {
          email: 'string — required; normalized to lowercase',
          role: 'string? — anything containing "admin" maps to org:admin, else org:member',
        },
        notes: ['Requires a provisioned workspace; otherwise returns 400.'],
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'public'
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
        rateLimitTier: 'user'
      },
      {
        method: 'POST',
        path: '/api/team/invite/revoke',
        summary: 'Revoke invite',
        description: 'Revokes an invite in Clerk (best-effort) and expires the local invite. Requires owner workspace.',
        access: 'user',
        body: {
          token: 'string — required (alias: invitationId)',
        },
        rateLimitTier: 'user'
      },
      {
        method: 'POST',
        path: '/api/team/members/remove',
        summary: 'Remove a member',
        description: 'Removes a member from the Clerk organization and updates local membership. Owner-only.',
        access: 'user',
        body: {
          userId: 'string — required; cannot equal current userId',
        },
        rateLimitTier: 'user'
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
        notes: ['Requires auth (dev fallback exists in non-production).'],
        rateLimitTier: 'user'
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
        notes: ['Also supports POST with JSON body using the same fields.'],
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        response: { ok: true, message: 'cancellation_scheduled', expiresAt: '2026-05-01T00:00:00Z' }
      },
      {
        method: 'POST',
        path: '/api/billing/undo-cancel',
        summary: 'Undo scheduled cancellation',
        description:
          'Reverts a scheduled cancel-at-period-end. If a provider subscription id exists, calls provider.undoCancelSubscription(subId) and clears local canceledAt/cancelAtPeriodEnd.',
        access: 'user',
        rateLimitTier: 'user'
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
        ],
        rateLimitTier: 'user'
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
        ],
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
          'In non-production only, may fall back to an admin user when not authenticated.',
        ],
        rateLimitTier: 'user'
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
          'Sends upgrade/downgrade notifications best-effort.',
        ],
        rateLimitTier: 'user'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        description: 'Deletes an organization and related records. Attempts to delete the backing Clerk organization first when present (best-effort).',
        access: 'admin',
        notes: [
          'Auth: requires admin section access via requireAdminSectionAccess("organizations").',
          'Rate limit: admin-orgs:delete (60 / 120s).',
          'Returns 404 when organization does not exist.',
        ],
        rateLimitTier: 'admin',
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
        response: { success: true }
      },
      {
        method: 'PATCH',
        path: '/api/notifications/[id]/read',
        summary: 'Mark a notification read',
        description: 'Marks a single notification read if it belongs to the signed-in user. Returns { updated: 0|1 }.',
        access: 'user',
        rateLimitTier: 'user',
        response: { updated: 1 }
      },
      {
        method: 'POST',
        path: '/api/notifications/[id]/read',
        summary: 'Mark a notification read',
        description: 'POST alias for PATCH /api/notifications/[id]/read.',
        access: 'user',
        rateLimitTier: 'user',
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'GET',
        path: '/api/admin/blog/categories',
        summary: 'List blog categories',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'DELETE',
        path: '/api/admin/blog/categories/[id]',
        summary: 'Delete blog category',
        access: 'admin',
        notes: ['Auth: requires admin/moderator via requireAdminOrModerator("blog").'],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        },
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin'
      },
      {
        method: 'POST',
        path: '/api/admin/file/upload',
        summary: 'Upload an image file',
        description: 'Uploads a single image via raw request body; scope controls whether the asset is treated as a logo or general file. SVG uploads are sanitized server-side.',
        access: 'admin',
        notes: [
          'Auth: requires authenticated admin via requireAdminAuth() (route guard).',
          'Rate limit: admin-upload:<scope> (20 / 120s), where scope is logo|file.',
          'Scope: ?scope=logo|file or header x-upload-scope; defaults to file.',
          'Headers: x-mimetype (hint), x-filename (optional original name).',
          'Allowed mimes: image/png, image/jpeg, image/webp, image/svg+xml, image/x-icon, image/vnd.microsoft.icon.',
          'Max size: 2MB; returns 413 when exceeded.',
          'Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.'
        ],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'POST',
        path: '/api/admin/logo/upload',
        summary: 'Legacy logo upload endpoint (moved)',
        description: 'This endpoint is deprecated and returns 410 with a message pointing to /api/admin/file/upload.',
        access: 'admin',
        notes: ['Returns 410 Gone.'],
        rateLimitTier: 'admin'
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
          'Auth: requires authenticated admin via requireAdminAuth() (route guard).',
          'Rate limit: admin-upload:legacy-form-data (20 / 120s). Returns 429 with Retry-After on rate limit; returns 503 if rate limiter is unavailable.',
          'Allowed mimes: image/jpeg, image/jpg, image/png, image/gif, image/webp.',
          'Max size: 5MB.',
        ],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'DELETE',
        path: '/api/admin/logs',
        summary: 'Clear system logs',
        description: 'Deletes all system logs and returns the number cleared. When the SystemLog model is not available, returns cleared=0.',
        access: 'admin',
        notes: ['Auth: requires ADMIN via requireAdmin().'],
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      },
      {
        method: 'DELETE',
        path: '/api/admin/moderator-actions',
        summary: 'Clear admin/moderator action log (admin only)',
        description: 'Deletes audit log entries and returns deletedCount. Moderators are forbidden.',
        access: 'admin',
        notes: ['Auth: requires admin role (moderators are forbidden).'],
        rateLimitTier: 'admin'
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
        response: { key: 'SITE_NAME', value: 'SaaSyBase' }
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'public'
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
          'Auth: production requires Authorization: Bearer INTERNAL_API_TOKEN; unauthenticated calls return 404 to avoid endpoint discovery.',
          'Non-prod: accepts X-Internal-API: true for dev convenience.',
          "bucket=auto chooses: active personal subscription → paid; else active workspace membership → shared; else free.",
          'On insufficient funds, returns 409 { error: "insufficient_tokens", required, available, bucket }.',
        ],
        rateLimitTier: 'internal'
      },
      {
        method: 'GET',
        path: '/api/user/profile',
        summary: 'Fetch current user profile + token balances',
        description:
          'Returns the authenticated user profile and a detailed view of paid/free/shared token balances, plus subscription and workspace plan context when available.',
        access: 'user',
        notes: [
          'Auth: requires a Clerk session (requireUser()).',
          'Returns 401 { error: "Unauthorized" } when not authenticated.',
          'Returns 404 when the user id is not present in the local database.',
          'Response includes permissions for admins/moderators (used to hide/show admin navigation).' 
        ],
        rateLimitTier: 'user'
      },
      {
        method: 'GET',
        path: '/api/user/grace-status',
        summary: 'Check paid-token expiry grace window',
        description:
          'Computes whether the current user is within the configured natural-expiry grace window after a subscription ends. Used to keep access and/or cleanup UX consistent.',
        access: 'user',
        notes: [
          'Auth: requires a Clerk session (requireUser()).',
          'When in grace, response includes expiresAt, graceEndsAt, graceHours, and plan metadata.'
        ],
        rateLimitTier: 'user'
      },
      {
        method: 'POST',
        path: '/api/user/ping-expiry-cleanup',
        summary: 'Trigger lazy paid-token cleanup check',
        description:
          'Runs a lightweight server-side check that may clear paid tokens after natural expiry grace has elapsed. Intended to be safe to call periodically from the client.',
        access: 'user',
        notes: [
          'Auth: requires a Clerk session (requireUser()).',
          'Failures are treated as non-fatal and returned as { ok: false, error } (status may still be 200).' 
        ],
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'user'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
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
        rateLimitTier: 'admin'
      }
    ]
  }
];

const RATE_LIMITS: AdminApiRateLimit[] = [
  { tier: 'admin', limit: '100 requests / minute', notes: 'Bursting is automatically smoothed via sliding window.' },
  { tier: 'user', limit: '60 requests / minute', notes: 'Throttle resets rolling after 60 seconds of inactivity.' },
  { tier: 'public', limit: '30 requests / minute', notes: 'Public endpoints are limited to read-only operations.' }
];

const CHANGELOG = [
  {
    version: '2026.02',
    releasedAt: '2026-02-07T00:00:00.000Z',
    notes: [
      'Added internal server-to-server token spend endpoint (POST /api/internal/spend-tokens).',
      'Added user token spend endpoint for SaaSyApp (POST /api/user/spend-tokens).',
      'Dashboard: /dashboard now hosts SaaSyApp (real token spend); editor moved to /dashboard/editor.',
      'Expanded curated docs for token/account endpoints to reduce inventory drift.',
      'Hardened legacy admin upload endpoint (admin auth + rate limiting).',
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
        'Access is determined per endpoint: admin endpoints require a Clerk session with role "ADMIN"; user endpoints require an authenticated Clerk session; public endpoints are unauthenticated; internal endpoints require a server-to-server Bearer token.',
      notes: [
        'Dashboard requests automatically forward Clerk session cookies.',
        'Admin helpers utilise `requireAdminAuth`, which returns 401 when no session is present and 403 for non-admins.',
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
