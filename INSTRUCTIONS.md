# INSTRUCTIONS.md — Developer Guide for Working with SaaSyBase

> This guide is for developers (and AI agents) modifying, extending, or building on the SaaSyBase boilerplate. Read this before making changes.

---

## 1. Project Overview

SaaSyBase is a **production-ready SaaS boilerplate** designed for vibecoders who want to ship fast. The infrastructure — auth, payments, billing, teams, email, admin dashboards, blog, support tickets, and more — is already wired. Your job is to build your product logic on top.

**Key principle:** Most things are already built. Before creating something new, check if a component, utility, or pattern already exists.

---

## 2. Getting Started

```bash
cp .env.example .env.local       # Copy env template
npm install                       # Install dependencies
npx prisma migrate dev --name init  # Run migrations (creates SQLite dev.db)
npx prisma db seed                # Seed database (prompts for admin email/password)
npm run dev                       # Start dev server
```

With Prisma 7, seeding only runs when you explicitly execute `npx prisma db seed`. To skip admin creation for a particular seed run, use `npx prisma db seed -- --skip-admin`.

### Dev Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Standard dev server (webpack) |
| `npm run dev:turbo` | Turbopack dev server (faster cold starts) |
| `npm run dev:full` | Dev server + Stripe CLI webhook listener |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Visual database browser |

---

## 3. Project Structure

```
├── app/                  # Next.js 16 App Router
│   ├── api/              # API routes (REST endpoints)
│   ├── admin/            # Admin dashboard pages
│   ├── dashboard/        # User dashboard pages
│   ├── auth/             # Auth pages (NextAuth flow)
│   ├── blog/             # Blog pages
│   ├── checkout/         # Payment checkout flow
│   ├── pricing/          # Pricing page
│   └── [slug]/           # Dynamic site pages
├── components/           # React components
│   ├── ui/               # Reusable UI primitives (Modal, Toast, Pagination, etc.)
│   ├── admin/            # Admin-specific components
│   ├── dashboard/        # Dashboard-specific components
│   ├── billing/          # Billing UI (cancel modal, payment management)
│   ├── checkout/         # Provider-specific checkout components
│   ├── pricing/          # Pricing cards and lists
│   ├── team/             # Team management UI
│   ├── blog/             # Blog components
│   └── hooks/            # Client-side React hooks
├── lib/                  # Server-side business logic
│   ├── auth-provider/    # Auth abstraction (Clerk / NextAuth)
│   ├── payment/          # Payment abstraction (Stripe / Paystack / Paddle / Razorpay)
│   ├── emails/           # Email logic
│   └── utils/            # Shared utilities
├── hooks/                # App-level React hooks
├── types/                # TypeScript type definitions
├── utils/                # Client-side utilities
├── prisma/               # Database schema & migrations
├── tests/                # Unit tests (Vitest) & E2E tests (Playwright)
├── scripts/              # Operational scripts (backfill, admin, sync)
├── docs/                 # Architecture documentation
├── ops/                  # Production operational tools
└── public/               # Static assets
```

---

## 4. Core Abstractions (Must-Know)

### Auth Provider Abstraction

**Never import Clerk or NextAuth directly in business logic.** Use:

```typescript
import { authService } from '@/lib/auth-provider/service';

// Get current session
const { userId } = await authService.getSession();

// Require authenticated user (throws if not logged in)
const userId = await authService.requireUserId();

// Get user details
const user = await authService.getCurrentUser();

// Check feature support
if (authService.supportsFeature('organizations')) { /* ... */ }
```

Client-side auth components are re-exported from `lib/auth-provider/client/components` and automatically switch based on the active provider.

### Payment Provider Abstraction

**Never import Stripe, Paystack, etc. directly.** Use:

```typescript
import { PaymentProviderFactory } from '@/lib/payment/factory';

const provider = PaymentProviderFactory.getProvider();

// Check capabilities before using them
if (provider.supportsFeature('proration')) {
  await provider.getProrationPreview(subId, newPriceId, userId);
}

// Create checkout
const session = await provider.createCheckoutSession({ ... });

// Get all configured providers (for catalog sync)
const all = PaymentProviderFactory.getAllConfiguredProviders();
```

### Database Access

```typescript
import { prisma } from '@/lib/prisma';

// Always use the singleton — never `new PrismaClient()`
const user = await prisma.user.findUnique({ where: { id } });
```

### Input Validation

```typescript
import { commonSchemas, apiSchemas } from '@/lib/validation';

// In API routes
const body = await req.json();
const parsed = apiSchemas.supportTicket.parse(body); // throws ZodError on invalid input
```

### Error Handling in API Routes

```typescript
import { ApiError, handleApiError } from '@/lib/api-error';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    await rateLimit('checkout', RATE_LIMITS.CHECKOUT);
    const userId = await authService.requireUserId();
    // ... business logic
  } catch (error) {
    return handleApiError(error);
  }
}
```

### Logging

```typescript
import { Logger } from '@/lib/logger';

Logger.info('Checkout completed', { userId, planId });
Logger.warn('Payment retry failed', { attempt: 3 });
Logger.error('Webhook signature invalid', { provider: 'stripe' });
// Never use console.log — Logger auto-redacts secrets and persists to DB
```

---

## 5. Adding New Features

### New API Route

```
app/api/my-feature/route.ts
```

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider/service';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    await rateLimit('my-feature', RATE_LIMITS.API_GENERAL);
    const userId = await authService.requireUserId();
    const body = inputSchema.parse(await req.json());
    
    const result = await prisma.myModel.create({
      data: { ...body, userId },
    });
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### New Dashboard Page

```
app/dashboard/my-feature/page.tsx
```

The page will automatically inherit the dashboard layout (sidebar, auth check, etc.).

### New Admin Page

```
app/admin/my-feature/page.tsx
```

Admin routes are protected by middleware — only ADMIN and allowed MODERATOR roles can access.

### New Reusable Component

Place in `components/ui/` for generic primitives, or `components/my-feature/` for domain-specific components.

**Existing UI components you should reuse:**
- `Modal` — Overlay modal with close button
- `ConfirmModal` — Confirmation dialog
- `Toast` — Toast notifications
- `Pagination` — Paginated lists
- `ListFilters` — Filterable list controls
- `SortControls` — Sortable column controls
- `Breadcrumbs` — Navigation breadcrumbs
- `Stat` — Stat cards for dashboards
- `IconActionButton` — Icon buttons with tooltips

---

## 6. Database Changes

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name describe-your-change`.
3. The migration file is created in `prisma/migrations/`.
4. If adding a model with relations, update the seed in `prisma/seed.ts` if appropriate.
5. Run `npm test` to verify nothing breaks.

---

## 7. Token System Integration

If your feature consumes tokens, use the internal spend API:

```typescript
// Server-side token deduction
const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/internal/spend-tokens`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN}`,
  },
  body: JSON.stringify({
    userId,
    amount: 10,
    bucket: 'auto',     // auto | paid | free | shared
    feature: 'my_feature',
  }),
});

if (!response.ok) {
  const data = await response.json();
  if (data.error === 'insufficient_tokens') {
    // Handle insufficient tokens
  }
}
```

See `docs/token-usage-and-deduction.md` for full integration guide.

---

## 8. Feature Gating

Gate features behind a paid plan:

```typescript
// 1. Add feature to lib/features.ts
export enum FeatureId {
  // ... existing features
  MY_FEATURE = 'MY_FEATURE',
}

export const PRO_FEATURES: FeatureId[] = [
  // ... existing
  FeatureId.MY_FEATURE,
];

// 2. Use in a server component
import { FeatureGate } from '@/lib/featureGate';
import { FeatureId } from '@/lib/features';

<FeatureGate feature={FeatureId.MY_FEATURE}>
  <MyProFeatureComponent />
</FeatureGate>
```

The gate checks both personal subscriptions and organization team plans.

---

## 9. Email Templates

Email templates are stored in the DB and editable from `/admin/emails`. To send a templated email:

```typescript
import { sendEmail } from '@/lib/email';

await sendEmail({
  to: user.email,
  templateKey: 'welcome',
  variables: {
    firstName: user.firstName,
    siteName: 'My SaaS',
  },
});
```

Available template variables: `{{firstName}}`, `{{lastName}}`, `{{planName}}`, `{{amount}}`, `{{siteName}}`, `{{siteUrl}}`, `{{dashboardUrl}}`, and more.

---

## 10. Testing

### Writing Unit Tests

```typescript
// tests/my-feature.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('my feature', () => {
  it('should do the thing', async () => {
    // Test business logic
  });
});
```

### Running Tests

```bash
npm test                          # All unit tests
npm test -- --watch               # Watch mode
npm test -- tests/my-feature.test.ts  # Single file
npm run test:e2e                  # E2E tests
```

### What to Test

- Business logic in `lib/` modules
- API route handlers (mock auth and DB)
- Subscription state transitions
- Payment webhook handling
- Token spending edge cases
- Auth guard behavior

---

## 11. Environment Variables

Key groups in `.env.local`:

| Group | Variables | Notes |
|-------|-----------|-------|
| Core | `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` | Required |
| Auth | `AUTH_PROVIDER`, `CLERK_*` or `AUTH_SECRET` | Pick one provider |
| Payments | `PAYMENT_PROVIDER`, `STRIPE_*` or others | Pick one provider |
| Email | `SMTP_*`, `EMAIL_FROM`, `SUPPORT_EMAIL` | For transactional email |
| Security | `ENCRYPTION_SECRET`, `INTERNAL_API_TOKEN` | Required for production |
| Storage | `LOGO_STORAGE`, `AWS_*` | Optional S3/CDN |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA_*` | Optional GA4 |

The `validate-env.js` script runs automatically before `dev` and `build` to check for required variables.

---

## 12. Deployment Checklist

- [ ] Set `DATABASE_URL` to a PostgreSQL instance
- [ ] Set all required auth provider env vars
- [ ] Set all required payment provider env vars
- [ ] Set `ENCRYPTION_SECRET` (for encrypting sensitive DB fields)
- [ ] Set `INTERNAL_API_TOKEN`, `HEALTHCHECK_TOKEN`, `CRON_PROCESS_EXPIRY_TOKEN`
- [ ] Configure SMTP for email delivery
- [ ] Set up webhook endpoints in provider dashboards
- [ ] Set `ALLOW_ADMIN_SCRIPT=false`
- [ ] Set up cron job for `/api/cron/process-expiry`
- [ ] Verify with `GET /api/health` (with Bearer token)
