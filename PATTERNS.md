# PATTERNS.md — Codebase Patterns & Conventions

> This document catalogs the recurring design patterns used throughout SaaSyBase. Follow these patterns when extending the codebase to maintain consistency.

---

## 1. Provider Abstraction Pattern

Both auth and payments use the same layered abstraction:

```
Interface (types.ts)
  → Provider implementations (providers/*.ts)
    → Registry (registry.ts) — maps env var to provider config
      → Factory (factory.ts) — instantiates the active provider
        → Service (service.ts) — singleton with convenience methods
```

### How it works

```typescript
// Registry defines all available providers
export const PAYMENT_PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  stripe:   { Class: StripeProvider,   envVarCheck: () => { ... }, ... },
  paystack: { Class: PaystackProvider, envVarCheck: () => { ... }, ... },
};

// Factory reads PAYMENT_PROVIDER env var and returns the active one
const provider = PaymentProviderFactory.getProvider();

// Feature detection prevents calling unsupported methods
if (provider.supportsFeature('proration')) {
  const preview = await provider.getProrationPreview(...);
}
```

**Used for:** Auth providers, Payment providers  
**Why:** Allows swapping providers via env vars without code changes. Dead-code elimination at build time removes unused providers.

---

## 2. Dual-Column Query Pattern

The database has both legacy Stripe-specific columns and generic multi-provider columns. Always query both:

```typescript
// ✅ Correct — checks both columns
const subscription = await prisma.subscription.findFirst({
  where: {
    OR: [
      { externalSubscriptionId: providerId },
      { stripeSubscriptionId: providerId },
    ],
  },
});

// ❌ Wrong — misses legacy Stripe data
const subscription = await prisma.subscription.findFirst({
  where: { externalSubscriptionId: providerId },
});
```

**Columns affected:**
- `Subscription`: `externalSubscriptionId` — primary identifier for provider subscriptions
- `Subscription`: `externalPriceId` — provider-specific price reference
- `Payment`: `externalSessionId` — provider checkout session ID
- `User`: `stripeCustomerId` — exists as legacy for Stripe-created customers

> **Note:** The legacy `stripeSubscriptionId` and `stripePriceId` columns have been removed. If you're working with older data that might pre-date the migration, use the `externalSubscriptionIds` JSON map on the Subscription model.

**Why:** Multi-provider support with clean provider-agnostic identifiers.

---

## 3. API Route Pattern

All API routes follow this structure:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider/service';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { handleApiError, ApiError } from '@/lib/api-error';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ /* ... */ });

export async function POST(req: NextRequest) {
  try {
    await rateLimit('feature-name', RATE_LIMITS.API_GENERAL);
    
    // 2. Authentication
    const userId = await authService.requireUserId();
    
    // 3. Input validation
    const body = schema.parse(await req.json());
    
    // 4. Authorization (if needed)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw ApiError.forbidden();
    
    // 5. Business logic
    const result = await doTheWork(body);
    
    // 6. Response
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Key elements:** Rate limit → Auth → Validate → Authorize → Logic → Response → Error handling

---

## 4. Settings Pattern

App-wide configuration uses a key-value store with in-memory caching:

```typescript
import { getSetting, setSetting, SETTING_KEYS, SETTING_DEFAULTS } from '@/lib/settings';

// Read with fallback to default
const siteName = await getSetting(SETTING_KEYS.SITE_NAME, SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);

// Write
await setSetting(SETTING_KEYS.SITE_NAME, 'My SaaS');

// Batch read
const settings = await getSettings([SETTING_KEYS.SITE_NAME, SETTING_KEYS.SITE_LOGO]);
```

60+ setting keys cover: site branding, token policies, theme colors, blog config, pricing layout, header/footer, email settings, moderator permissions, and more.

**Cache:** 5-second TTL prevents redundant DB reads within a single request cycle.

---

## 5. Feature Gating Pattern

Features are gated behind plan subscriptions using a registry + gate component:

```typescript
// 1. Define features in lib/features.ts
export enum FeatureId {
  WATERMARK_REMOVAL = 'WATERMARK_REMOVAL',
  MY_NEW_FEATURE = 'MY_NEW_FEATURE',
}

export const PRO_FEATURES: FeatureId[] = [
  FeatureId.WATERMARK_REMOVAL,
  FeatureId.MY_NEW_FEATURE,
];

// 2. Gate in server components
<FeatureGate feature={FeatureId.MY_NEW_FEATURE}>
  <ProOnlyComponent />
</FeatureGate>
```

The gate checks **both** personal subscriptions and organization team plans. If the user's org has an active plan, access is granted.

---

## 6. Token Spending Pattern

Three token buckets with configurable spending order:

```
Paid Tokens (User.tokenBalance)
  → Shared Tokens (Organization.tokenBalance)  
    → Free Tokens (User.freeTokenBalance)
```

Spending is always server-side via `POST /api/internal/spend-tokens`:

```json
{
  "userId": "user_123",
  "amount": 10,
  "bucket": "auto",
  "feature": "image_export"
}
```

| Bucket | Behavior |
|--------|----------|
| `auto` | Paid → shared → free (default) |
| `paid` | Only paid tokens |
| `free` | Only free tokens |
| `shared` | Only organization pool |

Returns `409` with `{ error: "insufficient_tokens" }` when balance is too low.

---

## 7. Webhook Signature Verification Pattern

All webhook endpoints verify signatures before processing:

```typescript
// Centralized endpoint auto-detects provider from headers
const headers = req.headers;
if (headers.get('stripe-signature'))       → Stripe handler
if (headers.get('x-paystack-signature'))   → Paystack handler
if (headers.get('paddle-signature'))       → Paddle handler
if (headers.get('x-razorpay-signature'))   → Razorpay handler
```

**Rotation support:** Webhook secrets accept comma-separated values for key rotation:
```bash
STRIPE_WEBHOOK_SECRET="whsec_current,whsec_rotating"
```

---

## 8. Error Handling Pattern

Two complementary error systems:

### API Errors (`lib/api-error.ts`)
For HTTP response errors in API routes:

```typescript
throw ApiError.unauthorized();           // 401
throw ApiError.forbidden();              // 403
throw ApiError.notFound('User');         // 404
throw ApiError.badRequest('Invalid ID'); // 400
throw ApiError.rateLimited();            // 429
throw ApiError.paymentRequired('...');   // 402
```

### Secure Errors (`lib/secure-errors.ts`)
For domain errors with production safety:

```typescript
throw new ValidationError('Invalid email format');
throw new AuthenticationError('Session expired');
throw new PaymentError('Charge declined');

// Response helper hides internals in production
return createErrorResponse(error, 'Something went wrong');
```

**Key:** In production, `createErrorResponse()` strips internal details and adds `X-Request-ID` for debugging.

---

## 9. Rate Limiting Pattern

Database-backed rate limiting with preconfigured tiers:

```typescript
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// In API routes
await rateLimit('checkout-create', RATE_LIMITS.CHECKOUT);  // 5 req / 1 min
await rateLimit('api-general', RATE_LIMITS.API_GENERAL);   // 100 req / 15 min
await rateLimit('password-change', RATE_LIMITS.API_SENSITIVE); // 10 req / 15 min
```

**Features:**
- Composite keys (IP + User-Agent)
- Response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Fail-open option for webhooks (`skipOnError: true`)
- Automatic bucket cleanup every ~100 requests

---

## 10. Logging Pattern

Structured, secure logging with auto-redaction:

```typescript
import { Logger } from '@/lib/logger';

Logger.info('Checkout completed', { userId, planId, amount });
Logger.warn('Retry exhausted', { provider: 'stripe', attempts: 3 });
Logger.error('Webhook failed', error, { endpoint: '/api/webhooks/payments' });
```

**Auto-redacted keys:** password, token, secret, authorization, api_key, stripe_secret, cookie, session

**DB persistence:** WARN and ERROR logs are saved to the `SystemLog` model (viewable at `/admin/logs`). Auto-pruning at 1,000 entries.

---

## 11. Subscription Lifecycle Pattern

```
Checkout → Payment → Subscription Created → Active
  ↓
Cancel at period end → Expiry → Expired
  ↓                      ↓
Undo cancel          Grace period → Expired (final)
  ↓
Reactivated

Upgrade/Downgrade:
  Active → Proration preview → New plan → Webhook confirms → Updated
```

State stored in `Subscription.status`: `ACTIVE`, `CANCELLED`, `EXPIRED`, `PAST_DUE`, `TRIALING`

On expiry:
- Subscription marked expired
- Organization dismantled (if team plan)
- Tokens optionally reset (configurable via settings)

---

## 12. Organization/Team Pattern

```
User purchases Team Plan
  → ensureTeamOrganization() creates Organization
  → Owner invited automatically
  → Members invited via email tokens

Subscription lapses
  → syncOrganizationEligibilityForUser() dismantles org
  → Member access revoked
  → Token pool cleared
```

**Token pool strategies:**
- `SHARED_FOR_ORG` — Shared pool, per-member caps optional
- Member caps: `SOFT` (warn) or `HARD` (block)
- Owner exempt from caps

---

## 13. Theme/Branding Pattern

Server-side CSS variable generation in `app/layout.tsx`:

```typescript
const colorPalette = await getThemeColorPalette();

// Generates CSS custom properties for both light and dark mode
const css = `
  html.light {
    --bg-primary: ${colorPalette.light.bgPrimary};
    --accent-primary: ${colorPalette.light.accentPrimary};
    /* 60+ tokens */
  }
  html.dark {
    --bg-primary: ${colorPalette.dark.bgPrimary};
    /* ... */
  }
`;
```

All colors, gradients, header/footer styles, and layout settings are admin-configurable via `/admin/theme` without code changes.

---

## 14. Parallel Data Loading Pattern

Server components load data in parallel using `Promise.all`:

```typescript
// app/layout.tsx
const [headerLinks, footerLinks, customCss, colorPalette, ...] = await Promise.all([
  getThemeHeaderLinks(),
  getThemeFooterLinks(),
  getThemeCustomCss(),
  getThemeColorPalette(),
]);
```

**Why:** Avoids waterfall queries. Each `getSetting()` call would otherwise require a sequential round-trip.

---

## 15. Validation Schema Pattern

Centralized Zod schemas in `lib/validation.ts`:

```typescript
export const commonSchemas = {
  nonEmptyString: z.string().min(1).max(255),
  email: z.string().email(),
  userId: z.string().cuid(),
  pagination: z.object({
    page: z.coerce.number().min(1).max(1000).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
  }),
};

export const apiSchemas = {
  supportTicket: z.object({ subject: ..., message: ..., priority: ... }),
  // ...domain-specific schemas
};
```

**Always use these** rather than ad-hoc validation. Extend `commonSchemas` or `apiSchemas` for new features.

---

## 16. Prisma Singleton Pattern

```typescript
// lib/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({ log: ['error'] });
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ log: ['query', 'info', 'warn', 'error'] });
  }
  prisma = globalForPrisma.prisma;
}
```

**Why:** Prevents connection pool exhaustion during Next.js hot reload in development.

---

## 17. Email Template Variable Pattern

Templates use `{{variable}}` syntax, resolved from a standard variable set:

```typescript
// Available in all templates
{{firstName}}, {{lastName}}, {{fullName}}, {{userEmail}}
{{planName}}, {{amount}}, {{transactionId}}, {{tokenAmount}}
{{siteName}}, {{supportEmail}}, {{siteUrl}}, {{siteLogo}}
{{accentColor}}, {{accentHoverColor}}
{{dashboardUrl}}, {{billingUrl}}
```

Templates are editable from `/admin/emails` via a plain HTML editor. Both HTML and plain-text versions are stored.

---

## 18. Multi-Currency Pattern

Currency resolution priority:

1. Provider-specific env var (`PADDLE_CURRENCY`, `PAYSTACK_CURRENCY`)
2. Admin setting (`DEFAULT_CURRENCY` in DB)
3. Environment fallback (`PAYMENTS_CURRENCY`)
4. Provider default (NGN for Paystack, INR for Razorpay, USD for Stripe/Paddle)

**Per-plan localized pricing** via `PlanPrice` model:
- Stripe: $10 USD
- Paystack: ₦15,000 NGN
- Same plan, different currencies, different amounts.
