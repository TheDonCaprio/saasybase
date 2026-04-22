# CONVENTIONS.md — Naming, Structure, and Code Conventions

> Quick-reference for naming patterns, file placement, and conventions used throughout SaaSyBase.

---

## File & Directory Conventions

### Where to Put Things

| What You're Adding | Where It Goes |
|-------------------|---------------|
| New public page | `app/<page-name>/page.tsx` |
| New dashboard page | `app/dashboard/<page-name>/page.tsx` |
| New admin page | `app/admin/<page-name>/page.tsx` |
| New API endpoint | `app/api/<domain>/route.ts` |
| New API with dynamic param | `app/api/<domain>/[id]/route.ts` |
| Server-side business logic | `lib/<domain>.ts` or `lib/<domain>/` |
| React component (generic) | `components/ui/<ComponentName>.tsx` |
| React component (domain) | `components/<domain>/<ComponentName>.tsx` |
| React hook (global) | `hooks/use<Name>.ts` |
| React hook (component-level) | `components/hooks/use<Name>.ts` |
| TypeScript types | `types/<domain>.ts` |
| Client utility | `utils/<name>.ts` |
| Unit test | `tests/<feature-name>.test.ts` |
| E2E test | `tests/e2e/<feature-name>.spec.ts` |
| Database migration | `npx prisma migrate dev --name <name>` (auto-generated) |
| Operational script | `scripts/<action-name>.ts` |
| Documentation | `docs/<topic>.md` |

### Naming Patterns

| Type | Convention | Example |
|------|-----------|---------|
| React component files | `PascalCase.tsx` | `PricingCard.tsx` |
| Lib/util/hook files | `kebab-case.ts` | `subscription-utils.ts` |
| Test files | `kebab-case.test.ts` | `stripe-webhook.test.ts` |
| E2E test files | `kebab-case.spec.ts` | `dashboard-navigation-smoke.spec.ts` |
| API route files | `route.ts` | `app/api/checkout/route.ts` |
| Layout files | `layout.tsx` | `app/dashboard/(valid)/layout.tsx` |
| Page files | `page.tsx` | `app/pricing/page.tsx` |
| Config files | Standard names | `next.config.mjs`, `tailwind.config.ts` |

---

## Code Conventions

### Imports

```typescript
// 1. External packages
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// 2. Internal modules (use @/ alias)
import { authService } from '@/lib/auth-provider/service';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';

// 3. Types (if separate)
import type { AuthSession } from '@/lib/auth-provider/types';
```

### Server vs Client Components

```typescript
// Server component (default) — no directive needed
export default async function MyPage() {
  const data = await prisma.user.findMany();
  return <div>{/* ... */}</div>;
}

// Client component — only when using hooks, event handlers, or browser APIs
'use client';
export function MyInteractiveWidget() {
  const [state, setState] = useState();
  return <button onClick={() => setState(!state)}>Toggle</button>;
}
```

### API Routes

```typescript
// Standard user-scoped structure:
export async function GET(req: NextRequest) {
  try {
    await rateLimit(key, tier);
    const userId = await authService.requireUserId();
    // ... logic
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

For admin or moderator endpoints, reuse the established guard helpers for that area instead of forcing `authService.requireUserId()` everywhere.

### Database Queries

```typescript
// Use the singleton
import { prisma } from '@/lib/prisma';

// Use external identifiers for standard querying
const sub = await prisma.subscription.findFirst({
  where: { externalSubscriptionId: id },
});

// For complex multi-provider lookups backwards compatibility, check externalSubscriptionIds JSON map
```

### Error Throwing

```typescript
// In API routes — use ApiError for HTTP errors
throw ApiError.notFound('User');
throw ApiError.forbidden();
throw ApiError.badRequest('Invalid plan ID');

// In lib modules — use domain errors
throw new ValidationError('Email is required');
throw new PaymentError('Charge declined');
```

### Logging

```typescript
// Always use the Logger, never console.log
import { Logger } from '@/lib/logger';

Logger.info('Action completed', { userId, action });
Logger.warn('Deprecated API called', { endpoint });
Logger.error('External service failed', error);
```

---

## Environment Variable Conventions

| Prefix | Scope | Example |
|--------|-------|---------|
| `NEXT_PUBLIC_` | Client-side (bundled into JS) | `NEXT_PUBLIC_APP_URL` |
| `STRIPE_` | Stripe provider config | `STRIPE_SECRET_KEY` |
| `PAYSTACK_` | Paystack provider config | `PAYSTACK_SECRET_KEY` |
| `PADDLE_` | Paddle provider config | `PADDLE_API_KEY` |
| `RAZORPAY_` | Razorpay provider config | `RAZORPAY_KEY_ID` |
| `CLERK_` | Clerk auth config | `CLERK_SECRET_KEY` |
| `AUTH_` | NextAuth config | `AUTH_SECRET` |
| `SMTP_` | Email config | `SMTP_HOST` |
| `AWS_` / `LOGO_` | Storage config | `AWS_ACCESS_KEY_ID` |
| `GA_` | Analytics config | `GA_PROPERTY_ID` |
| `DEV_` | Dev-only helpers | Avoid new runtime privilege shortcuts |
| `SEED_` | Seeding config | `SEED_ADMIN_EMAIL` |
| `PAYMENT_` | Payment provider selection and shared catalog config | `PAYMENT_PROVIDER`, `PAYMENT_AUTO_CREATE` |

Seeded plans no longer rely on manual `PAYMENT_PRICE_*` or `SUBSCRIPTION_PRICE_*` environment variables in the standard setup. Provider price IDs are stored in the database and synced through the catalog flow.

---

## Component Conventions

### Reusable UI Components (`components/ui/`)

These are provider-agnostic, style-consistent primitives:

| Component | Props Pattern | Usage |
|-----------|--------------|-------|
| `Modal` | `isOpen`, `onClose`, `title`, `children` | Overlay dialogs |
| `ConfirmModal` | `isOpen`, `onConfirm`, `onCancel`, `message` | Destructive action confirmation |
| `Toast` | Via `ToastContainer` + event system | Status messages |
| `Pagination` | `page`, `totalPages`, `onPageChange` | Paginated lists |
| `ListFilters` | `filters`, `onFilterChange` | Filterable tables |
| `SortControls` | `sortBy`, `sortOrder`, `onSort` | Sortable columns |
| `Breadcrumbs` | `items: { label, href }[]` | Navigation breadcrumbs |
| `Stat` | `label`, `value`, `icon`, `trend` | Dashboard stat cards |

### Always check `components/ui/` before creating a new primitive.

---

## Settings Conventions

Settings are stored as key-value pairs in the `Setting` model. Keys use `SCREAMING_SNAKE_CASE`:

```typescript
// Defined in lib/settings.ts
SETTING_KEYS.SITE_NAME         // 'SITE_NAME'
SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT  // 'FREE_PLAN_TOKEN_LIMIT'
SETTING_KEYS.THEME_COLOR_PALETTE    // 'THEME_COLOR_PALETTE'
```

Always use `getSetting(key, default)` with a fallback value. Don't assume settings exist.

---

## Test Conventions

- **One test file per feature/module** in `tests/`
- **Descriptive test names** that explain the scenario: `'should reject checkout when subscription is already active'`
- **Mock external dependencies** (auth, payment providers, prisma) — don't call real services
- **Test both happy paths and error cases**
- **Use `beforeEach` to reset mocks** between tests

```typescript
describe('featureName', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  
  it('should handle the expected case', async () => { /* ... */ });
  it('should return 401 when unauthenticated', async () => { /* ... */ });
  it('should return 400 for invalid input', async () => { /* ... */ });
});
```
