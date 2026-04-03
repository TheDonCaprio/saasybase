# SaaSyBase

A production-ready SaaS boilerplate built with **Next.js 16 App Router**, a **dual auth provider system** (Clerk or NextAuth), a **multi-payment provider architecture** (Stripe, Paystack, Paddle, Razorpay), **Prisma 7** with SQLite (dev) / PostgreSQL (prod), and a full-featured admin dashboard.

## What Is SaaSyBase?

SaaSyBase is a **complete SaaS foundation** — not a starter template. It gives you everything a real SaaS product needs out of the box: authentication, subscription billing with four payment providers, a token/credit system, team/organization support, an admin dashboard, email templates, a blog CMS, support tickets, and more.

**Who is it for?**

- **Professional developers** who want a battle-tested architecture to build on, with clean abstractions, 90+ unit tests, and production-hardened patterns.
- **Vibecoders and AI-assisted builders** (Cursor, Lovable, Windsurf, etc.) who want a working SaaS backend they can scaffold their app into without building billing, auth, and admin from scratch.

You plug in your own product logic — SaaSyBase handles the business infrastructure.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Quick Start](#quick-start)
4. [Authentication](#authentication)
5. [Admin Setup](#admin-setup)
6. [Payment Providers](#payment-providers)
   - [Stripe](#stripe)
   - [Paystack](#paystack)
   - [Paddle](#paddle)
   - [Razorpay](#razorpay)
   - [Provider Feature Matrix](#provider-feature-matrix)
   - [Currency System](#currency-system)
   - [Adding New Providers](#adding-new-providers)
7. [Token System](#token-system)
8. [Team Plans & Organizations](#team-plans--organizations)
9. [Feature Gating](#feature-gating)
10. [Coupon System](#coupon-system)
11. [Blog & CMS](#blog--cms)
12. [Site Pages](#site-pages)
13. [Theming & Branding](#theming--branding)
14. [Email Templates](#email-templates)
15. [Notifications](#notifications)
16. [Support Tickets](#support-tickets)
17. [Contact Page](#contact-page)
18. [Invoice & Refund Receipts](#invoice--refund-receipts)
19. [Webhooks](#webhooks)
20. [Cron Jobs & Expiry Automation](#cron-jobs--expiry-automation)
21. [File & Logo Storage (S3)](#file--logo-storage-s3)
22. [Analytics (Google Analytics 4)](#analytics-google-analytics-4)
23. [Visit Tracking](#visit-tracking)
24. [Maintenance Mode](#maintenance-mode)
25. [Session Activity](#session-activity)
26. [Moderator Roles](#moderator-roles)
27. [Rate Limiting](#rate-limiting)
28. [Logging & Audit Trail](#logging--audit-trail)
29. [Security](#security)
30. [Dark Mode](#dark-mode)
31. [Testing](#testing)
32. [Admin Dashboard Overview](#admin-dashboard-overview)
33. [User Dashboard Overview](#user-dashboard-overview)
34. [Production Setup](#production-setup)
35. [Self-hosted Deployments](#self-hosted-deployments)
36. [Environment Variable Reference](#environment-variable-reference)
37. [Demo Read-Only Mode](#demo-read-only-mode)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | **Clerk** or **NextAuth (Auth.js v5)** — switchable via `AUTH_PROVIDER` |
| Payment | **Stripe**, **Paystack**, **Paddle**, **Razorpay** — switchable via `PAYMENT_PROVIDER` |
| Database | Prisma 7 ORM · SQLite (dev) · PostgreSQL (prod) |
| Styling | Tailwind CSS |
| Rich Text Editor | TipTap (blog posts and editable site pages) |
| Email | Nodemailer (SMTP) or Resend, switchable via `EMAIL_PROVIDER` |
| Analytics | Google Analytics 4 (via Data API) + built-in visit tracking |
| PDF Generation | pdf-lib (invoices, refund receipts) |
| Validation | Zod |
| Testing | Vitest (unit) · Playwright (E2E) |
| Monitoring | `/api/health` endpoint |

---

## Project Structure

A quick map of where things live — useful whether you're browsing the code yourself or pointing an AI agent at it.

```
saasybase/
├── app/                    # Next.js App Router pages and API routes
│   ├── admin/              # Admin dashboard pages (users, plans, blog, etc.)
│   ├── api/                # API routes (webhooks, checkout, internal, etc.)
│   ├── dashboard/          # User dashboard pages (billing, team, profile, etc.)
│   ├── blog/               # Public blog routes
│   ├── pricing/            # Public pricing page
│   ├── contact/            # Public contact page
│   ├── sign-in/ & sign-up/ # Auth pages
│   └── layout.tsx          # Root layout (theme injection, auth provider)
├── components/             # React components
│   ├── ui/                 # Reusable primitives (Modal, Toast, Pagination, etc.)
│   ├── admin/              # Admin-specific components
│   ├── dashboard/          # Dashboard-specific components
│   ├── billing/            # Checkout & billing components
│   ├── blog/               # Blog display components
│   └── team/               # Team/org management components
├── lib/                    # Core business logic
│   ├── auth-provider/      # Auth abstraction layer (Clerk / NextAuth)
│   ├── payment/            # Payment abstraction layer (Stripe / Paystack / Paddle / Razorpay)
│   │   ├── providers/      # Individual provider implementations
│   │   ├── types.ts        # PaymentProvider interface
│   │   ├── service.ts      # Payment service orchestration
│   │   └── webhook-router.ts # Unified webhook routing
│   ├── email.ts            # Email sending (Nodemailer / Resend)
│   ├── email-templates.ts  # 27 built-in email templates
│   ├── settings.ts         # Admin settings system (60+ keys)
│   ├── features.ts         # Feature gating registry
│   └── ...                 # Tokens, teams, coupons, notifications, etc.
├── prisma/
│   ├── schema.prisma       # Database schema (25+ models)
│   └── seed.ts             # Database seeding script
├── scripts/                # Operational scripts (backfills, admin tools)
├── tests/                  # 90+ Vitest unit tests + Playwright E2E
├── docs/                   # Internal documentation
├── ops/                    # Production operations (indexes, runbooks)
└── .env.example            # Full environment variable template
```

> **Tip for vibecoders:** Most of your custom app code will go in `app/dashboard/` (user-facing pages), `components/` (UI), and `lib/` (business logic). The payment, auth, and admin infrastructure is already built — you're extending it, not rebuilding it.

## Quick Start

> **Requires:** Node.js 18+ and npm.

```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Run database migrations
npx prisma migrate dev --name init

# 4. Seed the database (prompts for admin email/password)
npx prisma db seed

# 5. Start dev server
npm run dev
```

After running `npm run dev`, open [http://localhost:3000](http://localhost:3000). You'll see the landing page. Sign in at `/sign-in` or go to `/admin` once you've set up an admin user (see [Admin Setup](#admin-setup)).

With Prisma 7, seeding only runs when you explicitly invoke `npx prisma db seed`; `prisma generate`, `prisma migrate dev`, and `prisma migrate reset` no longer trigger it automatically. When you run `npx prisma db seed` in an interactive terminal, the seed script prompts for the initial admin email and password instead of always using a hardcoded default. To skip admin creation explicitly, run `npx prisma db seed -- --skip-admin`. For CI or other non-interactive environments, set `SEED_ADMIN_PASSWORD` and optionally `SEED_ADMIN_EMAIL` to create the admin without a prompt.

> **Database note:** The default `DATABASE_URL=file:./dev.db` keeps everything local. For deployments on read-only filesystems (Vercel, Netlify previews), point `DATABASE_URL` at a hosted PostgreSQL instance.

### Alternative dev scripts

| Script | Description |
|---|---|
| `npm run dev` | Standard dev server (webpack) |
| `npm run dev:turbo` | Dev server with Turbopack (faster cold starts) |
| `npm run dev:full` | Dev server + Stripe CLI listener in parallel |

> **Env validation:** A `validate-env.js` script runs automatically before `dev` and `build` via npm predev/prebuild hooks. It checks for required variables and logs warnings for missing optional ones.

---

## Authentication

The app ships with **two fully implemented auth providers**. Switch between them using the `AUTH_PROVIDER` environment variable.

```bash
# .env.local
AUTH_PROVIDER="nextauth"  # Options: "clerk", "nextauth"
```

> **Default behavior:** The `.env.example` template ships with `AUTH_PROVIDER="nextauth"` so you can start locally without any third-party accounts. The code's internal fallback is `clerk` if the variable is unset, but since `.env.example` explicitly sets it, most new setups use NextAuth by default.

`next.config.mjs` automatically exposes this as `NEXT_PUBLIC_AUTH_PROVIDER` to the client bundle so that the auth abstraction layer (`lib/auth-provider`) can DCE (dead-code eliminate) the unused provider at build time.

The abstraction layer (`lib/auth-provider/`) defines a full `AuthProvider` interface with feature detection, mirroring the payment provider pattern. Every method (session, user management, organizations, webhooks, middleware) is provider-agnostic — the rest of the codebase never imports vendor-specific modules directly.

### Clerk

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
CLERK_WEBHOOK_SECRET=""   # Required for webhook-driven user init and welcome emails
```

- UI components (`<AuthSignIn>`, `<AuthSignUp>`, `<AuthLoaded>`, `<AuthLoading>`, etc.) are re-exported from `lib/auth-provider/client/components` and switch automatically.
- Clerk's `ClerkProvider` wraps the app in `components/AppAuthProvider.tsx` with automatic dark mode theming via a `MutationObserver` on the `<html>` class.
- Organization primitives are powered by Clerk and synced to the local DB via webhooks.

### NextAuth (Auth.js v5)

```bash
AUTH_SECRET=""          # Generate with: npx auth secret
# Optional OAuth providers:
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

NextAuth supports **credentials** (email + password), **GitHub OAuth**, **Google OAuth**, and **passwordless email magic links** out of the box — enable the ones you need in `lib/nextauth.config.ts`. Transactional app email can use either Nodemailer or Resend via `EMAIL_PROVIDER`; the NextAuth email-login flow itself is SMTP-based.

#### GitHub OAuth setup

1. Go to GitHub Developer Settings → OAuth Apps.
2. Create a new OAuth App.
3. Set the Homepage URL to your app base URL.
4. Set the Authorization callback URL to:
  - Local: `http://localhost:3000/api/auth/callback/github`
  - Production: `https://your-domain.com/api/auth/callback/github`
5. Copy the generated Client ID and Client Secret into:

```bash
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
```

#### Google OAuth setup

1. Open Google Cloud Console → APIs & Services.
2. Configure the OAuth consent screen for your app.
3. Create credentials → OAuth client ID → Web application.
4. Add Authorized redirect URIs:
  - Local: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://your-domain.com/api/auth/callback/google`
5. Add Authorized JavaScript origins:
  - Local: `http://localhost:3000`
  - Production: `https://your-domain.com`
6. Copy the generated Client ID and Client Secret into:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

#### NextAuth OAuth configuration notes

- Keep `AUTH_PROVIDER="nextauth"`.
- Keep `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` aligned with the exact base URL you registered with GitHub and Google.
- GitHub and Google are only registered when both env vars for that provider are present.
- The sign-in and sign-up UI only shows the GitHub and Google buttons when NextAuth reports those providers as configured.
- Leaving the GitHub or Google env vars blank disables that provider cleanly without breaking credentials or magic-link auth.

Key differences from Clerk:
- Users are stored entirely in your own DB (Prisma adapter).
- No built-in organization primitives (teams are managed by the app layer).
- Email verification uses an in-app pending-change flow (`lib/nextauth-email-verification.ts`).

---

## Admin Setup

### Development (automatic)

1. Set `DEV_ADMIN_ID` in `.env.local` to your auth provider user ID.
2. Delete your user from the DB (if already created) via `npx prisma studio`.
3. Sign in again — you are automatically created with `role = ADMIN`.

> ⚠️ This is disabled in production (`NODE_ENV === 'production'`). Never rely on it outside local dev.

### Production

**Option 1 — Direct SQL (most secure)**
```sql
UPDATE "User" SET role = 'ADMIN' WHERE id = 'user_xxxxxxxxxxxxx';
```

**Option 2 — Admin promotion script**
```bash
# Requires ALLOW_ADMIN_SCRIPT=true in env
node scripts/make-admin.js user_xxxxxxxxxxxxx
```

> 💡 Find your Clerk user ID in the Clerk dashboard, or your DB user ID via `npx prisma studio`.

---

## Payment Providers

Select the active provider:

```bash
PAYMENT_PROVIDER="stripe"   # Options: "stripe", "paystack", "paddle", "razorpay"
```

All providers share a common checkout → webhook → subscription lifecycle. The app routes new transactions to the active provider; existing transactions are handled by the provider recorded in their `paymentProvider` field.

> **Note:** A Lemon Squeezy provider implementation exists in `lib/payment/providers/lemonsqueezy.ts` but is **archived** and not wired into the active provider registry. It is kept for reference only.

### Plan Price IDs

Plans reference provider price IDs via environment variables:

- **One-time plans:** `PAYMENT_PRICE_<key>` (e.g. `PAYMENT_PRICE_24H`, `PAYMENT_PRICE_1M`)
- **Recurring/subscription plans:** `SUBSCRIPTION_PRICE_<key>` (e.g. `SUBSCRIPTION_PRICE_1M`, `SUBSCRIPTION_PRICE_1Y`)
- **Legacy fallback:** `PRICE_*` keys still work but will log a warning — rename them when you can.

### Multi-Currency Pricing

Plans support **per-provider localized pricing** via the `PlanPrice` model. This allows different prices in different currencies for each payment provider:

```
PlanPrice {
  planId, provider, currency, amountCents, externalPriceId
}
```

For example, a plan can have a $10 USD price on Stripe and a ₦15,000 NGN price on Paystack simultaneously.

### Auto-creating Provider Price IDs

```bash
PAYMENT_AUTO_CREATE="true"
```

When enabled, saving a plan without a provider price ID will auto-create catalog objects for configured payment providers where supported.

### Plan Recurring Interval

Admin plans support `recurringInterval` (`day`, `week`, `month`, `year`) and `recurringIntervalCount` (cadence multiplier, e.g. `month` + `2` = billed every 2 months) when `autoRenew` is enabled.

> **Razorpay constraint:** Daily subscriptions require `recurringIntervalCount >= 7`. A warning is logged and Razorpay price creation is skipped for shorter intervals while other providers continue to work.

---

### Stripe

```bash
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."       # Supports comma-separated for rotation
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
```

**Webhook endpoint:** `/api/webhooks/payments` (centralized, preferred) or `/api/stripe/webhook`

**Local testing:**
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
Copy the printed secret into `STRIPE_WEBHOOK_SECRET`.

**Stripe Customer Portal:** Enable it in Stripe Dashboard → Settings → Billing → Customer Portal. Without this the "Manage payment" button returns an error.

**Recommended webhook events:**
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.upcoming` *(renewal reminder emails)*
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded` *(optional)*
- `charge.dispute.created` / `charge.dispute.updated` / `charge.dispute.closed` *(optional)*

The app normalizes `checkout.session.async_payment_succeeded` to `checkout.completed` and `payment_intent.succeeded` (when attached to an invoice) to `invoice.payment_succeeded` so async and non-invoice flows are handled consistently.

---

### Paystack

```bash
PAYSTACK_SECRET_KEY="sk_live_..."
PAYSTACK_WEBHOOK_SECRET=""              # Optional — falls back to PAYSTACK_SECRET_KEY
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY="pk_live_..."
```

**Webhook endpoint:** `/api/webhooks/payments` (centralized ingress, preferred) or `/api/webhooks/paystack`

**Pricing model:** Paystack uses `plan_code` as the price ID. One-time payments pass the raw amount; subscriptions pass the `plan_code` to `/transaction/initialize`.

**Default currency:** NGN. Supported currencies: `NGN`, `GHS`, `ZAR`, `KES`, `USD` (USD requires merchant approval; set `PAYSTACK_CURRENCY=USD` to use it as default).

**Cancel at period end (workaround):** Paystack has no native cancel-at-period-end. The app implements a workaround:
1. Sets `cancelAtPeriodEnd = true` in the DB on cancel.
2. On `invoice.created`, cancels in Paystack before the charge fires if the flag is set.

**Recommended webhook events:**
- `charge.success` *(required)*
- `subscription.create`
- `subscription.not_renew` *(cancel-at-period-end signal)*
- `subscription.disable`
- `invoice.create` *(cancel-at-period-end workaround)*
- `invoice.update`
- `invoice.payment_failed`
- `refund.processed`

> `refund.pending` is intentionally a no-op to avoid premature refund marking.

---

### Paddle

```bash
PADDLE_API_KEY="pat_live_..."
PADDLE_WEBHOOK_SECRET="..."             # Notification destination secret; supports comma-separated rotation
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN="..."   # Paddle.js client token
PADDLE_DEFAULT_TAX_CATEGORY="standard" # Required for auto-creation of products/prices
# Sandbox / live selection:
PADDLE_ENV="sandbox"
NEXT_PUBLIC_PADDLE_ENV="sandbox"
```

**Webhook endpoint:** `/api/webhooks/payments` (preferred) or `/api/webhooks/paddle`

**Default Payment Link (required):**

Paddle requires a **Default payment link** to generate `transaction.checkout.url`. The app provides a ready-made page at `/paddle/pay`.

1. In Paddle Dashboard → Checkout → Settings, set **Default payment link** to:
   `https://YOUR_DOMAIN/paddle/pay`
2. The domain must be an **approved website** in Paddle (Paddle → Checkout → Website approval).
3. For local development, use an HTTPS tunnel (e.g. ngrok) and register your ngrok URL.

This is a **redirect-only** integration. Treat **webhooks as the source of truth** for granting access.

**Admin config check:** If you see a generic Paddle overlay error, call `GET /api/admin/billing/paddle-config` to detect missing Default payment link, missing prices, or invalid credentials.

**Recommended webhook events:**
- `transaction.completed` *(required)*
- `subscription.created`
- `subscription.updated`
- `transaction.payment_failed` *(optional)*
- `adjustment.created` *(refunds, auto-approved)*
- `adjustment.updated` *(refunds requiring approval)*

---

### Razorpay

```bash
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
NEXT_PUBLIC_RAZORPAY_KEY_ID=""
RAZORPAY_CURRENCY="USD"                 # Optional; affects catalog sync and redirect checkouts (default: INR)
RAZORPAY_ENABLE_OFFERS="true"           # Optional; attach offer_id to one-time Payment Links
```

**Webhook endpoint:** `/api/webhooks/payments` (centralized ingress)

Checkouts are **redirect-based**:
- One-time: Payment Links (`/v1/payment_links`) → `short_url`
- Subscriptions: Subscriptions API (`/v1/subscriptions`) → `short_url`

**Manage payment:** Uses the subscription's hosted `short_url` as a best-effort management page. No Stripe-style customer portal exists.

**Recommended webhook events:**
- `payment_link.paid` *(required)*
- `payment.captured`
- `payment.failed`
- `refund.processed`
- `payment.refunded`
- `subscription.activated` *(if using Subscriptions)*
- `subscription.updated`
- `subscription.cancelled`
- `subscription.halted`

**Optional: Razorpay Offers ↔ app coupons (one-time only)**

Set `RAZORPAY_ENABLE_OFFERS=true` and embed an offer ID in the coupon's `description` field:
```
razorpayOfferId=offer_ABC123
```
If Razorpay rejects the `offer_id`, the server retries without it.

---

### Provider Feature Matrix

| Feature | Stripe | Paystack | Paddle | Razorpay |
|---|---|---|---|---|
| Coupons | ✅ Provider | ✅ In-app only | ✅ Provider | ✅ In-app only (offers opt-in) |
| Proration | ✅ | ❌ | ✅ | ✅ |
| Subscription updates | ✅ | ❌ (cancel + recreate) | ✅ | ✅ |
| Cancel at period end | ✅ | ✅ (workaround) | ✅ | ✅ |
| Customer portal | ✅ | Subscriptions only | ✅ | Subscriptions only |
| Invoices / Receipts | ✅ | ❌ | ❌ | ❌ |
| PDF Invoices (in-app) | ✅ | ✅ | ✅ | ✅ |
| Refunds | ✅ | ✅ | ✅ | ✅ |
| Disputes | ✅ | ❌ | ❌ | ❌ |
| Inline elements | ✅ | ✅ | ❌ | ❌ |
| Trial periods | ✅ | ❌ | ❌ | ❌ |
| Default currency | USD | NGN | USD | INR |

> **PDF invoices/receipts** are generated in-app via `pdf-lib` for all providers, regardless of native invoicing support. See [Invoice & Refund Receipts](#invoice--refund-receipts).

### Currency System

The app resolves the active currency in this order:

| Priority | Variable | Scope |
|---|---|---|
| 1 | Provider-specific: `PADDLE_CURRENCY`, `PAYSTACK_CURRENCY`, `RAZORPAY_CURRENCY` | Per-provider override for multi-provider deployments |
| 2 | Admin setting: `DEFAULT_CURRENCY` | DB-backed default, set in admin settings |
| 3 | `PAYMENTS_CURRENCY` | Environment fallback when no admin default is set |
| 4 | Provider default | NGN for Paystack, INR for Razorpay, USD for Stripe/Paddle |

`NEXT_PUBLIC_CURRENCY` and `STRIPE_CURRENCY` are no longer part of the runtime currency resolver.

### Database Schema for Multi-Provider

The schema uses provider-neutral fields plus JSON maps for multi-provider support:
- **Generic columns** (`externalSubscriptionId`, `externalPriceId`, `paymentProvider`) — used for all new transactions.
- **Provider ID maps** (`externalSubscriptionIds`, `externalPriceIds` as JSON) — for multi-provider per-record support.
- **Compatibility aliases** — some admin/API inputs still accept Stripe-named aliases like `stripePriceId` for convenience, but the database model itself is provider-neutral.

When querying, always resolve subscriptions and plans the same way the service layer does: check the direct column first, then fall back to the provider-ID JSON map helpers in `lib/payment/service.ts` and `lib/plans.ts`.

### Adding New Providers

See [`docs/adding-payment-providers.md`](docs/adding-payment-providers.md) for the full step-by-step guide.

---

## Token System

The app ships with a dual token balance system for metering usage:

| Bucket | Field | Purpose |
|---|---|---|
| **Paid tokens** | `tokenBalance` | Granted by plan purchases/top-ups. Configurable expiry behavior. |
| **Free tokens** | `freeTokenBalance` | Granted by the free plan; reset monthly based on settings. |

### Token Spending

**Internal API endpoint (protected by `INTERNAL_API_TOKEN`):**

`POST /api/internal/spend-tokens` — Deducts tokens. Accepts a `bucket` parameter:

| Bucket | Behavior |
|---|---|
| `auto` | Deducts from paid first, then free (default) |
| `paid` | Only deducts from paid tokens |
| `free` | Only deducts from free tokens |
| `shared` | Deducts from the user's organization shared token pool |

### Organization Token Pools

When a user belongs to a team plan, the organization has its own token system:

| Field | Purpose |
|---|---|
| `Organization.tokenBalance` | Shared token pool for the team |
| `Organization.tokenPoolStrategy` | Strategy for pool management (default: `SHARED_FOR_ORG`) |
| `Organization.memberTokenCap` | Maximum tokens any single member can consume |
| `Organization.memberCapStrategy` | `SOFT` (warn) or `HARD` (block) enforcement |
| `Organization.memberCapResetIntervalHours` | How often member usage windows reset |
| `OrganizationMembership.memberTokenUsage` | Per-member usage tracking within the window |
| `OrganizationMembership.memberTokenCapOverride` | Per-member cap exception |

### Other Internal Endpoints

- `POST /api/internal/track-visit` — Records a visit log entry.
- `POST /api/internal/payment-scripts` — Payment-related script operations.

### Settings That Drive the Token System

- `initializeNewUserTokens` — allocates starter tokens on first user creation.
- `resetUserTokensIfNeeded` — resets free tokens monthly (checked on every dashboard visit).
- `shouldResetPaidTokensOnExpiry` / `shouldResetPaidTokensOnRenewal` — configurable in admin settings.

---

## Team Plans & Organizations

Team subscriptions provision managed organizations and keep them in sync with billing status.

- **Provisioning:** When a qualifying subscription activates, `ensureTeamOrganization` creates or updates an organization, assigns a deterministic slug, and mirrors metadata to Clerk (if using Clerk). In practice, that means an active team plan whose plan has `supportsOrganizations: true` and is not in a proration-pending state.
- **Cleanup:** `syncOrganizationEligibilityForUser` runs whenever subscription status changes (checkout, activation, webhook, admin override). When a plan lapses, the helper dismantles the organization and clears member access.
- **Dashboard:** `/dashboard/team` hosts the management UI with invites, member removal, and provisioning refresh.
- **Invite acceptance:** `/invite/[token]` — token-based invite acceptance page for new and existing users.
- **API routes:** `/api/team/invite`, `/api/team/invite/revoke`, `/api/team/members/remove`, `/api/team/summary`, `/api/team/provision`, `/api/team/settings`.
- **Clerk webhook sync:** `organization.*`, `organizationMembership.*`, and `organizationInvitation.*` events are handled in `/api/webhooks/clerk` to keep Prisma and Clerk in sync.

### Plan Schema for Teams

```prisma
Plan {
  scope              String  @default("INDIVIDUAL") // "INDIVIDUAL" or "TEAM"
  supportsOrganizations  Boolean @default(false)
  organizationSeatLimit  Int?
  organizationTokenPoolStrategy String? @default("SHARED_FOR_ORG")
  minSeats / maxSeats / seatPriceCents  // Seat-based pricing
}
```

---

## Feature Gating

Define per-feature access in `lib/features.ts` using the `FeatureId` enum, then wrap UI in the gate component:

```tsx
import { FeatureGate } from '@/lib/featureGate';
import { FeatureId } from '@/lib/features';

<FeatureGate feature={FeatureId.WATERMARK_REMOVAL}>
  <RemoveWatermarkButton />
</FeatureGate>
```

The gate checks **both** personal subscriptions **and** organization access — if the user is an owner or member of an organization with an active team subscription, access is granted even without a personal subscription.

`PRO_FEATURES` in `lib/features.ts` lists all gated features (e.g. `OFFSET_SETTINGS`, `EXPORT_SCALE_*`, `WATERMARK_REMOVAL`, `SUPPORT_PRIORITY`, `USAGE_LIMIT_ELEVATED`, etc.).

> **Note for new projects:** The shipped `FeatureId` entries (like `WATERMARK_REMOVAL`, `FOV_ADJUST`) are examples from the original product. Replace them with your own feature IDs — the gating system works with any string enum values.

---

## Coupon System

The app includes a full-featured coupon engine with provider-aware discount handling.

### Features

- **Percent-off** and **amount-off** discounts
- **Duration control:** `once`, `repeating` (N months), or `forever`
- **Plan restrictions** via `CouponPlan` join table — limit coupons to specific plans
- **Currency-aware:** Amount-off coupons can be restricted to a specific currency
- **Minimum purchase thresholds** (`minimumPurchaseCents`)
- **Max redemptions** and time-bound availability (`startsAt` / `endsAt`)
- **Multi-provider coupon sync:** Coupons are auto-synced to providers that support native coupons (Stripe, Paddle); for others (Paystack, Razorpay), discounts are applied in-app

### Admin & User Pages

- **Admin:** `/admin/coupons` — create, edit, activate/deactivate coupons, set plan restrictions
- **User:** `/dashboard/coupons` — view redeemed coupons and pending redemptions

---

## Blog & CMS

A full-featured blog is built into the app:

- **Public routes:** `/blog`, `/blog/[slug]`, `/blog/category/[category]`
- **Admin CRUD:** `/admin/blog` (list/create/edit/delete posts and categories)
- **API routes:** `/api/admin/blog/route.ts` (bulk), `/api/admin/blog/[id]`, `/api/admin/blog/categories`
- **Lib:** `lib/blog.ts` — paginated queries, category management, slug normalization, and rich-text sanitization via `lib/htmlSanitizer.ts`.
- **Components:** `components/blog/BlogSidebar.tsx`, `RelatedPosts.tsx`, `BlogListingStyles.tsx`
- **Rich text editing:** TipTap editor with images, links, colors, text alignment, YouTube embeds, horizontal rules, and more.

### Blog Categories

Blog posts use a many-to-many category system:

```
SitePage ←→ BlogPostCategory ←→ BlogCategory
```

### SEO Support

Every blog post and site page includes dedicated SEO fields:
- `metaTitle`, `metaDescription`, `canonicalUrl`, `noIndex`
- Open Graph: `ogTitle`, `ogDescription`, `ogImage`

Blog posts are stored using the `SitePage` model (shared with editable site pages) and differentiated by `collection` (`page` vs `blog`).

---

## Site Pages

Editable public pages (Terms, Privacy, Refund Policy, etc.) are managed in the admin:

- **Admin CRUD:** `/admin/pages` (list/create/edit)
- **Public routes:** `/terms`, `/privacy`, `/refund-policy`, `/[slug]` (dynamic catch-all)
- **Lib:** `lib/sitePages.ts` — slug normalization, trash/restore, sanitized rich-text content.
- **Core pages** (Terms, Privacy, Refund Policy) are seeded automatically if they don't exist.

Template variables (e.g. `{{siteName}}`) are interpolated at render time from admin settings.

---

## Theming & Branding

The admin theme designer (`/admin/theme`) provides comprehensive branding control without touching code.

### Color Palette System

Full light/dark mode color palettes with CSS custom properties generated server-side in `app/layout.tsx`:

- **Core surfaces:** `bgPrimary`, `bgSecondary`, `bgTertiary`, `bgQuaternary`
- **Text:** `textPrimary`, `textSecondary`, `textTertiary`
- **Borders:** `borderPrimary`, `borderSecondary`
- **Accents:** `accentPrimary`, `accentHover`
- **Gradients:** Page, hero, card, and tabs gradients (each with `from`/`via`/`to`)
- **Special surfaces:** `headerBg`, `stickyHeaderBg`, `sidebarBg`, `heroBg`, `panelBg`, `pageGlow`
- **Preset palettes:** Saved color schemes for quick application

### Header & Navigation

- **Header links** and **footer links** — configurable link lists
- **Footer text** with `{{year}}` and `{{siteName}}` interpolation
- **Header layout:** Blur radius, border width, shadow, font size/weight (for both default and sticky states)

### Custom Code Injection

- **Custom CSS** — injected globally via `<style>` tag
- **Custom `<head>` snippet** — scripts, meta tags, third-party integrations
- **Custom `<body>` snippet** — bottom-of-page scripts (analytics, chat widgets)

### Blog Theming

- **Listing style** and **page size** configuration
- **Sidebar settings** and related posts toggle
- **Blog HTML snippets** — inject HTML before/after/between blog posts (ads, CTAs)

### Pricing Page

- **Pricing layout settings** — configured through the theme admin

---

## Email Templates

The app includes a full email template CMS with database-backed, editable templates.

### Admin UI

`/admin/emails` — form-based editor for all email templates. Each template supports HTML and plain text versions, activation toggles, test sends, and `{{variable}}` placeholders.

### Built-in Templates (27 total)

| Template Key | When Sent |
|---|---|
| `welcome` | User registers and verifies email |
| `subscription_activated` | Subscription becomes active |
| `subscription_extended` | Existing subscription is extended |
| `subscription_upgraded` | User upgrades from non-recurring to recurring plan |
| `subscription_upgraded_recurring` | User upgrades between recurring plans |
| `subscription_upgrade_scheduled_recurring` | Recurring upgrade scheduled for cycle end |
| `subscription_change_scheduled_recurring` | Plan change scheduled for cycle end |
| `subscription_downgraded` | User downgrades plan |
| `subscription_cancelled` | Subscription cancelled |
| `subscription_expired` | Subscription expired |
| `subscription_ended` | Subscription fully ended |
| `subscription_renewed` | Subscription renewed |
| `subscription_renewal_reminder` | Upcoming renewal reminder (Stripe `invoice.upcoming`) |
| `token_topup` | User purchases additional tokens/credits |
| `tokens_credited` | Admin credits tokens to a user |
| `tokens_debited` | Admin debits tokens from a user |
| `admin_assigned_plan` | Admin assigns a plan to a user |
| `team_invitation` | User is invited to join an organization |
| `admin_notification` | Admin billing alert emails |
| `refund_issued` | Refund processed for a payment |
| `refund_processed` | Refund confirmed by provider |
| `payment_failed` | Payment attempt failed |
| `invoice_payment_failed` | Invoice payment failed |
| `password_reset` | Password reset link (NextAuth) |
| `email_verification` | Email verification link (NextAuth) |
| `email_change_confirmation` | Email address change confirmation (NextAuth) |
| `magic_link` | Magic link sign-in (NextAuth) |

### Template Variables

All templates support a common set of variables:
- **User:** `{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{userEmail}}`
- **Billing:** `{{planName}}`, `{{amount}}`, `{{transactionId}}`, `{{tokenAmount}}`
- **Site:** `{{siteName}}`, `{{supportEmail}}`, `{{siteUrl}}`, `{{siteLogo}}`
- **Branding:** `{{accentColor}}`, `{{accentHoverColor}}` — resolved from theme palette
- **Links:** `{{dashboardUrl}}`, `{{billingUrl}}`

### Email Logging

All sent emails are logged in the `EmailLog` model with recipient, subject, template key, and delivery status.

---

## Notifications

The app has a full in-app notification system.

### Types

| Type | Example |
|---|---|
| `BILLING` | Subscription renewed, payment failed, refund processed |
| `SUPPORT` | Admin replied to your ticket |
| `ACCOUNT` | Profile updated, plan assigned |
| `TEAM_INVITE` | You've been invited to join a team |
| `GENERAL` | System announcements |

### Features

- **In-app notifications** with unread badge counts
- **Type labels:** The app treats `BILLING`, `SUPPORT`, `ACCOUNT`, `TEAM_INVITE`, and `GENERAL` as the standard categories, but the database stores `type` as a string rather than a hard enum.
- **URL deep-linking** — each notification can link to a specific page
- **Deduplication** — 5-minute window prevents duplicate notifications
- **Paired with email:** Billing notifications can optionally trigger an email via the template system
- **Admin alerts:** Configurable per-event-type admin emails (refund, new purchase, renewal, upgrade, downgrade, payment failure, dispute)
- **Global notifications:** Admins can send notifications to all users

### Routes

- **User:** `/dashboard/notifications` — view and mark notifications as read
- **Admin:** `/admin/notifications` — manage system notifications
- **API:** `/api/notifications` (list), `/api/notifications/[id]` (single), `/api/notifications/mark-all-read`

---

## Support Tickets

A built-in support ticket system for user-admin communication.

### Features

- **Ticket lifecycle:** Open → admin/user replies → resolved
- **Reply threads** with user and admin messages
- **Ticket categories:** General, Technical Support, Billing, Pre-Sale, Account, Feature Request
- **Email notifications:** Configurable per-event (`new_ticket_to_admin`, `admin_reply_to_user`, `user_reply_to_admin`)
- **Dashboard badge:** Users see a "NEW" badge when an admin has replied

### Routes

- **User:** `/dashboard/support` — create tickets, view replies
- **Admin:** `/admin/support` — view all open tickets, reply, manage status
- **API:** `/api/support/tickets`

---

## Contact Page

A public contact form at `/contact` backed by the `ContactForm` component and `/api/contact` API route. The page content is managed as a site page (editable from `/admin/pages`).

---

## Invoice & Refund Receipts

The app generates **PDF invoices** and **refund receipts** server-side using `pdf-lib`, available for all payment providers regardless of native invoicing support.

### Invoice PDF (`lib/invoice.tsx`)

Generated A4 documents including:
- Site branding (name, logo)
- Invoice number, date, status, payment provider reference
- Bill-to details (customer name, email)
- Service details (plan name, description, duration, service period)
- Coupon/discount breakdown
- Payment summary with subtotal, discount, and total

### Refund Receipt PDF (`lib/refundReceipt.tsx`)

Similar layout with refund-specific details:
- Refund ID, date, original transaction reference
- Refunded amount vs. original amount
- Coupon applied (if any)

---

## Webhooks

### Centralized payment webhook ingress

`/api/webhooks/payments` is the preferred single endpoint for all payment providers. It auto-detects the provider from the signature header:

| Header | Provider |
|---|---|
| `stripe-signature` | Stripe |
| `x-paystack-signature` | Paystack |
| `paddle-signature` | Paddle |
| `x-razorpay-signature` | Razorpay |

Provider-specific routes also exist as aliases: `/api/stripe/webhook` (Stripe), `/api/webhooks/paystack` (Paystack), `/api/webhooks/paddle` (Paddle).

### Clerk webhook

`/api/webhooks/clerk` handles:
- `user.created` — immediately runs `ensureUserExists` to initialize the user DB record and allocate starting tokens.
- `user.updated` — syncs email/verification status; triggers welcome email if verified.
- `organization.*` events — upserts organizations from Clerk into the local DB.
- `organizationMembership.*` events — syncs member roles and status.
- `organizationInvitation.*` events — tracks invite state (pending, accepted, revoked).

Signatures are verified using `svix` (Clerk's delivery layer). In development, unsigned events are accepted with a warning.

---

## Cron Jobs & Expiry Automation

### Scheduled cleanup cron

```
GET /api/cron/process-expiry
Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>
```

Run this periodically (hourly or daily) to:
- Expire stale ACTIVE subscriptions past their `expiresAt`.
- Dismantle "zombie" organizations whose owner's subscription has lapsed.
- Process the subscription queue for batch operations.

**In production**, unauthorized requests return `404`. Configure `CRON_PROCESS_EXPIRY_TOKEN` and send it as a Bearer token.

**Example cron command (cPanel / shell):**
```bash
curl -fsS -m 60 \
  -H 'Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>' \
  'https://yourdomain.com/api/cron/process-expiry' \
  >> /home/<user>/cron-process-expiry.log 2>&1
```

### Lazy expiry check

As a fallback, `app/dashboard/layout.tsx` calls `getCurrentUserWithFallback()` → `ensureUserExists()` on every dashboard visit. This runs a lightweight on-access check that expires stale subscriptions and resets monthly free tokens without requiring the cron job to have run.

---

## File & Logo Storage (S3)

By default, uploaded logos are stored on the local filesystem. Switch to S3 (or any S3-compatible provider):

```bash
LOGO_STORAGE="s3"
LOGO_S3_BUCKET="my-bucket-name"
AWS_REGION=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
LOGO_CDN_DOMAIN=""        # Optional: CloudFront distribution domain (recommended)
LOGO_S3_ENDPOINT=""       # Optional: Custom S3-compatible endpoint (Cloudflare R2, MinIO, DigitalOcean Spaces)
```

> **S3-compatible providers:** Set `LOGO_S3_ENDPOINT` to your provider's endpoint URL (e.g. `https://<account>.r2.cloudflarestorage.com` for Cloudflare R2). Leave it blank for standard AWS S3.

When `LOGO_CDN_DOMAIN` is set, the upload handler returns CDN URLs (`https://<LOGO_CDN_DOMAIN>/logos/<file>`) instead of raw S3 links.

**File upload scoping:** The `saveAdminFile` helper in `lib/logoStorage.js` scopes uploads to sub-directories based on context (e.g. `/blog/`, `/logos/`, `/files/`) to keep the bucket organized.

### S3 CORS (required for browser uploads)

Add a CORS policy to your bucket (Permissions → CORS):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### CloudFront (recommended)

Front your bucket with CloudFront and set:
- **Response headers policy:** `CORS-With-Preflight` (AWS managed)
- **Origin request policy:** `CORS-S3Origin`
- **Cache policy:** `CachingOptimized`
- **Allowed methods:** `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`

Add all S3 / CloudFront hostnames to `next.config.mjs` → `images.remotePatterns`.

---

## Analytics (Google Analytics 4)

The admin traffic dashboard pulls metrics from the GA4 Data API.

| Variable | Required | Scope | Example |
|---|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ✅ | Client | `G-XXXXXXXXXX` |
| `GA_PROPERTY_ID` | ✅ | Server | `123456789` |
| `GA_SERVICE_ACCOUNT_CREDENTIALS_B64` | ✅ | Server | Base64-encoded service account JSON |
| `GA_DATA_API_CACHE_SECONDS` | optional | Server | `30` |

**Setup:**
1. Create a service account in Google Cloud with `analytics.readonly` scope.
2. In GA4 → Admin → Property Access Management, add the service account email with at least **Viewer** role.
3. Base64-encode your service account JSON: `base64 -i key.json`.

> **Heads-up:** The GA snippet loads in every environment once `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. Use a dev GA4 property locally to avoid polluting production data.

Metrics surfaced: total visits, unique visitors, new users, engaged sessions, page views, avg. session duration, engagement rate, top referrers, top pages, countries, device mix, and events.

---

## Visit Tracking

The app includes lightweight first-party visit tracking via `lib/visit-tracking.ts` and the `VisitLog` model. Middleware (`POST /api/internal/track-visit`) records visits for admin traffic reporting, skipping API routes, static files, admin routes, and bots. This is the built-in self-hosted analytics path alongside GA4.

> Historical note: the repository still contains deprecated Umami ops playbooks in `ops/`, but they are no longer part of the supported analytics setup.

---

## Maintenance Mode

The app includes a DB-backed maintenance mode that can be toggled from the admin dashboard.

- **Admin toggle:** `/admin/maintenance` — enable/disable maintenance mode
- **Behavior:** When enabled, all public routes redirect to `/maintenance` with a branded "under maintenance" page
- **Bypass paths:** Admin pages (`/admin/*`), auth pages (`/sign-in`, `/sign-up`), API routes for auth/webhooks/cron/health, and `/access-denied` are always accessible
- **Implementation:** `lib/maintenance-mode.ts` reads from the settings system — no env var or restart needed

---

## Session Activity

The app tracks user session activity with device/browser detection and IP-based geolocation.

- **User page:** `/dashboard/activity` — view active sessions with browser, device, location, and last-active timestamps
- **Session tracking:** `lib/session-activity.ts` parses User-Agent for browser name/version and device type (desktop/mobile/tablet)
- **Geolocation:** Uses `IPINFO_LITE_TOKEN` for IP lookups when configured, falls back to `country.is` (free, no API key needed). Results are cached for 24 hours.
- **Session revocation:** Users can revoke individual sessions (when using an auth provider that supports it)
- **Activity refresh:** Sessions are refreshed every 5 minutes to avoid unnecessary writes

---

## Moderator Roles

In addition to `ADMIN`, the app supports a **Moderator** role with configurable per-section access.

- **Admin config:** `/admin/moderation` — enable/disable which dashboard sections a moderator can access.
- **Sections available:** `users`, `transactions`, `purchases`, `subscriptions`, `support`, `notifications`, `blog`, `analytics`, `traffic`, `organizations`.
- **Moderator activity log:** `/admin/moderator-activity` — tracks all moderator actions.
- **Lib:** `lib/moderator.ts` / `lib/moderator-shared.ts` — `MODERATOR_SECTIONS`, access checking helpers.
- **API:** `/api/admin/moderator-actions/route.ts`

Moderators see only the sections their config allows; they cannot change settings, manage plans, or perform billing operations.

---

## Rate Limiting

The app includes database-backed rate limiting via the `RateLimitBucket` model and `lib/rateLimit.ts`.

### Preconfigured tiers

| Tier | Limit | Window | Use Case |
|---|---|---|---|
| `API_GENERAL` | 100 req | 15 min | General API endpoints |
| `API_SENSITIVE` | 10 req | 15 min | Password changes, account deletion |
| `CHECKOUT` | 5 req | 1 min | Checkout creation |
| `WEBHOOK` | 1000 req | 1 min | Inbound webhooks (fail-open) |
| `EXPORT` | 20 req | 1 min | Data exports |
| `AUTH` | 20 req | 15 min | Login attempts |

### Features

- **Composite keys** — rate limits by IP + User-Agent combination
- **Response headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Automatic cleanup** — expired buckets are pruned probabilistically every ~100 requests
- **Fail-open option** — `skipOnError: true` prevents rate limiter DB issues from blocking requests
- **Admin-aware** — `adminRateLimit` helper uses actor ID when available, falls back to IP

---

## Logging & Audit Trail

### Secure Logger (`lib/logger.ts`)

A production-safe logging system that replaces raw `console.log` throughout the app:

- **Auto-redaction** of sensitive keys (passwords, tokens, secrets, API keys)
- **Persistent storage** — WARN and ERROR logs are saved to the `SystemLog` model (viewable at `/admin/logs`)
- **Auto-pruning** at 1,000 max entries
- **Structured logging** with timestamps and sanitized metadata

### Admin Action Audit Log

The `AdminActionLog` model records all admin/moderator actions:

- **Fields:** actor, target user, action type, details, timestamp
- **Viewable at:** `/admin/moderator-activity`

---

## Security

### HTTP Security Headers

`next.config.mjs` sets comprehensive security headers on all routes:

- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — enforces HTTPS (1 year, includeSubDomains)
- `Referrer-Policy: origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy` — disables camera, microphone, geolocation, payment
- API routes: `Cache-Control: no-store, max-age=0`

### Error Sanitization

`lib/secure-errors.ts` provides structured error classes (`AppError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, etc.) that:

- Expose safe, operational error messages to clients
- Hide internal error details in production
- Include `X-Request-ID` headers for support/debugging

### Other Security Features

- **`ENCRYPTION_SECRET`** — encrypts sensitive DB fields (e.g. card last4)
- **Webhook signature verification** with rotation support (comma-separated secrets)
- **Price validation** on webhook events
- **Password policy** enforcement (`lib/password-policy.ts`)
- **Token version** tracking — incremented on password change to invalidate existing sessions

---

## Dark Mode

The app supports system-preference and manual dark mode:

- **Detection:** Reads `localStorage.themePreference`, falls back to `prefers-color-scheme` media query
- **Flash prevention:** An inline `<script>` runs before React hydration to set the theme class on `<html>`, preventing light → dark flash
- **Toggle:** `ThemeToggle` component available in the header
- **CSS classes:** `html.light` and `html.dark` — all theme color variables are generated for both modes
- **Persistence:** User preference saved to `localStorage.themePreference`

---

## Testing

The app includes comprehensive testing infrastructure:

### Unit Tests (Vitest)

```bash
npm test              # Run all unit tests
npm test -- --watch   # Watch mode
```

90+ test files covering:
- Payment provider flows (Stripe, Paystack, Paddle, Razorpay)
- Webhook handling and event normalization
- Subscription lifecycle (checkout, proration, cancellation, resurrection)
- Team/organization operations and provisioning
- Token spending and organization scoping
- Auth flows, route guards, and session management
- Admin operations, sorting, and filtering
- Coupon redemption and plan resolution
- Support ticket categories and cursor pagination

### E2E Tests (Playwright)

```bash
npm run test:e2e          # Run all E2E tests
npm run test:e2e:headed   # Run with browser visible
```

Configuration in `playwright.config.ts`.

---

## Admin Dashboard Overview

The admin dashboard (`/admin`) is organized into logical groups:

| Group | Sections |
|---|---|
| **Overview** | Dashboard home with quick stats |
| **Users & Access** | Users, Organizations, Moderation |
| **Finances** | Transactions, One-Time Sales, Subscriptions, Coupons |
| **Platform** | Theme, Pages, Blog, Plans, Email Templates, Settings |
| **Support & Analytics** | Support Tickets, Notifications, Analytics (GA4), Traffic |
| **Developer** | API Docs, System Logs, Maintenance |

### Notable Admin Features

- **Admin API Docs** (`/admin/api`) — auto-generated API inventory from `lib/admin-api.inventory.ts`
- **Maintenance Tools** (`/admin/maintenance`) — cleanup, repair utilities, and maintenance mode toggle
- **System Logs** (`/admin/logs`) — persisted WARN/ERROR logs with filtering
- **One-Time Plans** (`/admin/one-time-plans`) — manage non-recurring plan offerings

---

## User Dashboard Overview

The user dashboard (`/dashboard`) provides users with a full self-service experience:

| Page | Path | Description |
|---|---|---|
| **Home** | `/dashboard` | Overview and the shipped SaaSyApp demo workspace with current plan, token balance, and quick stats |
| **Onboarding** | `/dashboard/onboarding` | Guided setup for new users |
| **Plan** | `/dashboard/plan` | Current plan details and upgrade options |
| **Billing** | `/dashboard/billing` | Payment management, manage subscription |
| **Transactions** | `/dashboard/transactions` | Payment history |
| **Team** | `/dashboard/team` | Team management (invites, members, settings) |
| **Profile** | `/dashboard/profile` | Edit name, avatar, and profile info |
| **Account** | `/dashboard/account` | Password changes, email updates, account deletion |
| **Activity** | `/dashboard/activity` | Session history with device/location tracking |
| **Settings** | `/dashboard/settings` | Preferences (email notifications, timezone, etc.) |
| **Notifications** | `/dashboard/notifications` | In-app notification center |
| **Support** | `/dashboard/support` | Support ticket creation and history |
| **Coupons** | `/dashboard/coupons` | Redeemed coupons and pending redemptions |
| **Legacy redirects** | `/dashboard/editor`, `/dashboard/sassyapp` | Redirect to `/dashboard` |

The main dashboard page is the place to replace the demo SaaSyApp experience with your own product logic.

---

## Production Setup

### Before the first live deploy

Complete these steps after local development is finished and before you point real traffic at the app:

1. Provision a hosted PostgreSQL database and update `DATABASE_URL`.
2. Run production migrations with `npx prisma migrate deploy` against that production database.
3. Configure all production env vars for your chosen auth provider, payment provider, email provider, and secrets.
4. If admins will upload logos or other managed files in production, switch from local filesystem storage to S3-compatible storage.
5. Configure your webhook endpoints and verify signatures before accepting live traffic.

### Required environment variables

```bash
# Core
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_DOMAIN="yourdomain.com"
NEXT_PUBLIC_SITE_NAME="Your App"

# Auth (pick one)
AUTH_PROVIDER="clerk"   # or "nextauth"

# Payment (pick one)
PAYMENT_PROVIDER="stripe"

# Currency (optional, defaults to provider default)
PAYMENTS_CURRENCY="USD"

# Security
ENCRYPTION_SECRET=""           # Encrypt sensitive DB fields
INTERNAL_API_TOKEN=""          # Server-to-server endpoints (/api/internal/*)
HEALTHCHECK_TOKEN=""           # Auth for /api/health detailed output
CRON_PROCESS_EXPIRY_TOKEN=""   # Auth for /api/cron/process-expiry
CRON_SECRET=""                 # Optional: Vercel Cron secret (Authorization header)

# Email
EMAIL_PROVIDER="nodemailer"      # or "resend"
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
RESEND_API_KEY=""
EMAIL_FROM=""
SUPPORT_EMAIL=""
SEND_ADMIN_BILLING_EMAILS="true"
```

Notes:

- Use `EMAIL_PROVIDER="nodemailer"` for SMTP delivery. In local development, the default SMTP values can point at MailHog.
- Use `EMAIL_PROVIDER="resend"` with `RESEND_API_KEY` set. The `SMTP_*` variables are ignored in that mode.

### Health check

```
GET /api/health
Authorization: Bearer <HEALTHCHECK_TOKEN>
```

Returns database connectivity, environment validation (Stripe, Clerk), and runtime diagnostics. Without the token, returns a minimal public response.

### Vercel deployment

SaaSyBase does not need much Vercel-specific config, but there are a few production realities you should handle explicitly:

1. Import the repo into Vercel and let Next.js auto-detect the framework.
2. Set production env vars in the Vercel project settings.
3. Use PostgreSQL, not SQLite.
4. Run `npx prisma migrate deploy` against the production database before the first live release and on future schema changes. Vercel does not apply Prisma migrations for you automatically.
5. If you need admin-managed uploads (logos, blog assets, similar files), use `LOGO_STORAGE="s3"` plus S3-compatible credentials. Vercel's local filesystem is not suitable for durable app-managed uploads.
6. Set `CRON_SECRET` in Vercel if you want the built-in Vercel cron job to call `/api/cron/process-expiry`. The shipped `vercel.json` schedules that route once per day at `03:00 UTC`.

Notes:

- The default `vercel.json` cron schedule is intentionally conservative so it works on Vercel Hobby plans too. If you need faster cleanup and your plan supports it, increase the frequency.
- If you want manual or external cron callers in addition to Vercel Cron, you can also keep `CRON_PROCESS_EXPIRY_TOKEN` set.

### Clerk webhook (production)

1. Go to Clerk Dashboard → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/webhooks/clerk`
3. Enable events: `user.created`, `user.updated`, `organization.*`, `organizationMembership.*`, `organizationInvitation.*`
4. Copy the signing secret into `CLERK_WEBHOOK_SECRET`.

### Stripe webhook (production)

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/webhooks/payments` (or `/api/stripe/webhook`)
3. Enable the recommended events listed in the [Stripe](#stripe) section above.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Multiple comma-separated secrets are supported for rotation:
```bash
STRIPE_WEBHOOK_SECRET="whsec_primary,whsec_rotating"
```

### Vercel deployment checklist

- `DATABASE_URL` points at PostgreSQL.
- `NEXT_PUBLIC_APP_URL` matches the production domain exactly.
- `AUTH_PROVIDER` and `PAYMENT_PROVIDER` are set deliberately.
- `CRON_SECRET` is configured if using the bundled Vercel cron.
- `LOGO_STORAGE="s3"` is configured if you need durable uploads.
- Clerk and payment webhooks point at the production domain.

### Support ticket emails

- New tickets/user replies → email to `SUPPORT_EMAIL`.
- Admin replies → email to ticket owner (respects user setting `EMAIL_NOTIFICATIONS`).
- If `EMAIL_PROVIDER="nodemailer"`, configure SMTP above; without it, Nodemailer falls back to an in-memory stream transport (emails won't deliver in production).
- If `EMAIL_PROVIDER="resend"`, set `RESEND_API_KEY`; SMTP settings are not used.

---

## Self-hosted Deployments

### Coolify

Coolify can deploy SaaSyBase as a standard Node/Next.js app without a custom Dockerfile.

Recommended setup:

1. Connect the repository as a Node or Nixpacks-style application.
2. Set the build command to `npm run build`.
3. Set the start command to `npm run start`.
4. Run `npx prisma migrate deploy` as a pre-deploy step or separate deployment job.
5. Use PostgreSQL for production data.
6. Use S3-compatible storage if you need durable uploaded assets across container restarts or reschedules.
7. Configure a scheduled HTTP job for `/api/cron/process-expiry` with `Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>` unless you are relying on a platform-native scheduler that can inject a bearer token.

### Linux VPS (Nginx or Apache)

For bare-metal / VPS hosts (AlmaLinux, RHEL, Ubuntu):

**Option 1 — systemd EnvironmentFile**

```bash
# Create env file
TOKEN=$(openssl rand -hex 32)
sudo install -o appuser -g appuser -m 600 /dev/null /etc/saasybase/app.env
sudo tee /etc/saasybase/app.env > /dev/null << EOF
HEALTHCHECK_TOKEN=$TOKEN
DATABASE_URL=postgresql://...
# ...other vars
EOF
```

Reference it in your service unit:
```ini
[Service]
EnvironmentFile=/etc/saasybase/app.env
ExecStart=/usr/bin/npm run start
WorkingDirectory=/var/www/saasybase
```

**Option 2 — dotenv alongside the app**

```bash
set -a; source .env.production; set +a
npm run start
```

### Linux VPS deployment flow

Typical production sequence:

```bash
npm install
npx prisma migrate deploy
npm run build
npm run start
```

Run the app under `systemd`, `pm2`, or another process manager. `systemd` is the simplest default on most Linux VPS hosts.

### Nginx reverse proxy

Example site block:

```nginx
server {
  server_name yourdomain.com www.yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection upgrade;
  }
}
```

Pair this with TLS via Let's Encrypt or your existing certificate automation.

### Apache reverse proxy

Example VirtualHost:

```apache
<VirtualHost *:80>
  ServerName yourdomain.com
  ServerAlias www.yourdomain.com

  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
  RequestHeader set X-Forwarded-Proto "http"
</VirtualHost>
```

Enable the required proxy modules (`proxy`, `proxy_http`, `headers`) and terminate TLS in your HTTPS virtual host.

### Linux VPS cron example

```bash
curl -fsS -m 60 \
  -H 'Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>' \
  'https://yourdomain.com/api/cron/process-expiry'
```

---

## Environment Variable Reference

A complete list of supported env vars is in `.env.example`. Key groups:

| Group | Key prefix | Notes |
|---|---|---|
| Database | `DATABASE_URL` | SQLite for dev, PostgreSQL for prod |
| App | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_APP_DOMAIN` | Public-facing URL and branding |
| Branding | `NEXT_PUBLIC_SITE_LOGO`, `NEXT_PUBLIC_SITE_LOGO_LIGHT/DARK`, `NEXT_PUBLIC_SITE_LOGO_HEIGHT` | Site logo configuration |
| Auth | `AUTH_PROVIDER`, `CLERK_*`, `AUTH_SECRET`, `NEXTAUTH_SECRET` | Choose Clerk or NextAuth |
| Auth OAuth | `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | NextAuth OAuth providers |
| Payment | `PAYMENT_PROVIDER`, `STRIPE_*`, `PAYSTACK_*`, `PADDLE_*`, `RAZORPAY_*` | Choose provider |
| Payment prices | `PAYMENT_PRICE_*`, `SUBSCRIPTION_PRICE_*` | One-time and recurring plan price IDs |
| Payment config | `PAYMENT_AUTO_CREATE`, `PAYMENTS_CURRENCY` | Catalog sync and currency |
| Currency settings | `DEFAULT_CURRENCY` | DB-backed admin setting used by payment currency resolution |
| Currency | `PADDLE_CURRENCY`, `PAYSTACK_CURRENCY`, `RAZORPAY_CURRENCY` | Per-provider currency overrides |
| Email | `EMAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Switch between SMTP/Nodemailer and Resend |
| Geolocation | `IPINFO_LITE_TOKEN` | Optional; activity geolocation falls back to `country.is` when unset |
| Storage | `LOGO_STORAGE`, `LOGO_S3_BUCKET`, `LOGO_S3_ENDPOINT`, `AWS_*`, `LOGO_CDN_DOMAIN` | Local fs, S3, or S3-compatible (R2, MinIO) |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_*` | Google Analytics 4 |
| Security | `ENCRYPTION_SECRET`, `INTERNAL_API_TOKEN`, `HEALTHCHECK_TOKEN`, `CRON_PROCESS_EXPIRY_TOKEN`, `CRON_SECRET` | Server-side secrets |
| Demo | `DEMO_READ_ONLY_MODE` | Read-only demo mode |
| Paddle sandbox | `PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_ENV`, `PADDLE_API_BASE_URL` | Sandbox/production toggle |
| Seeding | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Non-interactive admin creation |
| Dev helpers | `DEV_ADMIN_ID`, `DEV_ADMIN_EMAIL`, `ALLOW_ADMIN_SCRIPT` | Local dev only |
| E2E testing | `PLAYWRIGHT_*` | Playwright base URL, credentials, org IDs |

---

## Demo Read-Only Mode

If you want to share a safe, explorable demo (including admin UI) without allowing data changes, enable:

```bash
DEMO_READ_ONLY_MODE="true"
```

When enabled:

- `POST`, `PUT`, `PATCH`, and `DELETE` requests to `/api/*` are blocked with `403`.
- Auth and webhook writes remain allowed (`/api/auth/*`, `/api/webhooks/*`, `/api/stripe/webhook`) so sign-in and provider callbacks still work.
- A read-only modal appears after entering admin or dashboard, and blocked actions trigger an informational toast.

Recommended setup:

1. Run this mode on a dedicated demo deployment/environment.
2. Use seeded demo accounts only (for example `admin@saasybase.com` / `password`).
3. Keep production with `DEMO_READ_ONLY_MODE="false"`.

---

## Disclaimer

This codebase is production-oriented but you should review your environment configuration, authentication posture, and security setup before going live. In particular:

- Rotate all secrets before deploying.
- Enable signature verification for all webhooks.
- Use a hosted PostgreSQL instance in production (not SQLite).
- Set `ALLOW_ADMIN_SCRIPT=false` in production.
