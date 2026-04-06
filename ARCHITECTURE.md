# ARCHITECTURE.md — System Architecture

> High-level architecture of SaaSyBase showing how modules interconnect, data flows, and design decisions.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        NEXT.JS APP                          │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  Pages   │  │  API Routes  │  │  Webhook Endpoints  │    │
│  │ (app/)   │  │  (app/api/)  │  │ (app/api/webhooks/) │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
│       │               │                     │               │
│  ┌────┴───────────────┴─────────────────────┴────────┐      │
│  │              BUSINESS LOGIC LAYER (lib/)           │      │
│  │                                                    │      │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │      │
│  │  │ Auth        │  │ Payment      │  │ Tokens   │  │      │
│  │  │ Abstraction │  │ Abstraction  │  │ System   │  │      │
│  │  └──────┬──────┘  └──────┬───────┘  └────┬─────┘  │      │
│  │         │                │                │        │      │
│  │  ┌──────┴──────┐  ┌─────┴────────┐       │        │      │
│  │  │ Clerk │ NA  │  │ Stripe │ PS  │       │        │      │
│  │  │       │     │  │ Paddle │ RZ  │       │        │      │
│  │  └─────────────┘  └──────────────┘       │        │      │
│  │                                          │        │      │
│  │  ┌────────────────────────────────────────┘        │      │
│  │  │  Subscriptions · Plans · Coupons · Email        │      │
│  │  │  Organizations · Settings · Notifications       │      │
│  │  └────────────────────────────────────────────────┘│      │
│  └────────────────────────┬──────────────────────────┘      │
│                           │                                  │
│  ┌────────────────────────┴──────────────────────────┐      │
│  │                PRISMA ORM (lib/prisma)              │      │
│  └────────────────────────┬──────────────────────────┘      │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │    DATABASE     │
                   │  SQLite (dev)   │
                   │  PostgreSQL     │
                   │  (production)   │
                   └─────────────────┘
```

---

## Module Architecture

### 1. Authentication Layer

```
proxy.ts (Edge Middleware)
  │
  ├── lib/auth-provider/middleware.ts
  │     ├── Clerk middleware (if AUTH_PROVIDER=clerk)
  │     └── NextAuth middleware (if AUTH_PROVIDER=nextauth)
  │
  └── Route protection rules
        ├── /admin/* → requires AUTH
        ├── /api/admin/* → requires AUTH
  └── Public routes + dashboard pages → pass through

lib/auth-provider/
  ├── types.ts              # AuthProvider interface, AuthSession, AuthUser
  ├── registry.ts           # Maps env var to provider config
  ├── service.ts            # authService singleton (used everywhere)
  ├── middleware.ts          # Conditional middleware dispatch
  ├── providers/
  │     ├── clerk.ts         # Clerk implementation
  │     └── nextauth.ts      # NextAuth implementation
  └── client/
        ├── index.ts         # Client-side hook exports
        └── components.tsx   # AuthSignIn, AuthSignUp, AuthLoaded, etc.
```

**Data flow:** Request → Middleware (verify session) → Route handler → `authService.requireUserId()` → Business logic

Notes:
- `/dashboard/*` is protected primarily by server-side guards such as `requireAuth()` rather than edge middleware.
- Under `AUTH_PROVIDER=nextauth`, session resolution reads the DB-backed `Session` row and active-organization cookie via `lib/auth-provider/providers/nextauth.ts`.

### 1.1 Route Grouping And 404 Boundaries

```
app/
  admin/
    [...slug]/page.tsx        # invalid admin child paths → notFound()
    (valid)/
      layout.tsx              # admin shell + sidebar counts
      page.tsx                # /admin
      users/page.tsx          # /admin/users
      ...

  dashboard/
    [...slug]/page.tsx        # invalid dashboard child paths → notFound()
    (valid)/
      layout.tsx              # dashboard shell + workspace chrome
      page.tsx                # /dashboard
      profile/page.tsx        # /dashboard/profile
      ...
```

Why this exists:
- Valid admin/dashboard routes still share their respective layouts.
- Invalid child URLs such as `/admin/whatever` or `/dashboard/payment` bypass those layouts and resolve through the global `not-found` boundary.
- This avoids layout-level DB work for typo routes and returns a real 404 instead of rendering inside the admin/dashboard shell.

Supporting files:
- `app/not-found.tsx` — global not-found boundary
- `components/NotFoundPage.tsx` — shared 404 UI
- `lib/client-not-found.ts` — client-side helper so dashboard/admin client components can suppress background refresh behavior while on a 404 page

### 2. Payment Layer

```
lib/payment/
  ├── types.ts                      # PaymentProvider interface (40+ methods)
  ├── registry.ts                   # Provider configs with env checks
  ├── factory.ts                    # PaymentProviderFactory singleton
  ├── service.ts                    # PaymentService orchestration
  ├── webhook-router.ts             # Auto-detect provider from headers
  │
  ├── providers/
  │     ├── stripe.ts               # Stripe implementation
  │     ├── paystack.ts             # Paystack implementation
  │     ├── paddle.ts               # Paddle implementation
  │     ├── razorpay.ts             # Razorpay implementation
  │     └── lemonsqueezy.ts         # Archived (reference only)
  │
  ├── Subscription Lifecycle (15+ files)
  │     ├── subscription-checkout-*.ts
  │     ├── subscription-state-mutations.ts
  │     ├── subscription-cancel-handler.ts
  │     └── subscription-renewal-handler.ts
  │
  ├── Invoice Handling (6+ files)
  │     ├── invoice-payment-handler.ts
  │     ├── invoice-failure-handler.ts
  │     └── invoice-upcoming-handler.ts
  │
  ├── One-Time Payments (5+ files)
  │     ├── one-time-payment-handler.ts
  │     ├── one-time-topup-handler.ts
  │     └── one-time-plan-resolution.ts
  │
  └── Catalog & Admin (5+ files)
        ├── catalog-sync.ts
        ├── auto-create.ts
        └── admin-helpers.ts
```

**Checkout flow:**
```
User clicks "Subscribe"
  → POST /api/checkout (creates session via provider)
  → Redirect to provider checkout page
  → Provider processes payment
  → Webhook fires to /api/webhooks/payments
  → Webhook router auto-detects provider
  → Event normalized to standard format
  → Subscription created/updated in DB
  → User notified (email + in-app)
```

### 2.1 Email Delivery Layer

```
lib/email.ts
  ├── Provider selector
  │     ├── EMAIL_PROVIDER=nodemailer  → SMTP transport
  │     └── EMAIL_PROVIDER=resend      → Resend API client
  │
  ├── Template rendering
  │     └── lib/email-templates.ts
  │
  ├── Brand/theme helpers
  │     ├── site name / support email / logo
  │     └── accent colors from settings/theme palette
  │
  └── Delivery + persistence
        ├── send mail via provider
        └── persist EmailLog row in Prisma
```

Providers:
- `nodemailer` remains the default application email transport and uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`.
- `resend` is now a first-class alternative transport for transactional app email and requires `EMAIL_PROVIDER=resend` plus `RESEND_API_KEY`.
- `lib/env.ts` validates that `RESEND_API_KEY` is present when Resend is selected.

Important distinction:
- Application email (`lib/email.ts`) supports both Nodemailer and Resend.
- NextAuth email-auth / magic-link flow still uses `NodemailerProvider` in `lib/nextauth.config.ts`, so email-login remains SMTP-based even when transactional app email is configured to use Resend.

Delivery flow:
```
Business event
  → lib/email.ts:sendEmail()
  → optional template render (lib/email-templates.ts)
  → provider dispatch (Nodemailer SMTP or Resend API)
  → EmailLog persisted in Prisma
  → failures logged via Logger without crashing core business flow
```

### 3. Data Layer

```
prisma/
  ├── schema.prisma          # 25+ models
  ├── migrations/            # Migration history
  └── seed.ts                # Interactive seeding

Key Models:
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │     User     │───→│ Subscription │───→│     Plan     │
  │              │    │              │    │              │
  │ tokenBalance │    │ status       │    │ price        │
  │ freeTokenBal │    │ expiresAt    │    │ tokenLimit   │
  │ role         │    │ provider     │    │ scope        │
  └──────┬───────┘    └──────────────┘    └──────┬───────┘
         │                                        │
         │            ┌──────────────┐    ┌───────┴──────┐
         ├───────────→│   Payment    │    │  PlanPrice   │
         │            │              │    │              │
         │            │ amount       │    │ provider     │
         │            │ provider     │    │ currency     │
         │            │ status       │    │ amountCents  │
         │            └──────────────┘    └──────────────┘
         │
         │            ┌──────────────┐    ┌──────────────┐
         ├───────────→│ Organization │───→│  OrgMember   │
         │            │              │    │              │
         │            │ tokenBalance │    │ role         │
         │            │ seatLimit    │    │ tokenCap     │
         │            │ tokenPool    │    │ tokenUsage   │
         │            └──────────────┘    └──────────────┘
         │
         ├───────────→ SupportTicket ───→ TicketReply
         ├───────────→ Notification
         ├───────────→ CouponRedemption ───→ Coupon
         └───────────→ UserSetting
```

### 4. Admin Dashboard

```
app/admin/
  ├── [...slug]/page.tsx    # invalid child path → global notFound()
  └── (valid)/
      ├── layout.tsx        # Admin chrome, sidebar, counts, access guard
      ├── page.tsx          # Overview with stats
  │
  ├── Users & Access
  │     ├── users/          # User management (CRUD, role, tokens)
  │     ├── organizations/  # Org management
  │     └── moderation/     # Moderator permission config
  │
  ├── Finances
  │     ├── transactions/   # All payments
  │     ├── purchases/      # One-time sales
  │     ├── subscriptions/  # Active subscriptions
  │     └── coupons/        # Coupon management
  │
  ├── Platform
  │     ├── theme/          # Visual branding designer
  │     ├── pages/          # CMS for site pages
  │     ├── blog/           # Blog CMS
  │     ├── plans/          # Plan configuration
  │     ├── emails/         # Email template editor
  │     └── settings/       # Global settings
  │
  ├── Support & Analytics
  │     ├── support/        # Ticket management
  │     ├── notifications/  # System notifications
  │     ├── analytics/      # GA4 dashboard
  │     └── traffic/        # First-party visit tracking
  │
      └── Developer
            ├── api/        # Auto-generated API docs
            ├── logs/       # System logs viewer
            └── maintenance/# Cleanup/repair tools
```

External URLs are unchanged. The `(valid)` folder is a Next.js route group and does not appear in the URL.

### 5. User Dashboard

```
app/dashboard/
  ├── [...slug]/page.tsx    # invalid child path → global notFound()
  └── (valid)/
      ├── layout.tsx        # Dashboard chrome, notices, sidebar badges
      ├── page.tsx          # Main SaaS app area (SaaSyApp)
      ├── profile/          # User profile & settings
      ├── plan/             # Current plan details
      ├── billing/          # Billing management
      ├── transactions/     # Payment history
      ├── team/             # Team management (if team plan)
      ├── support/          # Support tickets
      ├── notifications/    # User notifications
      ├── coupons/          # Redeemed coupons
  ├── account/          # Legacy redirect to profile
      ├── settings/         # User preferences
      └── onboarding/       # Guided setup wizard
```

As with admin, `(valid)` is a route group only. URLs remain `/dashboard/...`.

Session activity and device/security controls are surfaced inside the unified profile experience rather than a standalone `/dashboard/activity` route.

---

## Request Flow

### Authenticated Page Request

```
Browser → Edge Middleware (proxy.ts)
  → Auth check (Clerk/NextAuth)
  → Server Component renders
    → authService.getSession()
    → Prisma queries (parallel via Promise.all)
    → HTML streamed to client
  → Client hydrates with React
```

### Invalid Admin/Dashboard Child Request

```
Browser → /admin/unknown or /dashboard/unknown
  → top-level catch-all route (`[...slug]`)
  → `notFound()`
  → global not-found boundary (`app/not-found.tsx`)
  → shared 404 UI (`components/NotFoundPage.tsx`)
```

This path intentionally avoids the heavy admin/dashboard `(valid)` layouts.

### API Request

```
Client → POST /api/endpoint
  → Rate limiting check
  → Auth verification
  → Zod input validation
  → Business logic (lib/)
  → Prisma DB operations
  → JSON response
  → Error handler (catch block)
```

### Webhook Request

```
Provider → POST /api/webhooks/payments
  → Header-based provider detection
  → Signature verification
  → Event normalization (to standard format)
  → Business logic handler
    → Subscription state update
    → Token adjustment
    → Email notification
    → In-app notification
  → 200 OK response
```

---

## Security Architecture

```
┌─ Edge Layer ──────────────────────┐
│  • Auth middleware (proxy.ts)      │
│  • Route protection               │
│  • HTTP security headers          │
│    (CSP, HSTS, X-Frame-Options)   │
└───────────────────────────────────┘
         │
┌─ Application Layer ──────────────┐
│  • Rate limiting (DB-backed)      │
│  • Input validation (Zod)         │
│  • Error sanitization (prod)      │
│  • Logger auto-redaction          │
│  • Webhook signature verification │
│  • Password policy enforcement    │
└───────────────────────────────────┘
         │
┌─ Data Layer ─────────────────────┐
│  • Encryption at rest             │
│    (ENCRYPTION_SECRET)            │
│  • Token versioning (sessions)    │
│  • Admin action audit trail       │
│  • Role-based access control      │
│  • Internal API token auth        │
└───────────────────────────────────┘
```

---

## Token System Architecture

```
┌─────────────────────────────────────────┐
│           TOKEN BUCKETS                  │
│                                          │
│  User.tokenBalance (paid)                │
│  User.freeTokenBalance (free)            │
│  Organization.tokenBalance (shared)      │
│                                          │
│  Spending Order (bucket=auto):           │
│  paid → shared → free                    │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │ POST /api/internal/     │
    │      spend-tokens       │
    │                         │
    │ Auth: INTERNAL_API_TOKEN│
    │ Atomic per bucket       │
    │ Returns 409 if          │
    │ insufficient            │
    └─────────────────────────┘

Token Sources:
  • Plan purchase → paid tokens credited
  • Free plan → free tokens (monthly reset)
  • Team plan → shared pool allocated
  • Admin action → manual adjustment
  • Top-up purchase → paid tokens added

Token Sinks:
  • Feature usage → spend-tokens API
  • Plan expiry → optional reset (configurable)
  • Org dismantling → shared pool cleared
```

---

## Organization/Team Architecture

```
User purchases Team Plan
         │
         ▼
ensureTeamOrganization()
  ├── Creates Organization (or updates existing)
  ├── Sets token pool strategy
  ├── Assigns seat limit from plan
  ├── Syncs to Clerk (if using Clerk)
  └── Owner auto-added as member
         │
         ▼
Team Management (/dashboard/team)
  ├── Invite members (email token-based)
  │     └── /invite/[token] acceptance page
  ├── Remove members
  ├── Configure token caps
  └── View team usage
         │
         ▼
Subscription Lifecycle Events
  ├── Renewal → org maintained, tokens refreshed
  ├── Cancellation → org marked for dismantling
  ├── Expiry → syncOrganizationEligibilityForUser()
  │     ├── Revoke member access
  │     ├── Clear token pool
  │     └── Delete org (or deactivate)
  └── Upgrade/Downgrade → seat limit adjusted
```

---

## File Organization Philosophy

| Directory | Responsibility | Example |
|-----------|---------------|---------|
| `app/` | HTTP layer — routing, request handling, page rendering | `app/api/checkout/route.ts` |
| `lib/` | Business logic — auth, payments, tokens, email, subscriptions | `lib/subscriptions.ts` |
| `components/` | UI — React components, layouts, forms | `components/ui/Modal.tsx` |
| `hooks/` | Client-side state — React hooks | `hooks/useVisitTracking.ts` |
| `types/` | Type definitions | `types/` |
| `utils/` | Pure utilities — formatting, conversion | `utils/formatDisplayDate.ts` |
| `prisma/` | Data layer — schema, migrations, seeds | `prisma/schema.prisma` |
| `tests/` | Quality assurance — unit and E2E tests | `tests/stripe-webhook.test.ts` |
| `scripts/` | Operations — backfill, admin, maintenance | `scripts/validate-env.js` |
| `docs/` | Internal documentation | `docs/token-usage-and-deduction.md` |
| `ops/` | Production ops — indexes, runbooks | `ops/PROD_INDEXES.sql` |

**Key principle:** Business logic lives in `lib/`, never in `app/` route handlers. Route handlers are thin — they do auth, validation, call into `lib/`, and return responses.
