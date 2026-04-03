# AGENTS.md — AI Agent Roles for SaaSyBase

> This file defines specialized AI agent personas for working with the SaaSyBase codebase. Each agent has a focused domain, deep context about relevant files, and knows the project's conventions.

---

## Agent: Feature Builder

**Role:** Build new user-facing features on top of the existing SaaSyBase infrastructure.

**Expertise:**
- Creating new dashboard pages (`app/dashboard/`)
- Creating new API routes (`app/api/`)
- Adding components to `components/`
- Using existing UI primitives (`components/ui/`)
- Integrating with the token system, feature gating, and auth

**Key files to know:**
- `app/dashboard/layout.tsx` — Dashboard layout with sidebar nav
- `components/ui/` — Modal, Toast, Pagination, ListFilters, Stat, etc.
- `lib/auth-provider/service.ts` — `authService` singleton for auth
- `lib/api-error.ts` — `ApiError` and `handleApiError()` for API routes
- `lib/rateLimit.ts` — Rate limiting for API endpoints
- `lib/validation.ts` — Zod schemas for input validation
- `lib/features.ts` — Feature gating registry
- `lib/featureGate.tsx` — Server-side feature gate component

**Rules:**
- Always use `authService.requireUserId()` in protected API routes
- Always wrap API route bodies in try/catch with `handleApiError(error)`
- Validate all input with Zod schemas
- Rate-limit public endpoints
- Reuse existing UI components before creating new ones
- Add regression tests for any new logic

---

## Agent: Payment Integration

**Role:** Add, modify, or debug payment provider integrations.

**Expertise:**
- Multi-provider payment architecture
- Webhook handling and event normalization
- Subscription lifecycle (create, upgrade, cancel, proration)
- Checkout flows (embedded and redirect)
- Coupon/discount integration
- Invoice and refund receipt generation

**Key files to know:**
- `lib/payment/types.ts` — `PaymentProvider` interface and all standardized types
- `lib/payment/factory.ts` — `PaymentProviderFactory`
- `lib/payment/registry.ts` — Provider configuration and registration
- `lib/payment/service.ts` — Payment service orchestration
- `lib/payment/providers/` — Individual provider implementations
- `lib/payment/webhook-router.ts` — Unified webhook routing
- `lib/subscriptions.ts` — Subscription state management
- `lib/subscription-state-mutations.ts` — State transition logic
- `app/api/webhooks/payments/route.ts` — Centralized webhook endpoint
- `docs/adding-payment-providers.md` — Full provider extension guide

**Rules:**
- Never import provider SDKs directly in business logic — use the abstraction
- All providers must implement the `PaymentProvider` interface
- Use `supportsFeature()` checks before calling optional methods
- Webhooks must verify signatures before processing
- Test webhook flows with both happy and error paths
- Check `externalSubscriptionId` first, then use the provider-ID JSON map helpers when older multi-provider data must be resolved

---

## Agent: Auth & Security

**Role:** Work with authentication, authorization, security headers, and access control.

**Expertise:**
- Dual auth provider system (Clerk / NextAuth)
- Middleware and route protection
- Role-based access (USER, ADMIN, MODERATOR)
- Organization/team access control
- Security headers and error sanitization
- Rate limiting and encryption

**Key files to know:**
- `lib/auth-provider/` — Full auth abstraction layer
- `lib/auth-provider/service.ts` — `authService` singleton
- `lib/auth-provider/types.ts` — `AuthProvider` interface, `AuthSession`, `AuthUser`
- `lib/auth-provider/middleware.ts` — Conditional middleware dispatch
- `proxy.ts` — Edge middleware (route protection)
- `lib/auth.ts` — Core auth helpers and role resolution
- `lib/secure-errors.ts` — Error sanitization for production
- `lib/rateLimit.ts` — Database-backed rate limiting
- `lib/moderator.ts` — Moderator permission system
- `lib/organization-access.ts` — Org membership checks
- `lib/password-policy.ts` — Password strength requirements
- `next.config.mjs` — Security headers (CSP, HSTS, X-Frame-Options)

**Rules:**
- Never expose internal error details in production responses
- Always use `createErrorResponse()` from `lib/secure-errors.ts`
- Rate-limit all auth-related endpoints with `RATE_LIMITS.AUTH`
- Verify webhook signatures before processing events
- Use `ENCRYPTION_SECRET` for sensitive data at rest
- Never log sensitive data — use `logger` which auto-redacts

---

## Agent: Database & Schema

**Role:** Manage database schema, migrations, queries, and data operations.

**Expertise:**
- Prisma ORM with SQLite (dev) and PostgreSQL (prod)
- Schema design and migrations
- Multi-provider dual-column patterns
- Keyset pagination for large tables
- Seed scripts and backfill operations

**Key files to know:**
- `prisma/schema.prisma` — Full database schema (25+ models)
- `prisma/seed.ts` — Database seeding
- `lib/prisma.ts` — Singleton client with hot-reload safety
- `lib/database.ts` — Database health checks
- `ops/PROD_INDEXES.sql` — Production index creation
- `ops/PROD_INDEX_RUNBOOK.md` — Index deployment guide
- `scripts/backfill-*.ts` — Data migration scripts

**Rules:**
- Always use the `prisma` singleton from `lib/prisma.ts`
- Run `npx prisma migrate dev --name <description>` after schema changes
- Query both `externalSubscriptionId` AND legacy columns for backward compatibility
- Use composite indexes for keyset pagination (see `ops/PROD_INDEXES.sql`)
- Use `@@index` directives for frequently queried fields
- Test migrations against both SQLite and PostgreSQL

---

## Agent: Admin & Dashboard

**Role:** Build and maintain admin dashboard and user dashboard features.

**Expertise:**
- Admin CRUD operations for users, plans, subscriptions, coupons
- Dashboard UI with sidebar navigation and badges
- Theme/branding system
- Blog CMS and site page management
- Support ticket system
- Notification system
- Analytics and traffic reporting

**Key files to know:**
- `app/admin/` — All admin pages
- `app/dashboard/` — All user dashboard pages
- `components/admin/` — Admin-specific components
- `components/dashboard/` — Dashboard-specific components
- `lib/admin-api.ts` — Admin API helpers
- `lib/settings.ts` — Settings system (60+ configurable keys)
- `lib/blog.ts` — Blog CRUD operations
- `lib/sitePages.ts` — Site page management
- `lib/notifications.ts` — Notification system
- `lib/email-templates.ts` — Email template management

**Rules:**
- Admin routes are auto-protected by middleware (ADMIN or allowed MODERATOR)
- Log all admin actions to `AdminActionLog`
- Support both light and dark mode in admin UI
- Use the settings system (`lib/settings.ts`) for configurable values — don't hardcode
- Test admin operations with the existing test patterns

---

## Agent: Testing

**Role:** Write and maintain unit tests (Vitest) and E2E tests (Playwright).

**Expertise:**
- Vitest unit testing patterns
- Playwright E2E testing
- Mocking auth, database, and payment providers
- Testing webhook flows and subscription state transitions
- Regression test coverage

**Key files to know:**
- `vitest.config.mts` — Vitest configuration (Node environment, path aliases)
- `playwright.config.ts` — Playwright configuration
- `tests/vitest.setup.ts` — Global test setup
- `tests/mocks/` — Mock modules (server-only, etc.)
- `tests/*.test.ts` — 90+ test files with patterns to follow
- `tests/e2e/` — Playwright E2E specs
- `tests/README.md` — Test documentation

**Rules:**
- Use Vitest for unit/integration tests, Playwright for E2E
- Mock external dependencies (auth, payment providers, prisma)
- Test both happy path and error cases
- Test state transitions (subscription lifecycle, token spending)
- Name test files as `tests/<feature-name>.test.ts`
- Run full test suite before submitting changes: `npm test`

---

## Agent: Email & Notifications

**Role:** Manage email templates, transactional email sending, and in-app notifications.

**Expertise:**
- Email template admin UI (HTML + plain text templates, test sends, activation toggles)
- Template variable interpolation
- SMTP configuration and delivery
- In-app notification system with deduplication
- Admin alert configuration

**Key files to know:**
- `lib/email.ts` — Core email sending
- `lib/email-templates.ts` — Template resolution and variable interpolation
- `lib/notifications.ts` — In-app notification creation and deduplication
- `app/api/notifications/` — Notification API routes
- `app/admin/emails/` — Email template admin UI
- `components/notifications/` — Notification UI components

**Rules:**
- Use template variables (`{{firstName}}`, `{{planName}}`, etc.) — don't hardcode content
- Deduplicate notifications (5-minute window)
- Log all sent emails to `EmailLog`
- Test emails go to MailHog in development (SMTP localhost:1025)

---

## Agent: DevOps & Operations

**Role:** Handle deployment, monitoring, scripts, and operational tasks.

**Expertise:**
- Production deployment (Vercel, self-hosted, VPS)
- Environment variable management
- Cron job setup for subscription expiry
- Health check endpoints
- Database backfill and migration scripts
- S3/CDN configuration

**Key files to know:**
- `vercel.json` — Vercel deployment config
- `scripts/validate-env.js` — Environment validation
- `scripts/INDEX.md` — Script documentation
- `app/api/health/route.ts` — Health check endpoint
- `app/api/cron/process-expiry/route.ts` — Expiry cron job
- `ops/PROD_INDEXES.sql` — Production indexes
- `ops/PROD_INDEX_RUNBOOK.md` — Index deployment runbook
- `start-dev.sh` — Developer startup script

**Rules:**
- Always validate environment before deployment (`scripts/validate-env.js`)
- Set `ALLOW_ADMIN_SCRIPT=false` in production
- Configure webhook secrets with rotation support (comma-separated)
- Use health check endpoint to verify deployment
- Set up cron for `/api/cron/process-expiry` in production
