![SaaSyBase](https://dxca1h3kz76b5.cloudfront.net/logo/logo-1778407425484.png)

# SaaSyBase

A production-ready SaaS boilerplate built with **Next.js 16 App Router**, a **multi-provider auth system** (Clerk, Better Auth, or NextAuth), a **multi-payment provider architecture** (Stripe, Paystack, Paddle, Razorpay), **Prisma 7** with a committed PostgreSQL migration baseline, and a full-featured admin dashboard.

For the app&apos;s built-in documentation, start with `/docs/getting-started`, `/docs/seo-and-discoverability`, `/docs/deployment`, and `/docs/secrets`. The repository markdown files are the deeper operator notes and copy-paste examples behind those pages.

## Sponsor SaaSyBase

Support ongoing development via [GitHub Sponsors](https://github.com/sponsors/TheDonCaprio) or [Stripe](https://donate.stripe.com/eVqeVe8Joe8p5dvgs37IY02).

## What Is SaaSyBase?

SaaSyBase is a **complete SaaS foundation** — not a starter template. It gives you everything a real SaaS product needs out of the box: authentication, subscription billing with four payment providers, a token/credit system, team/organization support, an admin dashboard, email templates, a blog CMS, support tickets, and more.

**Who is it for?**

- **Professional developers** who want a battle-tested architecture to build on, with clean abstractions, 500+ unit tests, and production-hardened patterns.
- **Vibecoders and AI-assisted builders** (Cursor, Lovable, Windsurf, etc.) who want a working SaaS backend they can scaffold their app into without building billing, auth, and admin from scratch.

You plug in your own product logic — SaaSyBase handles the business infrastructure.

---

## Table of Contents

1. [Sponsor SaaSyBase](#sponsor-saasybase)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Core Scripts](#core-scripts)
6. [Authentication](#authentication)
7. [Admin Setup](#admin-setup)
8. [Payment Providers](#payment-providers)
   - [Stripe](#stripe)
   - [Paystack](#paystack)
   - [Paddle](#paddle)
   - [Razorpay](#razorpay)
   - [Provider Feature Matrix](#provider-feature-matrix)
   - [Currency System](#currency-system)
   - [Adding New Providers](#adding-new-providers)
9. [Token System](#token-system)
10. [Team Plans & Organizations](#team-plans--organizations)
11. [Feature Gating](#feature-gating)
12. [Coupon System](#coupon-system)
13. [Blog & CMS](#blog--cms)
14. [Site Pages](#site-pages)
15. [SEO & Discoverability](#seo--discoverability)
16. [Theming & Branding](#theming--branding)
17. [Email Templates](#email-templates)
18. [Notifications](#notifications)
19. [Support Tickets](#support-tickets)
20. [Contact Page](#contact-page)
21. [Invoice & Refund Receipts](#invoice--refund-receipts)
22. [Webhooks](#webhooks)
23. [Cron Jobs & Expiry Automation](#cron-jobs--expiry-automation)
24. [File & Logo Storage (S3)](#file--logo-storage-s3)
25. [Analytics (Google Analytics 4)](#analytics-google-analytics-4)
26. [Visit Tracking](#visit-tracking)
27. [Maintenance Mode](#maintenance-mode)
28. [Session Activity](#session-activity)
29. [Moderator Roles](#moderator-roles)
30. [Rate Limiting](#rate-limiting)
31. [Logging & Audit Trail](#logging--audit-trail)
32. [Security](#security)
33. [Dark Mode](#dark-mode)
34. [Testing](#testing)
35. [Admin Dashboard Overview](#admin-dashboard-overview)
36. [User Dashboard Overview](#user-dashboard-overview)
37. [Production Setup](#production-setup)
38. [Self-hosted Deployments](#self-hosted-deployments)
39. [Environment Variable Reference](#environment-variable-reference)
40. [Demo Read-Only Mode](#demo-read-only-mode)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | **Clerk** or **NextAuth (Auth.js v5)** — switchable via `AUTH_PROVIDER` |
| Payment | **Stripe**, **Paystack**, **Paddle**, **Razorpay** — switchable via `PAYMENT_PROVIDER` |
| Database | Prisma 7 ORM · PostgreSQL migration baseline · see the database guide for provider-switching rules |
| Styling | Tailwind CSS |
| Rich Text Editor | TipTap (blog posts and editable site pages) |
| Email | Nodemailer (SMTP) or Resend, switchable via `EMAIL_PROVIDER` |
| Analytics | Google Analytics 4 (via Data API) + built-in visit tracking |
| PDF Generation | pdf-lib (invoices, refund receipts) |
| Validation | Zod |
| Testing | Vitest (unit/integration) + manual regression checks |
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
│   ├── auth-provider/      # Auth abstraction layer (Clerk / NextAuth / Better Auth)
│   ├── payment/            # Payment abstraction layer (Stripe / Paystack / Paddle / Razorpay)
│   │   ├── providers/      # Individual provider implementations
│   │   ├── types.ts        # PaymentProvider interface
│   │   ├── service.ts      # Payment service orchestration
│   │   └── webhook-router.ts # Unified webhook routing
│   ├── email.ts            # Email sending (Nodemailer / Resend)
│   ├── email-templates.ts  # 27 built-in email templates
│   ├── settings.ts         # Admin settings system (50+ keys)
│   ├── features.ts         # Feature gating registry
│   └── ...                 # Tokens, teams, coupons, notifications, etc.
├── prisma/
│   ├── schema.prisma       # Database schema (25+ models)
│   └── seed.ts             # Database seeding script
├── scripts/                # Operational scripts (backfills, admin tools)
├── tests/                  # 500+ Vitest unit/integration tests across 140+ files
├── docs/                   # Implementation guides and internal notes
├── ops/                    # Production operations (indexes, runbooks)
└── .env.example            # Full environment variable template
```

### Route groups and URLs

The repo uses Next.js route groups to keep admin and dashboard layouts isolated without changing the browser URL.

- Files under `app/admin/(valid)/...` are served under `/admin/...`.
- Files under `app/dashboard/(valid)/...` are served under `/dashboard/...`.
- `app/admin/[...slug]/page.tsx` and `app/dashboard/[...slug]/page.tsx` exist as fallback catch-all routes, so the filesystem is intentionally more complex than the public URL structure.

Examples:

- `app/admin/(valid)/theme/page.tsx` renders `/admin/theme`
- `app/dashboard/(valid)/team/page.tsx` renders `/dashboard/team`
- `app/admin/(valid)/logs/page.tsx` renders `/admin/logs`
- `app/docs/api/page.tsx` renders `/docs/api`

> **Tip for vibecoders:** Most of your custom app code will go in `app/dashboard/` (user-facing pages), `components/` (UI), and `lib/` (business logic). The payment, auth, and admin infrastructure is already built — you're extending it, not rebuilding it.

### AI context files

If you work with GitHub Copilot, Cursor, Claude Code, Windsurf, or another coding agent, read these repo-root files early:

- **`AGENTS.md`** — specialized AI agent personas and their codebase focus areas
- **`CLAUDE.md`** — project rules, architecture notes, quick reference, and common pitfalls
- **`INSTRUCTIONS.md`** — additional implementation guidance and conventions

These files explain project-specific requirements like using the auth/payment abstractions, checking both generic and legacy provider ID fields, and running the right regression tests for core infrastructure changes.

## Quick Start

> **Requires:** Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`, plus npm.

Node 18 is no longer supported. The current stack depends on Next.js 16 and Prisma 7, and Prisma 7 sets the effective minimum runtime floor.

```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Install dependencies
npm install

# 3. Point DATABASE_URL at PostgreSQL and apply the committed migration history
npm run prisma:deploy

# 4. Seed the database (prompts for admin email/password)
npx prisma db seed

# 5. Start dev server
npm run dev
```

The committed Prisma migration history in this repo is now **PostgreSQL-only**. `DATABASE_URL` selects which PostgreSQL database Prisma targets, but it does **not** switch the Prisma connector itself, and Prisma 7 does not allow `provider = env("DATABASE_PROVIDER")` in `schema.prisma`.

If `npm run prisma:deploy` reports an old failed migration on what you expected to be a fresh install, check which `DATABASE_URL` Prisma actually resolved. `.env.local`, `.env.development`, `.env`, or an enabled secrets provider such as Doppler or Infisical can still override your intended target and point Prisma at an older database.

If the issue persists, you should use npx prisma migrate reset (only if you're sure you're targeting a fresh database or a db you wouldn't mind resetting).

If you are moving from an older SQLite-based local setup to PostgreSQL and hit `P3019`, use the recovery flow in [docs/prisma-provider-migrations.md](docs/prisma-provider-migrations.md).

### Choose your database

You have three normal paths:

- Local PostgreSQL, recommended: run PostgreSQL on your own machine with the official installer or the official Docker image.
- Hosted PostgreSQL, easiest production path: use any managed provider that gives you a normal PostgreSQL connection string.
- Local SQLite, separate local-only lane: fine for throwaway prototyping, but it is **not** compatible with the committed PostgreSQL migration history in this repo. Do not expect SQLite migrations or `dev.db` files to deploy cleanly to PostgreSQL later.

Useful official docs and provider guides:

- Postgres.app for macOS: <https://postgresapp.com/>
- EDB PostgreSQL Interactive Installer: <https://www.enterprisedb.com/downloads/postgres-postgresql-downloads>
- pgAdmin downloads: <https://www.pgadmin.org/download/>
- PostgreSQL downloads: <https://www.postgresql.org/download/>
- PostgreSQL Docker image: <https://hub.docker.com/_/postgres>
- Neon docs: <https://neon.com/docs>
- Supabase database docs: <https://supabase.com/docs/guides/database>
- Railway PostgreSQL docs: <https://docs.railway.com/guides/postgresql>
- Render PostgreSQL docs: <https://render.com/docs/postgresql>

If you want the easiest native local setup:

- macOS: Postgres.app is usually the fastest path.
- Windows/macOS/Linux: the official interactive PostgreSQL installer from EDB is a straightforward guided setup.
- GUI management: pgAdmin is useful for creating databases and inspecting schema state, but it is not the PostgreSQL server itself.

Typical local PostgreSQL shape:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public"
```

Smallest SQLite-only prototype path:

```bash
DATABASE_URL="file:./dev.db"
```

Typical hosted PostgreSQL shape:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
```

After running `npm run dev`, open [http://localhost:3000](http://localhost:3000). You'll see the landing page. Sign in at `/sign-in` or go to `/admin` once you've set up an admin user (see [Admin Setup](#admin-setup)).

If you access local development through a custom hostname or tunnel instead of plain `localhost`, set `ALLOWED_DEV_ORIGINS` in `.env.local`. Example: `ALLOWED_DEV_ORIGINS="app.localhost.test,*.ngrok-free.dev"`. Leave it empty for normal localhost development, and restart the dev server after changing it.

With Prisma 7, seeding only runs when you explicitly invoke `npx prisma db seed`; `prisma generate`, `prisma migrate dev`, and `prisma migrate reset` no longer trigger it automatically. When you run `npx prisma db seed` in an interactive terminal, the seed script prompts for the initial admin email and password instead of always using a hardcoded default. To skip admin creation explicitly, run `npx prisma db seed -- --skip-admin`. For CI or other non-interactive environments, set `SEED_ADMIN_PASSWORD` and optionally `SEED_ADMIN_EMAIL` to create the admin without a prompt.

If you want the shipped admin dashboards, user dashboard, and long lists to look populated during local development, run `npm run demo:seed` after the normal bootstrap seed. That script inserts demo-namespaced sample users, payments, organizations, tickets, notifications, and blog content so you can inspect the UI with realistic data. Treat it as a local-only sandbox helper, not as staging or production seed data.

> **Database note:** the shared Prisma schema and committed migration history are PostgreSQL. Use PostgreSQL for any workflow that relies on `npm run prisma:deploy` or committed migrations. If you still prototype with SQLite locally, treat that as a separate disposable lane and do not carry its migrations into production.

### Alternative dev scripts

| Script | Description |
|---|---|
| `npm run dev` | Standard dev server (webpack) |
| `npm run dev:turbo` | Dev server with Turbopack (faster cold starts) |
| `npm run dev:full` | Dev server + Stripe CLI listener in parallel |

> **Env validation:** A `validate-env.js` script runs automatically before `dev` and `build` via npm predev/prebuild hooks. It checks for required variables and logs warnings for missing optional ones.

## Core Scripts

These are the commands most people actually need when working on or operating the project.

| Command | When to use it |
|---|---|
| `npm run dev` | Start the local app |
| `npm run dev:turbo` | Faster local startup with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run typecheck` | Validate TypeScript before a deploy or PR |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit/integration tests |
| `npm run prisma:studio` | Open Prisma Studio using the repo's Prisma config |
| `npm run prisma:migrate` | Create and apply a new PostgreSQL Prisma migration when you change the schema |
| `npm run prisma:deploy` | Apply the committed PostgreSQL migration history to a fresh or deployed database |
| `npm run prisma:diagnose-provider` | Print the resolved `DATABASE_URL` provider and the schema provider before you migrate |
| `npm run secrets:doctor` | Run the provider command directly and report the detected output shape before boot |
| `npm run backfill:team-subscription-org-links` | Repair legacy organization/subscription links |

`npm run prisma:migrate` and `npm run prisma:deploy` explicitly pass `--config prisma.config.ts`, so Prisma CLI commands read the same env precedence as the app (`.env.local` → `.env.development` → `.env`). If you have a secrets provider enabled, it can still fill missing values, so confirm the resolved `DATABASE_URL` before migrating.

If you are new to the repo, the normal local loop is: `npm install` → set a PostgreSQL `DATABASE_URL` → `npm run prisma:diagnose-provider` → `npm run prisma:deploy` → `npx prisma db seed` → `npm run dev`.

---

## Authentication

The app ships with **three fully implemented auth providers**. Switch between them using the `AUTH_PROVIDER` environment variable.

> **Auth switching boundary:** Clerk is still a separate migration lane because identities live in Clerk's cloud. NextAuth and Better Auth now share the repo's self-hosted Prisma auth lane, so you can switch between those two without exporting/importing user data. The practical caveat is session continuity: depending on the current rows and cookies in play, a provider switch can still force users to sign in again even when the user/account data is already compatible.

```bash
# .env.local
AUTH_PROVIDER="betterauth"  # Options: "clerk", "nextauth", "betterauth"
```

> **Default behavior:** The `.env.example` template ships with `AUTH_PROVIDER="betterauth"` so you can start locally without any third-party accounts. The code's internal fallback is also `betterauth` if the variable is unset, so new setups land on the preferred self-hosted lane by default.

`next.config.mjs` automatically exposes this as `NEXT_PUBLIC_AUTH_PROVIDER` to the client bundle so that the auth abstraction layer (`lib/auth-provider`) can DCE (dead-code eliminate) the unused provider at build time.

The abstraction layer (`lib/auth-provider/`) defines a full `AuthProvider` interface with feature detection, mirroring the payment provider pattern. Every method (session, user management, organizations, webhooks, middleware) is provider-agnostic — the rest of the codebase never imports vendor-specific modules directly.

### Clerk

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""
CLERK_WEBHOOK_SECRET=""   # Required for webhook-driven user init and welcome emails
```

- UI components (`<AuthSignIn>`, `<AuthSignUp>`, `<AuthLoaded>`, `<AuthLoading>`, etc.) are re-exported from `lib/auth-provider/client/components` and switch automatically.
- Clerk's `ClerkProvider` wraps the app in `components/AppAuthProvider.tsx` with automatic dark mode theming via a `MutationObserver` on the `<html>` class.
- Clerk organizations are synced to the local DB via webhooks, while Better Auth and NextAuth use the self-hosted organization lane exposed through the auth abstraction.

### Better Auth

```bash
AUTH_PROVIDER="betterauth"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET=""   # Generate with: npx auth secret
AUTH_SECRET=""          # Keep aligned with BETTER_AUTH_SECRET
NEXTAUTH_SECRET=""      # Optional compatibility fallback
# Optional OAuth providers:
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Better Auth supports local credentials, GitHub OAuth, Google OAuth, magic links, and app-managed organizations while still routing through the same `lib/auth-provider/` abstraction as Clerk and NextAuth. It is the preferred self-hosted provider lane when you want built-in organization primitives without depending on Clerk.

Better Auth and NextAuth are intentionally kept on a shared self-hosted data lane in this repo. User rows, credential hashes, OAuth account mappings, and verification-state compatibility are normalized so that switching between `AUTH_PROVIDER="nextauth"` and `AUTH_PROVIDER="betterauth"` does not require a separate user-data migration.

#### Better Auth GitHub OAuth setup

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

#### Better Auth Google OAuth setup

1. **Select or Create a Project:** Go to the [Google Cloud Console](https://console.cloud.google.com/). Click the project dropdown in the top navigation bar and select an existing project or click "New Project" to create one dedicated to your application.
2. **Configure OAuth Consent Screen:** Navigate to **APIs & Services** → **OAuth consent screen** (or **Google Auth Platform**). Choose **External** user type, then fill in your App Name, support email, and developer contact information. Complete the setup wizard.
3. **Create OAuth Client:** From the Google Auth Platform Overview, click **Create OAuth client** (or navigate to **Clients** on the left menu and click Create). Choose **Web application** as the Application type and give it a name (e.g., "SaaSyBase Login").
4. **Add Authorized JavaScript origins:** Under that section, click "Add URI".
  - Local: `http://localhost:3000`
  - Production: `https://your-domain.com`
5. **Add Authorized redirect URIs:** Under that section, click "Add URI".
  - Local: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://your-domain.com/api/auth/callback/google`
6. Click **Create**. A modal will appear with your Client ID and Client Secret. Copy them into your `.env.local` file:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

#### Better Auth OAuth configuration notes

- Keep `AUTH_PROVIDER="betterauth"`.
- Keep `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` aligned with the exact base URL you registered with GitHub and Google.
- The sign-in and sign-up UI only shows GitHub and Google buttons when the corresponding provider is fully configured.
- Leaving the GitHub or Google env vars blank disables that provider cleanly without breaking credentials or magic-link auth.

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

1. **Select or Create a Project:** Go to the [Google Cloud Console](https://console.cloud.google.com/). Click the project dropdown in the top navigation bar and select an existing project or click "New Project" to create one dedicated to your application.
2. **Configure OAuth Consent Screen:** Navigate to **APIs & Services** → **OAuth consent screen** (or **Google Auth Platform**). Choose **External** user type, then fill in your App Name, support email, and developer contact information. Complete the setup wizard.
3. **Create OAuth Client:** From the Google Auth Platform Overview, click **Create OAuth client** (or navigate to **Clients** on the left menu and click Create). Choose **Web application** as the Application type and give it a name (e.g., "SaaSyBase Login").
4. **Add Authorized JavaScript origins:** Under that section, click "Add URI".
  - Local: `http://localhost:3000`
  - Production: `https://your-domain.com`
5. **Add Authorized redirect URIs:** Under that section, click "Add URI".
  - Local: `http://localhost:3000/api/auth/callback/google`
  - Production: `https://your-domain.com/api/auth/callback/google`
6. Click **Create**. A modal will appear with your Client ID and Client Secret. Copy them into your `.env.local` file:

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
- Organization primitives stay primarily app-managed in the NextAuth lane, without external provider sync.
- Email verification uses an in-app pending-change flow (`lib/nextauth-email-verification.ts`).

---

## Admin Setup

### Development

1. Create the initial admin during `npx prisma db seed`, or promote an existing local user in Prisma Studio.
2. If promoting manually, set the user's `role` to `ADMIN` in the `User` table.
3. Sign in again and verify `/admin` loads.

### Database seed

For a fresh local database, run `npx prisma db seed` to create the initial admin user during setup. The seed script prompts for the admin email and password in an interactive terminal, and it also supports non-interactive creation with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

### Production

**Option 1 — Direct SQL (most secure)**
```sql
UPDATE "User" SET role = 'ADMIN' WHERE id = 'user_xxxxxxxxxxxxx';
```

**Option 2 — Seed the first admin user**

For a fresh production database, `npx prisma db seed` also lets you set up the initial admin user before opening the app to real traffic.

> 💡 With Clerk, you can find the provider user ID in the Clerk dashboard. With either auth provider, you can inspect the local DB via `npm run prisma:studio`.

---

## Payment Providers

Select the active provider:

```bash
PAYMENT_PROVIDER="stripe"   # Options: "stripe", "paystack", "paddle", "razorpay"
```

All providers share a common checkout → webhook → subscription lifecycle. The app routes new transactions to the active provider; existing transactions are handled by the provider recorded in their `paymentProvider` field.

> **Note:** A Lemon Squeezy provider implementation exists in `lib/payment/providers/lemonsqueezy.ts` but is **archived** and not wired into the active provider registry. It is kept for reference only.

### Plan Catalog Sync

Seeded plans automatically receive provider-generated price IDs during `npx prisma db seed` when catalog auto-create is enabled for the active payment provider. You do not need to hand-maintain plan ID env vars for the shipped plans.

If you create new plans later, the same provider sync path can populate their IDs into the database.

### Multi-Currency Pricing

Plans support **per-provider localized pricing** via the `PlanPrice` model. This allows different prices in different currencies for each payment provider:

```
PlanPrice {
  planId, provider, currency, amountCents, externalPriceId
}
```

For example, a plan can have a $10 USD price on Stripe and a ₦15,000 NGN price on Paystack simultaneously.

**Current UI reality:** the shipped admin plan modal does **not** yet expose full `PlanPrice` CRUD management. It supports the base plan fields, recurring cadence, token/team metadata, and advanced external provider price ID overrides. If you need full localized price-row management today, use seed/sync flows, Prisma Studio, direct data tooling, or build additional admin UI.

### Auto-creating Provider Price IDs

```bash
PAYMENT_AUTO_CREATE="true"
```

When enabled, saving a plan without a provider price ID will auto-create catalog objects for configured payment providers where supported.

In the admin plan creation modal, the manual provider price ID field is intentionally treated as an advanced override and appears at the bottom of the form. Leave it blank for the normal flow. Fill it only when you are importing an existing provider catalog entry, migrating legacy plans, or operating with auto-create disabled.

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

**Webhook endpoint:** `/api/webhooks/payments` (centralized, preferred), `/api/webhooks/stripe`, or `/api/stripe/webhook`

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
# Sandbox / live selection:
PADDLE_ENV="sandbox"
NEXT_PUBLIC_PADDLE_ENV="sandbox"

# Only needed when provider-side catalog sync is enabled
PAYMENT_AUTO_CREATE="true"
PADDLE_DEFAULT_TAX_CATEGORY="standard" # Required for auto-creation of products/prices
```

The minimal Paddle setup is five values: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_ENV`, and `NEXT_PUBLIC_PADDLE_ENV`. Keep `PAYMENT_AUTO_CREATE`, `PADDLE_DEFAULT_TAX_CATEGORY`, `PADDLE_CURRENCY`, `PADDLE_WEBHOOK_TOLERANCE_SECONDS`, and `PADDLE_DEBUG_SUBSCRIPTION_UPDATES` for advanced or provider-sync-specific cases.

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

**Webhook endpoint:** `/api/webhooks/payments` (centralized ingress only; no dedicated Razorpay alias route is currently shipped)

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
| Manage payment experience | ✅ Hosted portal | Subscription short_url best effort | ✅ Hosted portal | Subscription short_url best effort |
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

See the public docs page at `/docs/adding-payment-provider` for the overview, and [`docs/adding-payment-providers.md`](docs/adding-payment-providers.md) for the deeper implementation guide.

### Public Export

`npm run public:export` builds a sanitized tree in `dist/public-export` from tracked files plus the exclusions in `public-export.config.json`.

The public export intentionally omits:

- internal planning notes like `docs/better-auth-migration-feasibility.md`
- one-off/private migration helpers like `scripts/backfill-better-auth-coexistence.ts`
- operational runbooks, public-history tooling, generated docs-search artifacts, local DB files, and the in-app docs source under `app/docs/`

Public implementation guides that are useful to downstream users, such as [`docs/adding-payment-providers.md`](docs/adding-payment-providers.md), remain included.

The public export now keeps `scripts/seed-demo.ts`, so downstream users can run `npm run demo:seed` locally if they want to inspect the shipped admin/dashboard UI with populated sample data. That helper is for local development only and should not be used to seed staging or production environments.

---

## Token System

The app ships with a multi-bucket token system for metering usage:

| Bucket | Field | Purpose |
|---|---|---|
| **Paid personal tokens** | `User.tokenBalance` | Granted by plan purchases and top-ups. Configurable expiry and renewal behavior. |
| **Free-plan tokens** | `User.freeTokenBalance` | Granted by the free plan using configurable renewal rules. |
| **Organization shared balance** | `Organization.tokenBalance` | Shared workspace pool used by `SHARED_FOR_ORG` organizations. |
| **Organization member allocation** | `OrganizationMembership.sharedTokenBalance` | Per-member workspace balance used by `ALLOCATED_PER_MEMBER` organizations. |

### Token Spending

**Internal API endpoint (protected by `INTERNAL_API_TOKEN`):**

`POST /api/internal/spend-tokens` — Deducts tokens. Accepts a `bucket` parameter:

| Bucket | Behavior |
|---|---|
| `auto` | Context-aware selection: shared-only in organization context, or paid-then-free in personal context |
| `paid` | Only deducts from paid tokens |
| `free` | Only deducts from free tokens |
| `shared` | Deducts from the active organization context |

There is also a first-party user route at `POST /api/user/spend-tokens` with the same bucket semantics for authenticated product flows.

In practice, `auto` now follows the active workspace boundary instead of blending balances across contexts:

- In an organization workspace, `auto` spends from shared workspace balance only.
- In a personal workspace, `auto` spends from paid first and then free.
- `auto` never silently falls back from a workspace request into personal paid/free balance, and it never reaches into shared workspace balance from a personal workspace.

### Organization Token Pools

When a user belongs to a team plan, the organization has its own token system:

| Field | Purpose |
|---|---|
| `Organization.tokenBalance` | Shared workspace balance used by `SHARED_FOR_ORG` workspaces |
| `Organization.tokenPoolStrategy` | Workspace token mode: `SHARED_FOR_ORG` or `ALLOCATED_PER_MEMBER` |
| `Organization.memberTokenCap` | Optional per-member limit for shared-pool workspaces |
| `Organization.memberCapStrategy` | `SOFT`, `HARD`, or `DISABLED` enforcement for shared-pool workspaces |
| `Organization.memberCapResetIntervalHours` | How often shared-pool member usage windows reset |
| `OrganizationMembership.sharedTokenBalance` | Per-member allocated balance used by `ALLOCATED_PER_MEMBER` workspaces |
| `OrganizationMembership.memberTokenUsage` | Per-member usage tracking within the window |
| `OrganizationMembership.memberTokenCapOverride` | Per-member cap exception |

SaaSyBase now supports two distinct team token strategies:

- `SHARED_FOR_ORG`: the workspace has one shared balance and optional per-member cap rules.
- `ALLOCATED_PER_MEMBER`: each active member gets their own balance on `OrganizationMembership.sharedTokenBalance`, and shared-pool cap management is hidden in the dashboard because it does not apply.

Token grants, renewals, one-time top-ups, and pending-activation flows all branch on the effective team strategy.

### Other Internal Endpoints

- `POST /api/internal/track-visit` — Records a visit log entry.
- `POST /api/internal/payment-scripts` — Payment-related script operations.

### Settings That Drive the Token System

- `initializeNewUserTokens` — allocates starter tokens on first user creation.
- `resetUserTokensIfNeeded` — resets free tokens monthly (checked on every dashboard visit).
- `shouldResetPaidTokensOnExpiry` / `shouldResetPaidTokensOnRenewal` — configurable in admin settings.

The admin settings surface also exposes the paid-token operations controls under `/admin/settings`:

| Setting | Purpose |
|---|---|
| `FREE_PLAN_TOKEN_LIMIT` | Amount granted to free-plan users |
| `FREE_PLAN_RENEWAL_TYPE` | Renewal cadence for free-plan balance (`daily`, `monthly`, `one-time`, `unlimited`) |
| `FREE_PLAN_TOKEN_NAME` | Optional free-plan-specific token label |
| `TOKENS_RESET_ON_EXPIRY_ONE_TIME` | Reset paid tokens when a one-time plan expires |
| `TOKENS_RESET_ON_EXPIRY_RECURRING` | Reset paid tokens when a recurring plan naturally expires |
| `TOKENS_RESET_ON_RENEWAL_ONE_TIME` | Reset paid tokens on one-time renewal-style flows |
| `TOKENS_RESET_ON_RENEWAL_RECURRING` | Reset paid tokens on recurring renewals |
| `TOKENS_NATURAL_EXPIRY_GRACE_HOURS` | Grace window before natural-expiry cleanup clears paid tokens and applies the organization access cleanup policy |
| `ORGANIZATION_EXPIRY_MODE` | Expiry policy for organization access: suspend workspaces by default or dismantle them explicitly |

`ORGANIZATION_EXPIRY_MODE` currently supports two operational modes:

- `SUSPEND` — preserve the local workspace record, expire invites, remove provider-side access when applicable, and show an in-dashboard suspension notice.
- `DISMANTLE` — fully tear down the workspace and related access instead of leaving it in a recoverable suspended state.

---

## Team Plans & Organizations

Team subscriptions provision managed organizations and keep them in sync with billing status.

- **Provisioning:** When a qualifying subscription activates, `ensureTeamOrganization` creates or updates an organization, assigns a deterministic slug, and mirrors metadata to the active auth provider when that provider supports organization primitives. In practice, that means an active team plan whose plan has `supportsOrganizations: true` and is not in a proration-pending state.
- **Token strategies:** Team plans can use either a shared workspace pool or allocated-per-member balances. The effective dashboard strategy follows the attached team plan so older organizations with legacy defaults still render correctly.
- **Member entitlements:** When a workspace uses `ALLOCATED_PER_MEMBER`, joining members receive the plan token allowance in their membership balance, renewals reset those balances, and top-ups/extensions credit each active member instead of the org pool.
- **Cleanup:** `syncOrganizationEligibilityForUser` runs whenever subscription status changes (checkout, activation, webhook, admin override). When a plan lapses beyond the grace window, the helper suspends workspace access by default, clears member access, and can be switched to full dismantling through `ORGANIZATION_EXPIRY_MODE`.
- **Admin intervention:** admins can explicitly suspend and later restore an organization from `/admin/organizations`. Suspended workspaces keep their local record, show a workspace notice in the dashboard, and use the owner email as the billing-contact fallback when no dedicated billing email is stored.
- **Dashboard:** `/dashboard/team` hosts the management UI with invites, member removal, provisioning refresh, strategy-aware balance labels, and shared-pool cap controls that only appear when the workspace actually uses `SHARED_FOR_ORG`.
- **Invite acceptance:** `/invite/[token]` — token-based invite acceptance page for new and existing users.
- **API routes:** `/api/team/invite`, `/api/team/invite/revoke`, `/api/team/members/remove`, `/api/team/summary`, `/api/team/provision`, `/api/team/settings`.
- **Clerk webhook sync:** `organization.*`, `organizationMembership.*`, and `organizationInvitation.*` events are handled in `/api/webhooks/clerk` to keep Prisma and Clerk in sync.

### Workspace switching

Users can move between their personal workspace and team workspaces.

- **UI switcher:** the dashboard sidebar footer renders the auth-provider organization switcher
- **App-managed switching:** `POST /api/user/active-org` stores or clears the active organization in an httpOnly cookie
- **Why it matters:** billing, plan scope, token spending, checkout metadata, and team pages all follow the active workspace context

If a user accepts a team invite, the client attempts to activate that workspace immediately before navigating them into `/dashboard/team`.

### Plan Schema for Teams

```prisma
Plan {
  scope              String  @default("INDIVIDUAL") // "INDIVIDUAL" or "TEAM"
  supportsOrganizations  Boolean @default(false)
  organizationSeatLimit  Int?
  organizationTokenPoolStrategy String? @default("SHARED_FOR_ORG") // or "ALLOCATED_PER_MEMBER"
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

## SEO & Discoverability

SaaSyBase ships with an admin-managed SEO system centered on `/admin/settings` → `SEO`.

### What the admin SEO tab controls

- **Homepage metadata:** title, description, canonical URL, homepage social title, homepage social description, homepage social image
- **Sitewide title composition:** a suffix or a full template containing `%s`
- **Global social fallbacks:** default Open Graph / Twitter title, description, and image for routes that do not define their own social copy
- **Blog discoverability:** `/blog` title and description, blog index no-index, and blog category no-index defaults
- **Sitemap management:** custom same-site URLs plus exact sitemap exclusions
- **Verification:** Google and Bing verification tokens
- **Robots.txt:** a dedicated editor for appended custom directives plus a sitewide no-index switch

### What those settings affect

- **Homepage (`/`)** uses the homepage SEO fields and falls back to the global social defaults when homepage-specific OG values are blank.
- **Public export homepage** uses the same homepage SEO settings as the main root page.
- **Blog listing (`/blog`)** uses the blog listing title and description, can be independently no-indexed, and falls back to the global social defaults.
- **Blog category pages** can be globally no-indexed from the SEO tab.
- **Published site pages and blog posts** continue to use their own per-entry SEO fields first, with global OG fallbacks filling in missing social values.
- **Docs pages** keep their docs-specific metadata copy, while still inheriting sitewide title templating, verification tags, and sitewide no-index behavior through the root layout.

### Sitemap and robots.txt

`/sitemap.xml` is generated dynamically and includes:

- the homepage
- the blog listing
- all published site pages
- all published blog posts
- any custom URLs you add in the SEO tab

Exact URLs can also be excluded before the final sitemap is returned.

`/robots.txt` is also generated dynamically. The core file is not handwritten; it is built from the same SEO settings, then optionally extended with custom directives saved from the robots.txt modal.

When **sitewide no-index** is enabled:

- the root layout emits `robots: { index: false, follow: false }`
- `/robots.txt` switches to `Disallow: /`
- the generated file includes an explicit warning comment so operators can tell at a glance that full-site blocking is active

### Site URL and canonical behavior

Canonical URLs, the sitemap host, and robots.txt host lines depend on the configured site URL. That value is resolved from environment configuration in this order:

1. `NEXT_PUBLIC_APP_URL`
2. `NEXTAUTH_URL`
3. `VERCEL_PROJECT_PRODUCTION_URL`
4. `VERCEL_URL`
5. fallback to `http://localhost:3000`

If your production host is not set correctly, the generated canonical URLs, sitemap, and robots.txt output will reflect the wrong origin.

### Content-level SEO still exists

Blog posts and editable site pages keep their own SEO fields:

- `metaTitle`, `metaDescription`, `canonicalUrl`, `noIndex`
- `ogTitle`, `ogDescription`, `ogImage`

Use the admin SEO tab for global defaults and cross-site discoverability controls. Use the CMS entry fields when a specific post or page needs custom search or social metadata.

For a fuller operator guide, see `/docs/seo-and-discoverability`.

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
- **User APIs:** `/api/support/tickets`, `/api/support/tickets/[ticketId]`, `/api/support/tickets/[ticketId]/reply`
- **Admin APIs:** `/api/admin/support/tickets`, `/api/admin/support/tickets/[ticketId]`, `/api/admin/support/tickets/[ticketId]/reply`

The support center is already integrated into the wider product flow: billing pages link users there for refund/help requests, notifications can deep-link back into ticket threads, and support email templates notify the relevant side when a ticket or reply is created.

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

Stripe also exposes `/api/webhooks/stripe` as an alias route. Razorpay currently relies on the centralized `/api/webhooks/payments` route rather than a dedicated provider-specific alias.

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
- Apply the configured organization-expiry policy to "zombie" organizations whose owner's subscription has lapsed. The default is to suspend access instead of dismantling the local workspace record.
- Process the subscription queue for batch operations.

**In production**, unauthorized requests return `404`. The route accepts any one of these bearer tokens:

- `CRON_PROCESS_EXPIRY_TOKEN`
- `CRON_SECRET`
- `CRON_TOKEN`

In every environment, the route requires a matching bearer token.

**Example cron command (cPanel / shell):**
```bash
curl -i -m 60 \
  -H "Authorization: Bearer $CRON_PROCESS_EXPIRY_TOKEN" \
  "https://yourdomain.com/api/cron/process-expiry" \
  >> /home/<user>/cron-process-expiry.log 2>&1
```

### Lazy expiry check

As a fallback, `app/dashboard/(valid)/layout.tsx` calls `getCurrentUserWithFallback()` → `ensureUserExists()` on every dashboard visit. This runs a lightweight on-access check that expires stale subscriptions and resets monthly free tokens without requiring the cron job to have run.

---

## File Storage (S3)

By default, uploaded files are stored on the local filesystem. Switch to S3 (or any S3-compatible provider):

```bash
FILE_STORAGE="s3"
FILE_S3_BUCKET="my-bucket-name"
AWS_REGION=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
FILE_CDN_DOMAIN=""        # Optional: CloudFront distribution domain (recommended)
FILE_S3_ENDPOINT=""       # Optional: Custom S3-compatible endpoint (Cloudflare R2, MinIO, DigitalOcean Spaces)
```

> **S3-compatible providers:** Set `FILE_S3_ENDPOINT` to your provider's endpoint URL (e.g. `https://<account>.r2.cloudflarestorage.com` for Cloudflare R2). Leave it blank for standard AWS S3.

When `FILE_CDN_DOMAIN` is set, the upload handler returns CDN URLs instead of raw S3 links.

Legacy aliases are still accepted by the runtime: `LOGO_STORAGE`, `LOGO_S3_BUCKET`, `LOGO_S3_ENDPOINT`, and `LOGO_CDN_DOMAIN`.

**File upload scoping:** The `saveAdminFile` helper in `lib/fileStorage.js` scopes uploads to sub-directories based on context (e.g. `/logos/`, `/files/`) to keep the bucket organized.

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

## Analytics (Traffic Providers)

The admin traffic dashboard can pull metrics from Google Analytics 4 or PostHog. Select the provider with `TRAFFIC_ANALYTICS_PROVIDER`.

External provider tracking is loaded on non-admin app routes only. The browser tracker intentionally excludes `/admin` pages.

| Variable | Required | Scope | Example |
|---|---|---|---|
| `TRAFFIC_ANALYTICS_PROVIDER` | optional | Server | `google-analytics` or `posthog` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ✅ | Client | `G-XXXXXXXXXX` |
| `GA_PROPERTY_ID` | Google only | Server | `123456789` |
| `GA_SERVICE_ACCOUNT_CREDENTIALS_B64` | Google only | Server | Base64-encoded service account JSON |
| `GA_DATA_API_CACHE_SECONDS` | optional | Server | `30` |
| `POSTHOG_PROJECT_ID` | PostHog only | Server | `12345` |
| `POSTHOG_PERSONAL_API_KEY` | PostHog only | Server | Personal API key with `query:read` |
| `POSTHOG_APP_HOST` | optional | Server | `https://us.posthog.com` |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog only | Client | PostHog Project token from the dashboard |
| `NEXT_PUBLIC_POSTHOG_HOST` | optional | Client | `https://us.i.posthog.com` |

**Google Analytics setup:**
1. Create a service account in Google Cloud with `analytics.readonly` scope.
2. In GA4 → Admin → Property Access Management, add the service account email with at least **Viewer** role.
3. Base64-encode your service account JSON: `base64 -i key.json`.

**PostHog setup:**
1. Set `TRAFFIC_ANALYTICS_PROVIDER=posthog`.
2. Create a personal API key with `query:read` permission and store it in `POSTHOG_PERSONAL_API_KEY`.
3. Set `POSTHOG_PROJECT_ID` to the project backing your product analytics.
4. Set `NEXT_PUBLIC_POSTHOG_KEY` to the browser-side PostHog Project token shown in the dashboard.
5. Set `POSTHOG_APP_HOST` and `NEXT_PUBLIC_POSTHOG_HOST` if you are not using the default US cloud hosts.

PostHog pageview capture in this boilerplate is manual and excludes `/admin` routes. The admin area still uses the backend analytics adapter for `/admin/traffic` reporting.

> **Heads-up:** The GA snippet loads in every environment once `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. Use a dev GA4 property locally to avoid polluting production data.

Provider metrics surfaced: total visits, unique visitors, page views, avg. session duration, top referrers, top pages, countries, device mix, and events. GA4 also supports native new-user and engagement metrics. PostHog replaces those cards with supported metrics such as bounce rate, views per visit, and estimated engaged visits.

---

## Visit Tracking

The app includes lightweight first-party visit tracking via `lib/visit-tracking.ts` and the `VisitLog` model. Middleware (`POST /api/internal/track-visit`) records visits for admin traffic reporting, skipping API routes, static files, admin routes, and bots. External browser analytics tracking also skips admin routes. This is the built-in self-hosted analytics path alongside Google Analytics or PostHog.

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

- **User experience:** Session and security controls are surfaced in the unified profile hub at `/dashboard/profile` under the "Security & Data" tab. The legacy `/dashboard/account` route redirects there.
- **Session tracking:** `lib/session-activity.ts` parses User-Agent for browser name/version and device type (desktop/mobile/tablet)
- **Geolocation:** Uses `IPINFO_LITE_TOKEN` for IP lookups when configured, falls back to `country.is` (free, no API key needed). Results are cached for 24 hours.
- **Session revocation:** Users can revoke individual sessions (when using an auth provider that supports it)
- **Activity refresh:** Sessions are refreshed every 5 minutes to avoid unnecessary writes

---

## Moderator Roles

In addition to `ADMIN`, the app supports a **Moderator** role with configurable per-section access.

- **Admin config:** `/admin/moderation` — enable/disable which dashboard sections a moderator can access.
- **Sections available:** `users`, `transactions`, `purchases`, `subscriptions`, `support`, `notifications`, `blog`, `analytics`, `traffic`, `organizations`.
- **Moderator activity log:** The moderation page at `/admin/moderation` includes the action timeline. `/admin/moderator-activity` is kept as a legacy redirect to that page.
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
- **Optional Sentry fan-out** — when `SENTRY_ENABLED` is set with a DSN, production logger events and React error boundaries forward to Sentry without replacing the built-in admin log view; local logger fan-out can also be enabled explicitly with `SENTRY_CAPTURE_IN_DEVELOPMENT=true`
- **Auto-pruning** at 1,000 max entries
- **Structured logging** with timestamps and sanitized metadata

### Admin Action Audit Log

The `AdminActionLog` model records all admin/moderator actions:

- **Fields:** actor, target user, action type, details, timestamp
- **Viewable at:** `/admin/moderation` (the legacy `/admin/moderator-activity` route redirects there)

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
- `Content-Security-Policy` — source allowlist for scripts, frames, embeds, and outbound connections

### Error Sanitization

`lib/secure-errors.ts` provides structured error classes (`AppError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, etc.) that:

- Expose safe, operational error messages to clients
- Hide internal error details in production
- Include `X-Request-ID` headers for support/debugging

### Other Security Features

- **`ENCRYPTION_SECRET`** — encrypts sensitive DB fields at rest, including reusable payment authorization codes
- **Webhook signature verification** with rotation support (comma-separated secrets)
- **Price validation** on webhook events
- **Bcrypt password hashing** for NextAuth credentials users (12 salt rounds)
- **Single-use password reset flow** — reset tokens are generated with cryptographic randomness, stored hashed, expire after 1 hour, and active sessions are revoked after reset
- **Password policy** enforcement (`lib/password-policy.ts`) — minimum 8 chars, uppercase, lowercase, and number by default
- **Token version** tracking — incremented on password change to invalidate existing sessions
- **Secure credentials cookies** — `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS for the built-in credentials sign-in route
- **Generic auth recovery responses** on forgot-password and resend-verification routes to reduce email enumeration risk
- **Account suspension controls** — admins can temporarily or permanently suspend users, which blocks new sign-ins and invalidates provider-backed access checks consistently across Clerk, NextAuth, and Better Auth

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

140+ test files covering 500+ individual tests:
- Payment provider flows (Stripe, Paystack, Paddle, Razorpay)
- Webhook handling and event normalization
- Subscription lifecycle (checkout, proration, cancellation, resurrection)
- Team/organization operations and provisioning
- Token spending and organization scoping
- Auth flows, route guards, and session management
- Admin operations, sorting, and filtering
- Coupon redemption and plan resolution
- Support ticket categories and cursor pagination

## Admin Dashboard Overview

The admin dashboard (`/admin`) is organized into logical groups:

| Group | Sections |
|---|---|
| **Overview** | Dashboard home with quick stats |
| **Users & Access** | Users, Organizations, Moderation |
| **Finances** | Transactions, One-Time Sales, Subscriptions, Coupons |
| **Platform** | Theme, Pages, Blog, Plans, Email Templates, Settings |
| **Support & Analytics** | Support Tickets, Notifications, Analytics (GA4), Traffic |
| **Developer** | System, System Logs, Maintenance |

### Notable Admin Features

- **System** (`/admin/system`) — live environment readiness, runtime/build details, storage, webhook, bearer-token, and maintenance status snapshot for operators
- **Maintenance Tools** (`/admin/maintenance`) — cleanup, repair utilities, and maintenance mode toggle
- **System Logs** (`/admin/logs`) — persisted WARN/ERROR logs with filtering
- **One-Time Plans** (`/admin/one-time-plans`) — manage non-recurring offers, including fixed-duration and lifetime access plans
- **Account controls** (`/admin/users`, `/admin/organizations`) — suspend users with temporary/permanent messaging, inspect suspension reason/date in admin UI, and suspend or restore organizations without deleting the local workspace record

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
| **Profile** | `/dashboard/profile` | Unified account hub for profile details, preferences, session security, export, and account deletion |
| **Account** | `/dashboard/account` | Legacy redirect to `/dashboard/profile` |
| **Settings** | `/dashboard/settings` | Legacy entry point that redirects into the unified profile/settings experience |
| **Notifications** | `/dashboard/notifications` | In-app notification center |
| **Support** | `/dashboard/support` | Support ticket creation and history |
| **Coupons** | `/dashboard/coupons` | Redeemed coupons and pending redemptions |
| **Legacy redirects** | `/dashboard/editor`, `/dashboard/sassyapp` | Redirect to `/dashboard` |

The main dashboard page is the place to replace the demo SaaSyApp experience with your own product logic.

Users can also switch workspace context from the dashboard sidebar footer. That switcher is important because a personal workspace and a team workspace can expose different billing state, token pools, and feature access.

---

## Production Setup

### Before the first live deploy

Complete these steps after local development is finished and before you point real traffic at the app:

1. Provision a hosted PostgreSQL database and update `DATABASE_URL`.
2. Run production migrations with `npx prisma migrate deploy` against that production database.
3. Configure all production env vars for your chosen auth provider, payment provider, email provider, and secrets.
4. If admins will upload logos or other managed files in production, switch from local filesystem storage to S3-compatible storage.
5. Configure your webhook endpoints and verify signatures before accepting live traffic.

For Coolify and similar self-hosted platforms, set the production environment variables in the platform UI before the first deploy attempt. This app reads the database during `npm run build` for static generation, so a missing or broken `DATABASE_URL` can fail the build before the app ever starts.

If your team previously developed against SQLite and you are now moving to PostgreSQL, do not reuse that SQLite migration chain or local `dev.db` file in production. Start from a fresh PostgreSQL database and follow [docs/prisma-provider-migrations.md](docs/prisma-provider-migrations.md) for the supported recovery path.

### Updating an existing live install

SaaSyBase is stable enough now that most releases should be routine maintenance: improvements, bug fixes, security work, and polish. In plain language, most updates should not require deep code surgery.

Here, “upstream” just means the newer official SaaSyBase version you are updating from.

For operators, the short safe workflow is:

1. Read the release summary first to see whether the update is routine or whether it specifically mentions infrastructure changes.
2. Back up the production database and confirm the effective deployed env configuration.
3. Merge the update in Git first, then validate it in staging with production-like providers and storage.
4. Run production with the normal ordered flow: `npm run prisma:deploy`, then build, then start or promote the release.
5. After deploy, verify `/api/health`, sign-in, billing, webhook delivery, cron auth, uploads, and logs before you call the release complete.

Do not assume every release needs Prisma or database work. Only switch into migration-specific steps when the release actually includes schema changes. Also do not rerun `npx prisma db seed` as part of routine upgrades. Seed data is for first-time bootstrap or deliberate demo/local setup, not normal live releases.

The full operator guide is in [app/docs/updates-and-upgrades/page.tsx](app/docs/updates-and-upgrades/page.tsx) for the docs page source and at `/docs/updates-and-upgrades` in the running app.

### Required environment variables

```bash
# Strong recommendation: for staging and production, prefer platform-native encrypted env vars.
# If your team wants one centralized secret store across multiple platforms,
# SaaSyBase can optionally bootstrap missing values from Infisical or Doppler.

# Optional built-in secrets-provider bootstrap:
# SECRETS_PROVIDER="infisical"   # or "doppler"
# SECRETS_PROVIDER_COMMAND=""    # optional full command override
# SECRETS_PROVIDER_SECRETS="DATABASE_URL,ENCRYPTION_SECRET"   # optional narrowing allowlist; omit to allow any missing provider keys
# INFISICAL_PROJECT_ID="your-project-id"
# INFISICAL_ENVIRONMENT="production"
# DOPPLER_PROJECT="saasybase"
# DOPPLER_CONFIG="prd"

# Core
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NEXT_PUBLIC_APP_DOMAIN="yourdomain.com"
NEXT_PUBLIC_SITE_NAME="Your App"

# Auth (pick one)
AUTH_PROVIDER="betterauth"   # or "nextauth" or "clerk"

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

- If `EMAIL_PROVIDER` is unset, the app defaults to `nodemailer`.
- Use `EMAIL_PROVIDER="nodemailer"` for SMTP delivery. In local development, the default SMTP values can point at MailHog.
- Use `EMAIL_PROVIDER="resend"` with `RESEND_API_KEY` set. The `SMTP_*` variables are ignored in that mode.

### Coolify deployment commands

Coolify should not rely on plain `npm run build` alone for first deploys or schema changes. In this repo, `build` runs Prisma client generation plus Next.js build, but it does not apply migrations.

Recommended Coolify setup:

```bash
# Build command
npm run deploy:build

# Start command
npm run start
```

`npm run deploy:build` runs:

```bash
npm run prisma:deploy && npm run build
```

Set all required env vars in Coolify before the first deployment attempt. Also use a `DATABASE_URL` that works in the build container, not only at runtime. If the URL depends on a local CA file path such as `sslrootcert=/etc/ssl/certs/coolify-ca.crt`, the build can fail during Prisma access unless that certificate file is present inside the builder image too.

### Secrets providers (optional)

If you are new to this, use this rule:

- local development: keep using `.env.local`
- staging and production: use your platform's encrypted env vars by default
- centralized secret store across multiple platforms: opt into Infisical or Doppler bootstrap

SaaSyBase stays env-driven. The built-in wrappers load `.env` files first, then optionally ask Infisical or Doppler for missing server-side secrets before `build`, `start`, and Prisma commands run.

Simple setup flow:

1. Decide whether you actually need bootstrap. If Vercel, Coolify, Railway, Render, Docker, or your VPS already inject env vars cleanly, you may not need it.
2. Set `SECRETS_PROVIDER=infisical` or `SECRETS_PROVIDER=doppler` only when you want centralized secret loading.
3. Keep provider authentication in the provider's own CLI flow or machine identity setup instead of storing cloud-service JSON keys in env.
4. Optionally set `SECRETS_PROVIDER_COMMAND` when you want the app to run a custom export command instead of the built-in default.
5. Run `npm run secrets:smoke` before the first real deploy.
6. Deploy normally in order: `npm run prisma:deploy`, then `npm run build`, then `npm run start`.

Built-in default commands:

- Infisical: `infisical export --format json`
- Doppler: `doppler secrets download --no-file --format json`

Important behavior:

- The app does not open an interactive provider login flow for the user.
- It expects the selected provider CLI to already be installed and authenticated in the current shell, CI job, or server runtime.
- For local Infisical usage, the minimum mental model is: install the CLI, run `infisical login`, set `INFISICAL_PROJECT_ID` and `INFISICAL_ENVIRONMENT`, then run `npm run secrets:smoke`.
- For local Doppler usage, the minimum mental model is: install the CLI, run `doppler login`, set `DOPPLER_PROJECT` and `DOPPLER_CONFIG`, then run `npm run secrets:smoke`.
- If you want a preflight check before boot, run `npm run secrets:doctor`.

Official docs:

- Infisical CLI overview: <https://infisical.com/docs/cli/overview>
- Infisical export command: <https://infisical.com/docs/cli/commands/export>
- Doppler CLI docs: <https://docs.doppler.com/docs/cli>
- Doppler secrets access docs: <https://docs.doppler.com/docs/accessing-secrets>

Optional provider hints:

- `INFISICAL_PROJECT_ID`
- `INFISICAL_ENVIRONMENT`
- `DOPPLER_PROJECT`
- `DOPPLER_CONFIG`
- `SECRETS_PROVIDER_SECRETS` as a comma-separated allowlist when you want to narrow bootstrap to a specific subset of provider keys

The app only fills missing values. If a value is already present in platform envs or `.env.local`, it wins.

### Secrets bootstrap troubleshooting

Common errors and what they usually mean:

| Error | Usual cause | Fix |
|---|---|---|
| `provider command not found` | The Infisical or Doppler CLI is not installed or not on `PATH` | Install the CLI or set `SECRETS_PROVIDER_COMMAND` explicitly |
| Provider auth error | The CLI exists, but it is not authenticated | Use the provider's machine identity, service token, or login flow |
| Smoke test says a required value is missing | The export command ran, but the expected env var was not present in the provider output | Verify the env-var names in the provider project/config or set them directly in platform envs |
| Unexpected bootstrap behavior | Your provider setup needs different flags than the built-in defaults | Set `SECRETS_PROVIDER_COMMAND` to your exact provider export command |

### Clerk script troubleshooting

If Clerk keys are loaded but the browser still shows `Failed to load Clerk JS`, check these in order:

1. Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` resolves to the expected Clerk instance.
2. Open the browser devtools Network tab and check whether the Clerk JS URL returns a real response or is blocked.
3. Check your browser console for a Content Security Policy error. SaaSyBase keeps CSP disabled by default because third-party auth and payment providers often need extra origins. If you enable CSP yourself, you need to maintain the allowlist for Clerk and any CAPTCHA provider it pulls in.
4. If you changed env vars or CSP recently, fully restart the app and hard-refresh the browser.
5. On privacy-focused browsers or extensions, temporarily disable blockers for the site to rule out a client-side block.

The Clerk JS URL usually looks like:

```text
https://<your-clerk-instance>.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js
```

If that exact URL is blocked by CSP, the app is loading the right key but the browser is not allowed to fetch Clerk's hosted script.

Base64 examples:

```bash
# macOS / Linux
base64 -i service-account.json | tr -d '\n'

# alternative that works on many Linux shells
base64 -w 0 service-account.json
```

Supported bootstrap env vars:

- `SECRETS_PROVIDER=infisical` or `SECRETS_PROVIDER=doppler` enables the integration
- `SECRETS_PROVIDER_COMMAND` overrides the provider CLI command completely
- `SECRETS_PROVIDER_SECRETS` provides an optional comma-separated allowlist of env var names to fetch; when omitted, any missing env var returned by the provider is eligible to load
- `INFISICAL_PROJECT_ID` and `INFISICAL_ENVIRONMENT` shape the default Infisical export command
- `DOPPLER_PROJECT` and `DOPPLER_CONFIG` shape the default Doppler export command

Existing env values are not overwritten. That keeps env-file and platform-env fallback intact and makes staged migrations possible.

Smoke test the staging configuration without starting the app:

```bash
SECRETS_PROVIDER=infisical \
INFISICAL_ENVIRONMENT=staging \
npm run secrets:smoke
```

This remains optional. If you prefer to keep managing secrets directly in platform env vars or env files, SaaSyBase will still work because the app reads from `process.env`. The tradeoff is operational consistency: centralized secret stores make rotation and multi-environment hygiene easier, but they should stay opt-in rather than assumed.

If you want the beginner-friendly walkthrough, use the app docs page at `/docs/secrets`.

Recommended split:

- Platform envs or optional Infisical/Doppler bootstrap: all server-side secrets such as `DATABASE_URL`, `ENCRYPTION_SECRET`, provider secret keys, webhook secrets, and internal bearer tokens
- Regular env config: non-secret deploy config such as `AUTH_PROVIDER`, `PAYMENT_PROVIDER`, URLs, branding, and public keys
- `.env.local`: local-only development values and test helpers

For the staged rollout and rotation sequence, see [docs/secret-inventory-rotation-plan-2026-04-21.md](docs/secret-inventory-rotation-plan-2026-04-21.md).
For simpler deployment recipes and copy-paste examples, see [docs/secrets-provider-deploy-examples.md](docs/secrets-provider-deploy-examples.md).

### Health check

```
GET /api/health
Authorization: Bearer <HEALTHCHECK_TOKEN>
```

Returns database connectivity, environment validation, active auth/payment provider diagnostics, and runtime health checks. Without authorization, it returns a minimal public response.

Auth token resolution:

- Requires `HEALTHCHECK_TOKEN` for detailed output in production.

### Vercel deployment

SaaSyBase does not need much Vercel-specific config, but there are a few production realities you should handle explicitly:

1. Import the repo into Vercel and let Next.js auto-detect the framework.
2. Set production env vars in the Vercel project settings.
3. Use PostgreSQL, not SQLite.
4. Run `npx prisma migrate deploy` against the production database before the first live release and on future schema changes. Vercel does not apply Prisma migrations for you automatically.
5. If you need admin-managed uploads (logos, blog assets, similar files), use `FILE_STORAGE="s3"` plus S3-compatible credentials. On Vercel, persistent app-managed uploads should be treated as required S3 storage because the local filesystem is not a durable production store.
6. Set `CRON_SECRET` in Vercel if you want the built-in Vercel cron job to call `/api/cron/process-expiry`. The shipped `vercel.json` schedules that route once per day at `03:00 UTC`.

Notes:

- The default `vercel.json` cron schedule is intentionally conservative so it works on Vercel Hobby plans too. If you need faster cleanup and your plan supports it, increase the frequency.
- If you want manual or external cron callers in addition to Vercel Cron, you can also keep `CRON_PROCESS_EXPIRY_TOKEN` set.
- If you want Vercel to fetch secrets through the built-in bootstrap at build/runtime, use the Infisical or Doppler patterns in [docs/secrets-provider-deploy-examples.md](docs/secrets-provider-deploy-examples.md).

### Clerk webhook (production)

1. Go to Clerk Dashboard → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/webhooks/clerk`
3. Enable events: `user.created`, `user.updated`, `organization.*`, `organizationMembership.*`, `organizationInvitation.*`
4. Copy the signing secret into `CLERK_WEBHOOK_SECRET`.

### Stripe webhook (production)

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL: `https://yourproductiondomain.com/api/webhooks/payments` (or `/api/webhooks/stripe` or `/api/stripe/webhook`)
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
- `FILE_STORAGE="s3"` is configured if you need durable uploads.
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

Pin the application runtime to a supported Node.js version before the first deploy. This project supports Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`. Do not rely on older platform defaults such as Node 18.

Recommended setup:

1. Connect the repository as a Node or Nixpacks-style application.
2. Set the build command to `npm run build`.
3. Set the start command to `npm run start`.
4. Configure `npm run prisma:deploy` as a pre-deploy step or deployment hook so every release applies migrations before the app starts. A one-time manual run is only a fallback, not the steady-state production workflow.
5. Use PostgreSQL for production data.
6. Use S3-compatible storage if you need durable uploaded assets across container restarts or reschedules.
7. Configure a scheduled HTTP job for `/api/cron/process-expiry` with `Authorization: Bearer <CRON_PROCESS_EXPIRY_TOKEN>`. The route also accepts `CRON_SECRET` and `CRON_TOKEN`, but using one canonical name avoids confusion.
8. If you are using the built-in secrets bootstrap, authenticate the Infisical or Doppler CLI using that provider's recommended machine identity or service token flow. Examples are in [docs/secrets-provider-deploy-examples.md](docs/secrets-provider-deploy-examples.md).

### Linux VPS (Nginx or Apache)

For bare-metal / VPS hosts (AlmaLinux, RHEL, Ubuntu):

Install and pin a supported Node.js runtime first. Match the version policy in `package.json#engines`: Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`.

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
npm run secrets:smoke
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
curl -i -m 60 \
  -H "Authorization: Bearer $CRON_PROCESS_EXPIRY_TOKEN" \
  "https://yourdomain.com/api/cron/process-expiry"
```

---

## Environment Variable Reference

A complete list of supported env vars is in `.env.example`. Key groups:

| Group | Key prefix | Notes |
|---|---|---|
| Database | `DATABASE_URL` | Points Prisma at the target database. The committed provider/migration lane is PostgreSQL. |
| App | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_APP_DOMAIN` | Public-facing URL and branding |
| Branding | `NEXT_PUBLIC_SITE_LOGO`, `NEXT_PUBLIC_SITE_LOGO_LIGHT/DARK`, `NEXT_PUBLIC_SITE_LOGO_HEIGHT` | Site logo configuration |
| Auth | `AUTH_PROVIDER`, `CLERK_*`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_SECRET` | Choose Clerk, Better Auth, or NextAuth |
| Auth OAuth | `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | NextAuth OAuth providers |
| Payment | `PAYMENT_PROVIDER`, `STRIPE_*`, `PAYSTACK_*`, `PADDLE_*`, `RAZORPAY_*` | Choose provider |
| Payment catalog | `PAYMENT_AUTO_CREATE`, provider credentials, DB `PlanPrice` records | Seeded plans no longer require manual `PAYMENT_PRICE_*` or `SUBSCRIPTION_PRICE_*` env vars |
| Payment config | `PAYMENT_AUTO_CREATE`, `PAYMENTS_CURRENCY` | Catalog sync and currency |
| Currency settings | `DEFAULT_CURRENCY` | DB-backed admin setting used by payment currency resolution |
| Currency | `PADDLE_CURRENCY`, `PAYSTACK_CURRENCY`, `RAZORPAY_CURRENCY` | Per-provider currency overrides |
| Email | `EMAIL_PROVIDER`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Switch between SMTP/Nodemailer and Resend |
| Geolocation | `IPINFO_LITE_TOKEN` | Optional; activity geolocation falls back to `country.is` when unset |
| Storage | `FILE_STORAGE`, `FILE_S3_BUCKET`, `FILE_S3_ENDPOINT`, `AWS_*`, `FILE_CDN_DOMAIN` | Local fs, S3, or S3-compatible (R2, MinIO). Legacy `LOGO_*` aliases still work |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_*` | Google Analytics 4 |
| Security | `ENCRYPTION_SECRET`, `INTERNAL_API_TOKEN`, `HEALTHCHECK_TOKEN`, `CRON_PROCESS_EXPIRY_TOKEN`, `CRON_SECRET` | Server-side secrets |
| Demo | `DEMO_READ_ONLY_MODE` | Read-only demo mode |
| Paddle sandbox | `PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_ENV` | Sandbox/production toggle |
| Seeding | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Non-interactive admin creation |
| Dev helpers | `ALLOW_UNSIGNED_CLERK_WEBHOOKS`, `ALLOW_SYNC_IN_PROD` | Break-glass local/dev helpers only |
## Demo Read-Only Mode

If you want to share a safe, explorable demo (including admin UI) without allowing data changes, enable:

```bash
DEMO_READ_ONLY_MODE="true"
```

When enabled:

- `POST`, `PUT`, `PATCH`, and `DELETE` requests to `/api/*` are blocked with `403`.
- The write-method exemptions are exactly `/api/auth/*`, `/api/webhooks/*`, and `/api/stripe/webhook`, so sign-in and provider callbacks still work.
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
- Treat `ALLOW_UNSIGNED_CLERK_WEBHOOKS` and `ALLOW_SYNC_IN_PROD` as break-glass only. `ALLOW_UNSIGNED_CLERK_WEBHOOKS` is for explicit localhost debugging only and must never be enabled for staging or preview environments.
