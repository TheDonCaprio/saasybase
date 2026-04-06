# CLAUDE.md — AI Coding Agent Context for SaaSyBase

> This file provides structured context for Claude, ChatGPT, Copilot, Cursor, and other AI coding agents working on the SaaSyBase codebase.

## Project Identity

**SaaSyBase** is a production-ready SaaS boilerplate built with Next.js 16 App Router. It is designed for **vibecoders** — developers who want to scaffold a SaaS product quickly without wiring auth, payments, billing, teams, email, or admin dashboards from scratch.

Most features are **already wired and ready to go**. The user's job is to build their product logic on top of the existing infrastructure.

---

## Critical Rules

1. **Never import vendor-specific auth or payment modules directly.** Always use the abstraction layers:
   - Auth: `import { authService } from '@/lib/auth-provider/service'`
   - Payments: `import { PaymentProviderFactory } from '@/lib/payment/factory'`
2. **Always check both legacy and generic columns** when querying subscriptions or payments (see [PATTERNS.md](PATTERNS.md) § Dual-Column Queries).
3. **Do not hardcode provider names** in business logic. Use `supportsFeature()` for capability checks.
4. **Run the regression tests** after any change to auth, payments, subscriptions, tokens, or organizations: `npm test`
5. **Do not modify the Prisma schema** without running `npx prisma migrate dev --name <description>`.
6. **Use Zod schemas from `lib/validation.ts`** for all API input validation — never trust raw request bodies.
7. **Use `logger` from `lib/logger.ts`** instead of `console.log` — it auto-redacts secrets and persists warnings/errors to the DB.
8. **Rate-limit all public API routes** using `rateLimit()` from `lib/rateLimit.ts`.
9. **Use `handleApiError()` from `lib/api-error.ts`** in all API route catch blocks for consistent error responses.
10. **Never expose internal error details in production.** Use `createErrorResponse()` from `lib/secure-errors.ts`.

---

## Quick Reference

| What | Where |
|------|-------|
| Auth abstraction | `lib/auth-provider/` — service, types, providers, client components |
| Payment abstraction | `lib/payment/` — factory, registry, types, providers |
| Database client | `lib/prisma.ts` (singleton with hot-reload safety) |
| Validation schemas | `lib/validation.ts` (Zod) |
| API error handling | `lib/api-error.ts` + `lib/secure-errors.ts` |
| Rate limiting | `lib/rateLimit.ts` (DB-backed, distributed-safe) |
| Feature gating | `lib/features.ts` + `lib/featureGate.tsx` |
| Token system | `lib/paidTokens.ts`, `lib/user-plan-context.ts` |
| Settings (key-value) | `lib/settings.ts` (DB-backed, 5s cache) |
| Logging | `lib/logger.ts` (auto-redaction, DB persistence) |
| Email | `lib/email.ts` + `lib/email-templates.ts` |
| Subscriptions | `lib/subscriptions.ts`, `lib/subscription-utils.ts` |
| Organizations/Teams | `lib/organization-access.ts`, `lib/teams.ts` |
| Plans & Pricing | `lib/plans.ts`, `lib/pricing.ts` |
| Coupons | `lib/coupons.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Middleware (auth) | `proxy.ts` → `lib/auth-provider/middleware.ts` |
| Root layout | `app/layout.tsx` |
| Dashboard layout | `app/dashboard/(valid)/layout.tsx` |
| Admin layout | `app/admin/(valid)/layout.tsx` |
| Webhook ingress | `app/api/webhooks/payments/route.ts` (auto-detects provider) |

---

## Environment Configuration

Auth and payment providers are selected via environment variables, not code changes:

```bash
AUTH_PROVIDER="nextauth"        # or "clerk"
PAYMENT_PROVIDER="stripe"      # or "paystack", "paddle", "razorpay"
```

The build system exposes `AUTH_PROVIDER` as `NEXT_PUBLIC_AUTH_PROVIDER` automatically via `next.config.mjs` for client-side dead-code elimination.

---

## How to Add a New Feature

1. **API Route:** Create in `app/api/your-feature/route.ts`. For user-scoped endpoints use `authService.requireUserId()`; for admin/moderator endpoints reuse the established guard helpers. Add rate limiting, Zod validation, and follow the existing error-handling style in that area.
2. **Server Logic:** Add business logic in `lib/your-feature.ts`. Use `prisma` from `lib/prisma.ts`.
3. **UI Component:** Add to `components/your-feature/`. Use existing UI primitives from `components/ui/`.
4. **Page:** Add to `app/dashboard/(valid)/your-feature/page.tsx` for user pages, `app/admin/(valid)/your-feature/page.tsx` for admin pages.
5. **Tests:** Add regression tests in `tests/your-feature.test.ts` using Vitest.

---

## How to Add a New Payment Provider

Follow `docs/adding-payment-providers.md`. In short:
1. Implement the `PaymentProvider` interface from `lib/payment/types.ts`.
2. Register in `lib/payment/registry.ts`.
3. Webhook signature auto-detection routes through `app/api/webhooks/payments/route.ts`.
4. Add client scripts to `components/PaymentProviderScripts.tsx` if needed.
5. Add tests in `tests/`.

---

## How to Add a New Auth Provider

Mirror the existing pattern in `lib/auth-provider/`:
1. Implement `AuthProvider` interface from `lib/auth-provider/types.ts`.
2. Register in `lib/auth-provider/registry.ts`.
3. Add middleware handling in `lib/auth-provider/middleware.ts`.
4. Export client components from `lib/auth-provider/client/`.

---

## Testing

```bash
npm test                    # Vitest unit tests (90+ test files)
npm run test:e2e            # Playwright E2E tests
npm run test:e2e:headed     # E2E with visible browser
npm run typecheck           # TypeScript type checking
npm run lint                # ESLint
```

Tests cover: payment provider flows, webhook normalization, subscription lifecycle, team/org operations, token spending, auth guards, admin operations, and more.

---

## Database

- **Dev:** SQLite (`file:./dev.db`) — zero config, works immediately.
- **Prod:** PostgreSQL (set `DATABASE_URL`).
- **Migrations:** `npx prisma migrate dev --name <name>`
- **Seed:** `npx prisma db seed` (interactive admin email/password prompt)
- **Studio:** `npm run prisma:studio` (visual DB browser with the repo Prisma config)

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Importing `@clerk/nextjs` directly | Use `lib/auth-provider/` abstraction |
| Importing `stripe` directly for business logic | Use `PaymentProviderFactory.getProvider()` |
| Using `console.log` | Use `Logger.info()` / `Logger.warn()` / `Logger.error()` |
| Raw `req.json()` without validation | Parse with Zod schema from `lib/validation.ts` |
| Querying only `externalSubscriptionId` | Also check `externalSubscriptionIds` JSON map for multi-provider setups |
| Missing rate limiting on API route | Add `rateLimit(key, RATE_LIMITS.API_GENERAL)` |
| Hardcoding currency | Use `getActiveCurrency()` or `getActiveCurrencyAsync()` and let `DEFAULT_CURRENCY` / `PAYMENTS_CURRENCY` resolve through the payment registry |
| Direct `new PrismaClient()` | Use singleton from `lib/prisma.ts` |

---

## File Naming Conventions

- **API routes:** `app/api/<domain>/route.ts`
- **Pages:** `app/<section>/page.tsx` (with `layout.tsx` for shared chrome)
- **Lib modules:** `lib/<domain>.ts` or `lib/<domain>/` for complex modules
- **Components:** `components/<ComponentName>.tsx` or `components/<domain>/<ComponentName>.tsx`
- **Tests:** `tests/<feature-name>.test.ts`
- **Scripts:** `scripts/<action>.ts` or `scripts/<action>.js`

---

## Key Abstractions to Understand

### Provider Pattern (Auth + Payments)
Both auth and payment use an identical abstraction:
`Interface → Provider implementations → Registry → Factory → Service`

This means the rest of the codebase is provider-agnostic. When you see `authService.getSession()` or `factory.getProvider().createCheckoutSession()`, the underlying provider is resolved from env vars at runtime.

### Token System (3 Buckets)
- **Paid tokens** (`User.tokenBalance`) — from purchases
- **Free tokens** (`User.freeTokenBalance`) — monthly renewal
- **Shared tokens** (`Organization.tokenBalance`) — team pool

Spending order: paid → shared → free (configurable via `bucket` parameter).

### Feature Gating
Use `FeatureGate` server component or `isProFeature()` check. Gates automatically check both personal subscriptions AND organization team plans.

### Settings System
50+ configurable settings stored in the `Setting` model. Read with `getSetting(key, default)`. 5-second in-memory cache. Covers site branding, token policies, theme colors, blog config, pricing layout, and more.
