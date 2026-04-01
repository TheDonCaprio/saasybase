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
   - [Currency System](#currency-system)
   - [Adding New Providers](#adding-new-providers)
6. [Token System](#token-system)
7. [Team Plans & Organizations](#team-plans--organizations)
8. [Feature Gating](#feature-gating)
9. [Coupon System](#coupon-system)
10. [Blog & CMS](#blog--cms)
11. [Site Pages](#site-pages)
12. [Theming & Branding](#theming--branding)
13. [Email Templates](#email-templates)
14. [Notifications](#notifications)
15. [Support Tickets](#support-tickets)
16. [Contact Page](#contact-page)
17. [Invoice & Refund Receipts](#invoice--refund-receipts)
18. [Webhooks](#webhooks)
19. [Cron Jobs & Expiry Automation](#cron-jobs--expiry-automation)
20. [File & Logo Storage (S3)](#file--logo-storage-s3)
21. [Analytics (Google Analytics 4)](#analytics-google-analytics-4)
22. [Visit Tracking](#visit-tracking)
23. [Moderator Roles](#moderator-roles)
24. [Rate Limiting](#rate-limiting)
25. [Logging & Audit Trail](#logging--audit-trail)
26. [Security](#security)
27. [Dark Mode](#dark-mode)
28. [Testing](#testing)
29. [Admin Dashboard Overview](#admin-dashboard-overview)
30. [Production Setup](#production-setup)
31. [Self-hosted Deployments](#self-hosted-deployments)
32. [Environment Variable Reference](#environment-variable-reference)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | **Clerk** or **NextAuth (Auth.js v5)** — switchable via `AUTH_PROVIDER` |
| Payment | **Stripe**, **Paystack**, **Paddle**, **Razorpay** — switchable via `PAYMENT_PROVIDER` |
| Database | Prisma ORM · SQLite (dev) · PostgreSQL / MySQL (prod) |
| Styling | Tailwind CSS |
| Rich Text Editor | TipTap (blog posts, site pages, email templates) |
| Email | Nodemailer (SMTP) or Resend, switchable via `EMAIL_PROVIDER` |
| Analytics | Google Analytics 4 (via Data API) |
| PDF Generation | pdf-lib (invoices, refund receipts) |
| Validation | Zod |
| Testing | Vitest (unit) · Playwright (E2E) |
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

# 4. Seed the database
npx prisma db seed

# 5. Start dev server
npm run dev
```

When you run `npx prisma db seed` in an interactive terminal, the seed script prompts for the initial admin email and password instead of always using a hardcoded default. For CI or non-interactive environments, you can predefine `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; otherwise it falls back to `admin@saasybase.com` / `password`.u

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

The app ships with **two fully implemented auth providers**. Switch between them using the `AUTH_PROVIDER` environment variable (defaults to `clerk`).

```bash
# .env.local
AUTH_PROVIDER="clerk"     # Options: "clerk", "nextauth"
```

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

NextAuth supports **credentials** (email + password), **GitHub OAuth**, **Google OAuth**, and **magic link** out of the box — enable the ones you need in `lib/nextauth.config.ts`. All app email flows, including auth emails, send through the shared mail layer and can use either Nodemailer or Resend via `EMAIL_PROVIDER`.

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

- **Provisioning:** When a qualifying subscription activates, `ensureTeamOrganization` creates or updates an organization, assigns a deterministic slug, and mirrors metadata to Clerk (if using Clerk).
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

`/admin/emails` — WYSIWYG editor for all email templates. Each template supports HTML and plain text versions with `{{variable}}` placeholders.

### Built-in Templates

| Template Key | When Sent |
|---|---|
| `welcome` | User registers and verifies email |
| `subscription_extended` | Existing subscription is extended |
| `subscription_upgraded` | User upgrades from non-recurring to recurring plan |
| `token_topup` | User purchases additional tokens/credits |
| `tokens_credited` | Admin credits tokens to a user |
| `tokens_debited` | Admin debits tokens from a user |
| `admin_assigned_plan` | Admin assigns a plan to a user |
| `team_invitation` | User is invited to join an organization |
| `admin_notification` | Admin billing alert emails |

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

58+ test files covering:
- Payment provider flows (Stripe, Paystack, Paddle, Razorpay, Lemon Squeezy)
- Webhook handling and event normalization
- Subscription lifecycle (checkout, proration, cancellation, resurrection)
- Team/organization operations
- Token spending and organization scoping
- Auth flows and route guards
- Admin operations and sorting/filtering

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
- **Maintenance Tools** (`/admin/maintenance`) — cleanup and repair utilities
- **System Logs** (`/admin/logs`) — persisted WARN/ERROR logs with filtering
- **Onboarding** (`/dashboard/onboarding`) — guided setup for new users

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

# Currency (optional, defaults to provider default)
PAYMENTS_CURRENCY="USD"

# Security
ENCRYPTION_SECRET=""           # Encrypt sensitive DB fields
INTERNAL_API_TOKEN=""          # Server-to-server endpoints (/api/internal/*)
HEALTHCHECK_TOKEN=""           # Auth for /api/health detailed output
CRON_PROCESS_EXPIRY_TOKEN=""   # Auth for /api/cron/process-expiry

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

### Support ticket emails

- New tickets/user replies → email to `SUPPORT_EMAIL`.
- Admin replies → email to ticket owner (respects user setting `EMAIL_NOTIFICATIONS`).
- If `EMAIL_PROVIDER="nodemailer"`, configure SMTP above; without it, Nodemailer falls back to an in-memory stream transport (emails won't deliver in production).
- If `EMAIL_PROVIDER="resend"`, set `RESEND_API_KEY`; SMTP settings are not used.

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
| Currency | `PAYMENTS_CURRENCY`, `PADDLE_CURRENCY`, `PAYSTACK_CURRENCY`, `RAZORPAY_CURRENCY` | Payment currency configuration |
| Email | `EMAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Switch between SMTP/Nodemailer and Resend |
| Geolocation | `IPINFO_LITE_TOKEN` | Optional; activity geolocation falls back to `country.is` when unset |
| Storage | `LOGO_STORAGE`, `LOGO_S3_BUCKET`, `AWS_*`, `LOGO_CDN_DOMAIN` | Local fs or S3 |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_*` | Google Analytics 4 |
| Security | `ENCRYPTION_SECRET`, `INTERNAL_API_TOKEN`, `HEALTHCHECK_TOKEN`, `CRON_PROCESS_EXPIRY_TOKEN` | Server-side secrets |
| Paddle sandbox | `PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_ENV`, `PADDLE_API_BASE_URL` | Sandbox/production toggle |
| Dev helpers | `DEV_ADMIN_ID`, `DEV_ADMIN_EMAIL`, `ALLOW_ADMIN_SCRIPT` | Local dev only |

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
