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
        ├── /dashboard/* → requires AUTH
        └── Public routes → pass through

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
  ├── page.tsx              # Overview with stats
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
        ├── api/            # Auto-generated API docs
        ├── logs/           # System logs viewer
        └── maintenance/    # Cleanup/repair tools
```

### 5. User Dashboard

```
app/dashboard/
  ├── page.tsx              # Main SaaS app area (SaaSyApp)
  ├── profile/              # User profile & settings
  ├── plan/                 # Current plan details
  ├── billing/              # Billing management
  ├── transactions/         # Payment history
  ├── team/                 # Team management (if team plan)
  ├── support/              # Support tickets
  ├── notifications/        # User notifications
  ├── coupons/              # Redeemed coupons
  ├── activity/             # Activity log
  ├── settings/             # User preferences
  └── onboarding/           # Guided setup wizard
```

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
