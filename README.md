# SaaSyBase

A production-ready SaaS boilerplate built with **Next.js 16 App Router**, a **dual auth provider system** (Clerk or NextAuth), a **multi-payment provider architecture** (Stripe, Paystack, Paddle, Razorpay), **Prisma** with SQLite (dev) / PostgreSQL (prod), and a full-featured admin dashboard.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Authentication](#authentication)
4. [Admin Setup](#admin-setup)
5. [Payment Providers](#payment-providers)
   - [Stripe](#stripe)
   - [Paystack](#paystack)
   - [Paddle](#paddle)
   - [Razorpay](#razorpay)
   - [Provider Feature Matrix](#provider-feature-matrix)
   - [Adding New Providers](#adding-new-providers)
6. [Token System](#token-system)
7. [Team Plans & Organizations](#team-plans--organizations)
8. [Feature Gating](#feature-gating)
9. [Blog & CMS](#blog--cms)
10. [Site Pages](#site-pages)
11. [Webhooks](#webhooks)
12. [Cron Jobs & Expiry Automation](#cron-jobs--expiry-automation)
13. [File & Logo Storage (S3)](#file--logo-storage-s3)
14. [Analytics (Google Analytics 4)](#analytics-google-analytics-4)
15. [Visit Tracking](#visit-tracking)
16. [Moderator Roles](#moderator-roles)
17. [Production Setup](#production-setup)
18. [Self-hosted Deployments](#self-hosted-deployments)
19. [Environment Variable Reference](#environment-variable-reference)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth | **Clerk** or **NextAuth (Auth.js v5)** — switchable via `AUTH_PROVIDER` |
| Payment | **Stripe**, **Paystack**, **Paddle**, **Razorpay** — switchable via `PAYMENT_PROVIDER` |
| Database | Prisma ORM · SQLite (dev) · PostgreSQL / MySQL (prod) |
| Styling | Tailwind CSS |
| Email | Nodemailer (SMTP; dev uses MailHog by default) |
| Analytics | Google Analytics 4 (via Data API) |
| Monitoring | `/api/health` endpoint |

---

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Run database migrations
npx prisma migrate dev --name init

# 4. Start dev server
npm run dev
```

> **Database note:** The default `DATABASE_URL=file:./dev.db` keeps everything local. For deployments on read-only filesystems (Vercel, Netlify previews), point `DATABASE_URL` at a hosted PostgreSQL instance.

---

## Authentication

The app ships with **two fully implemented auth providers**. Switch between them using the `AUTH_PROVIDER` environment variable (defaults to `clerk`).

```bash
# .env.local
AUTH_PROVIDER="clerk"     # Options: "clerk", "nextauth"
```

`next.config.mjs` automatically exposes this as `NEXT_PUBLIC_AUTH_PROVIDER` to the client bundle so that the auth abstraction layer (`lib/auth-provider`) can DCE (dead-code eliminate) the unused provider at build time.

### Clerk

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
CLERK_WEBHOOK_SECRET=""   # Required for webhook-driven user init and welcome emails
```

- UI components (`<AuthSignIn>`, `<AuthSignUp>`, `<AuthLoaded>`, `<AuthLoading>`, etc.) are re-exported from `lib/auth-provider/client/components` and switch automatically.
- Clerk's `ClerkProvider` wraps the app in `components/AppAuthProvider.tsx`.
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

NextAuth supports **credentials** (email + password), **GitHub OAuth**, **Google OAuth**, and **magic link** (Nodemailer) out of the box — enable the ones you need in `lib/nextauth.config.ts`.

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

**Option 3 — Upsert script**
```bash
node scripts/upsert_admin.js
```

> 💡 Find your Clerk user ID in the Clerk dashboard, or your DB user ID via `npx prisma studio`.

---

## Payment Providers

Select the active provider:

```bash
PAYMENT_PROVIDER="stripe"   # Options: "stripe", "paystack", "paddle", "razorpay"
```

All providers share a common checkout → webhook → subscription lifecycle. The app routes new transactions to the active provider; existing transactions are handled by the provider recorded in their `paymentProvider` field.

### Plan Price IDs

Plans reference provider price IDs via environment variables:

- **One-time plans:** `PAYMENT_PRICE_<key>` (e.g. `PAYMENT_PRICE_24H`, `PAYMENT_PRICE_1M`)
- **Recurring/subscription plans:** `SUBSCRIPTION_PRICE_<key>` (e.g. `SUBSCRIPTION_PRICE_1M`, `SUBSCRIPTION_PRICE_1Y`)
- **Legacy fallback:** `PRICE_*` keys still work but will log a warning — rename them when you can.

### Auto-creating Price IDs (Stripe only)

```bash
STRIPE_AUTO_CREATE="1"   # Auto-creates Stripe products/prices when saving plans without a price ID
```

When enabled, saving a plan without a `stripePriceId` will create the product/price in Stripe and write the generated ID back into the matching env entry automatically.

### Plan recurring interval

Admin plans support `recurringInterval` (`day`, `week`, `month`, `year`) and `recurringIntervalCount` (cadence multiplier, e.g. `month` + `2` = billed every 2 months) when `autoRenew` is enabled.

> **Razorpay constraint:** Daily subscriptions require `recurringIntervalCount >= 7`. A warning is logged and Razorpay price creation is skipped for shorter intervals while other providers continue to work.

---

### Stripe

```bash
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."       # Supports comma-separated for rotation
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
```

**Webhook endpoint:** `/api/stripe/webhook` (preferred) or `/api/webhooks/stripe`

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
# Sandbox:
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
RAZORPAY_CURRENCY="USD"                 # Optional; affects catalog sync and redirect checkouts
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
| Refunds | ✅ | ✅ | ✅ | ✅ |
| Disputes | ✅ | ❌ | ❌ | ❌ |
| Inline elements | ✅ | ✅ | ❌ | ❌ |
| Trial periods | ✅ | ❌ | ❌ | ❌ |

### Database Schema for Multi-Provider

The schema uses dual-column patterns for backward compatibility:
- **Legacy columns** (`stripeSubscriptionId`, `stripePriceId`) — kept for existing Stripe data.
- **Generic columns** (`externalSubscriptionId`, `paymentProvider`) — used for all new transactions.
- **Provider ID maps** (`externalSubscriptionIds` as JSON) — for multi-provider per-record support.

When querying, always check both:
```typescript
const subscription = await prisma.subscription.findFirst({
  where: {
    OR: [
      { externalSubscriptionId: providerId },
      { stripeSubscriptionId: providerId },
    ],
  },
});
```

### Adding New Providers

See [`docs/adding-payment-providers.md`](docs/adding-payment-providers.md) for the full step-by-step guide.

---

## Token System

The app ships with a dual token balance system for metering usage:

| Bucket | Field | Purpose |
|---|---|---|
| **Paid tokens** | `tokenBalance` | Granted by plan purchases/top-ups. Configurable expiry behavior. |
| **Free tokens** | `freeTokenBalance` | Granted by the free plan; reset monthly based on settings. |

**Internal API endpoints (protected by `INTERNAL_API_TOKEN`):**
- `POST /api/internal/spend-tokens` — Deducts from `auto` / `paid` / `free` / `shared` bucket.
- `POST /api/internal/track-visit` — Records a visit log entry.

**Settings that drive the token system:**
- `initializeNewUserTokens` — allocates starter tokens on first user creation.
- `resetUserTokensIfNeeded` — resets free tokens monthly (checked on every dashboard visit).
- `shouldResetPaidTokensOnExpiry` / `shouldResetPaidTokensOnRenewal` — configurable in admin settings.

---

## Team Plans & Organizations

Team subscriptions provision managed organizations and keep them in sync with billing status.

- **Provisioning:** When a qualifying subscription activates, `ensureTeamOrganization` creates or updates an organization, assigns a deterministic slug, and mirrors metadata to Clerk (if using Clerk).
- **Cleanup:** `syncOrganizationEligibilityForUser` runs whenever subscription status changes (checkout, activation, webhook, admin override). When a plan lapses, the helper dismantles the organization and clears member access.
- **Dashboard:** `/dashboard/team` hosts the management UI with invites, member removal, and provisioning refresh.
- **API routes:** `/api/team/invite`, `/api/team/invite/revoke`, `/api/team/members/remove`, `/api/team/summary`, `/api/team/provision`.
- **Clerk webhook sync:** `organization.*`, `organizationMembership.*`, and `organizationInvitation.*` events are handled in `/api/webhooks/clerk` to keep Prisma and Clerk in sync.

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

`PRO_FEATURES` in `lib/features.ts` lists all gated features (e.g. `OFFSET_SETTINGS`, `EXPORT_SCALE_*`, `WATERMARK_REMOVAL`, `SUPPORT_PRIORITY`, `USAGE_LIMIT_ELEVATED`, etc.).

---

## Blog & CMS

A full-featured blog is built into the app:

- **Public routes:** `/blog`, `/blog/[slug]`, `/blog/category/[category]`
- **Admin CRUD:** `/admin/blog` (list/create/edit/delete posts and categories)
- **API routes:** `/api/admin/blog/route.ts` (bulk), `/api/admin/blog/[id]`, `/api/admin/blog/categories`
- **Lib:** `lib/blog.ts` — paginated queries, category management, slug normalization, and rich-text sanitization via `lib/htmlSanitizer.ts`.
- **Components:** `components/blog/BlogSidebar.tsx`, `RelatedPosts.tsx`, `BlogListingStyles.tsx`

Blog posts are stored using the `SitePage` model (shared with editable site pages) and differentiated by type/category.

---

## Site Pages

Editable public pages (Terms, Privacy, Refund Policy, etc.) are managed in the admin:

- **Admin CRUD:** `/admin/pages` (list/create/edit)
- **Public routes:** `/terms`, `/privacy`, `/refund-policy`, `/[slug]` (dynamic catch-all)
- **Lib:** `lib/sitePages.ts` — slug normalization, trash/restore, sanitized rich-text content.
- **Core pages** (Terms, Privacy, Refund Policy) are seeded automatically if they don't exist.

Template variables (e.g. `{{siteName}}`) are interpolated at render time from admin settings.

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

Provider-specific routes (`/api/webhooks/stripe`, `/api/webhooks/paystack`, `/api/webhooks/paddle`) also exist as aliases.

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

By default, uploaded logos are stored on the local filesystem. Switch to S3:

```bash
LOGO_STORAGE="s3"
LOGO_S3_BUCKET="my-bucket-name"
AWS_REGION=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
LOGO_CDN_DOMAIN=""   # Optional: CloudFront distribution domain (recommended)
```

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

The app includes lightweight first-party visit tracking via `lib/visit-tracking.ts` and the `VisitLog` model. Middleware (`POST /api/internal/track-visit`) records visits for admin traffic reporting, skipping API routes, static files, admin routes, and bots. This is an alternative/supplement to Google Analytics for self-hosted analytics.

There is also an optional **Umami** integration. See `ops/README-umami.md` for setup and `ops/UMAMI_LOCAL_SETUP.md` for running Umami locally via Docker.

---

## Moderator Roles

In addition to `ADMIN`, the app supports a **Moderator** role with configurable per-section access.

- **Admin config:** `/admin/moderation` — enable/disable which dashboard sections a moderator can access.
- **Sections available:** `users`, `transactions`, `purchases`, `subscriptions`, `support`, `notifications`, `blog`, `analytics`, `traffic`, `organizations`.
- **Lib:** `lib/moderator.ts` — `MODERATOR_SECTIONS`, access checking helpers.
- **API:** `/api/admin/moderator-actions/route.ts`

Moderators see only the sections their config allows; they cannot change settings, manage plans, or perform billing operations.

---

## Production Setup

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

# Security
ENCRYPTION_SECRET=""           # Encrypt sensitive DB fields
INTERNAL_API_TOKEN=""          # Server-to-server endpoints (/api/internal/*)
HEALTHCHECK_TOKEN=""           # Auth for /api/health detailed output
CRON_PROCESS_EXPIRY_TOKEN=""   # Auth for /api/cron/process-expiry

# Email
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM=""
SUPPORT_EMAIL=""
SEND_ADMIN_BILLING_EMAILS="true"
```

### Health check

```
GET /api/health
Authorization: Bearer <HEALTHCHECK_TOKEN>
```

Returns database connectivity, environment validation (Stripe, Clerk), and runtime diagnostics. Without the token, returns a minimal public response.

### Clerk webhook (production)

1. Go to Clerk Dashboard → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/webhooks/clerk`
3. Enable events: `user.created`, `user.updated`, `organization.*`, `organizationMembership.*`, `organizationInvitation.*`
4. Copy the signing secret into `CLERK_WEBHOOK_SECRET`.

### Stripe webhook (production)

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/stripe/webhook`
3. Enable the recommended events listed in the [Stripe](#stripe) section above.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Multiple comma-separated secrets are supported for rotation:
```bash
STRIPE_WEBHOOK_SECRET="whsec_primary,whsec_rotating"
```

### Support ticket emails

- New tickets/user replies → email to `SUPPORT_EMAIL`.
- Admin replies → email to ticket owner (respects user setting `EMAIL_NOTIFICATIONS`).
- Configure SMTP above; without it, Nodemailer falls back to an in-memory stream transport (emails won't deliver in production).

---

## Self-hosted Deployments

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

---

## Environment Variable Reference

A complete list of supported env vars is in `.env.example`. Key groups:

| Group | Key prefix | Notes |
|---|---|---|
| Database | `DATABASE_URL` | SQLite for dev, Postgres for prod |
| App | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_NAME` | Public-facing URL and branding |
| Auth | `AUTH_PROVIDER`, `CLERK_*`, `AUTH_SECRET` | Choose Clerk or NextAuth |
| Payment | `PAYMENT_PROVIDER`, `STRIPE_*`, `PAYSTACK_*`, `PADDLE_*`, `RAZORPAY_*` | Choose provider |
| Payment prices | `PAYMENT_PRICE_*`, `SUBSCRIPTION_PRICE_*` | One-time and recurring plan price IDs |
| Email | `SMTP_*`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Nodemailer config |
| Storage | `LOGO_STORAGE`, `LOGO_S3_BUCKET`, `AWS_*`, `LOGO_CDN_DOMAIN` | Local fs or S3 |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_*` | Google Analytics 4 |
| Security | `ENCRYPTION_SECRET`, `INTERNAL_API_TOKEN`, `HEALTHCHECK_TOKEN`, `CRON_PROCESS_EXPIRY_TOKEN` | Server-side secrets |
| Dev helpers | `DEV_ADMIN_ID`, `DEV_ADMIN_EMAIL`, `ALLOW_ADMIN_SCRIPT` | Local dev only |

---

## Disclaimer

This codebase is production-oriented but you should review your environment configuration, authentication posture, and security setup before going live. In particular:

- Rotate all secrets before deploying.
- Enable signature verification for all webhooks.
- Use a hosted PostgreSQL instance in production (not SQLite).
- Set `ALLOW_ADMIN_SCRIPT=false` in production.
