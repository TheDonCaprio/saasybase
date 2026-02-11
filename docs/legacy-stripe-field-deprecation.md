# Legacy Stripe Field Deprecation Plan

This document outlines the migration strategy to move from Stripe-specific field names to generic provider-agnostic names.

## Current State

### User Model
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripeCustomerId` | `externalCustomerId` | ✅ Generic field exists |

### Plan Model  
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripePriceId` | `externalPriceId` | ✅ Generic field exists |
| `stripeProductId` | `externalProductId` | ✅ Generic field exists |
| - | `externalPriceIds` (JSON) | ✅ Multi-provider map exists |

### Subscription Model
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripeSubscriptionId` | `externalSubscriptionId` | ✅ Generic field exists |
| - | `externalSubscriptionIds` (JSON) | ✅ Multi-provider map exists |
| - | `paymentProvider` | ✅ Tracks originating provider |

### Payment Model
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripePaymentIntentId` | `externalPaymentIntentId` | ✅ Generic field exists |
| `stripeCheckoutSessionId` | `externalCheckoutSessionId` | ✅ Generic field exists |
| - | `paymentProvider` | ✅ Tracks originating provider |

### Coupon Model
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripeCouponId` | `externalCouponId` | ✅ Generic field exists |
| `stripePromotionCodeId` | `externalPromotionCodeId` | ✅ Generic field exists |

## Migration Strategy

### Phase 1: Dual-Write (Current)
- Write to both legacy and generic fields when creating records
- Read from generic field first, fall back to legacy
- **Status: COMPLETE** ✅

### Phase 2: Read Migration (This Phase)
- Update all read operations to prefer generic fields
- Keep legacy fields for backward compatibility
- Add deprecation warnings in code comments

### Phase 3: Data Migration
Run migration script to copy data from legacy to generic fields:

```sql
-- User: Copy stripeCustomerId to externalCustomerId where missing
UPDATE "User" 
SET "externalCustomerId" = "stripeCustomerId" 
WHERE "externalCustomerId" IS NULL AND "stripeCustomerId" IS NOT NULL;

-- Plan: Copy stripePriceId to externalPriceId where missing  
UPDATE "Plan"
SET "externalPriceId" = "stripePriceId"
WHERE "externalPriceId" IS NULL AND "stripePriceId" IS NOT NULL;

-- Plan: Copy stripeProductId to externalProductId where missing
UPDATE "Plan"
SET "externalProductId" = "stripeProductId"
WHERE "externalProductId" IS NULL AND "stripeProductId" IS NOT NULL;

-- Subscription: Copy stripeSubscriptionId to externalSubscriptionId where missing
UPDATE "Subscription"
SET "externalSubscriptionId" = "stripeSubscriptionId"
WHERE "externalSubscriptionId" IS NULL AND "stripeSubscriptionId" IS NOT NULL;

-- Payment: Copy stripePaymentIntentId to externalPaymentIntentId where missing
UPDATE "Payment"
SET "externalPaymentIntentId" = "stripePaymentIntentId"
WHERE "externalPaymentIntentId" IS NULL AND "stripePaymentIntentId" IS NOT NULL;

-- Payment: Copy stripeCheckoutSessionId to externalCheckoutSessionId where missing
UPDATE "Payment"
SET "externalCheckoutSessionId" = "stripeCheckoutSessionId"
WHERE "externalCheckoutSessionId" IS NULL AND "stripeCheckoutSessionId" IS NOT NULL;
```

### Phase 4: Stop Writing to Legacy Fields
- Remove legacy field writes from all creation/update paths
- Add @deprecated JSDoc comments to legacy fields in schema

### Phase 5: Remove Legacy Fields
- After confirming no external dependencies:
  1. Add Prisma migration to drop legacy columns
  2. Remove legacy field references from codebase
  3. Update schema.prisma

## Timeline Recommendation

| Phase | Duration | Risk Level |
|-------|----------|------------|
| Phase 1 | ✅ Complete | - |
| Phase 2 | 1 sprint | Low |
| Phase 3 | 1 day | Low (data migration) |
| Phase 4 | 1 sprint | Medium |
| Phase 5 | After 2+ releases | Low |

## Code Locations to Update

### Read Operations (Phase 2)
Files that read legacy fields and should prefer generic:
- `lib/payment/service.ts` - Multiple subscription/payment lookups
- `app/api/billing/*.ts` - Billing routes
- `app/api/admin/**/*.ts` - Admin routes
- `components/billing/*.tsx` - Billing components

### Write Operations (Phase 4)
Files that write legacy fields:
- `lib/payment/service.ts` - handleCheckoutCompleted, handleSubscriptionUpdated
- `app/api/checkout/*.ts` - Checkout routes
- `app/api/admin/plans/*.ts` - Plan management

## Verification Checklist

Before Phase 5 (removal):
- [ ] All reads use generic fields
- [ ] All writes only use generic fields
- [ ] Data migration verified (no records with legacy-only values)
- [ ] No external integrations depend on legacy field names
- [ ] At least 2 releases with dual-read support
