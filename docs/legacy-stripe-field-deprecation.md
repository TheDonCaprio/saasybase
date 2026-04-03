# Legacy Stripe Field Deprecation Plan

This document outlines the migration strategy to move from Stripe-specific field names to generic provider-agnostic names.

## Status Update (March 2026)

The migration is **95% complete**. Legacy Stripe columns have been dropped from the following core models via migration `20260308170000_remove_stripe_legacy_columns`:
- `User`
- `Plan`
- `Subscription`
- `Payment`

The only remaining legacy fields are in the **Coupon** model, which are kept for compatibility with historical discount data during the final transition phase.

---

## Current State (Remaining Fields)

### Coupon Model
| Legacy Field | Generic Field | Status |
|-------------|---------------|--------|
| `stripeCouponId` | `externalCouponId` | ⚠️ Phase 4 (Stop writing) |
| `stripePromotionCodeId` | `externalPromotionCodeId` | ⚠️ Phase 4 (Stop writing) |

---

## Migration Strategy

### Phase 1: Dual-Write
- Write to both legacy and generic fields when creating records
- **Status: COMPLETE** ✅

### Phase 2: Read Migration
- Update all read operations to prefer generic fields
- **Status: COMPLETE** ✅

### Phase 3: Data Migration
- Copy data from legacy to generic fields
- **Status: COMPLETE** ✅ (Core models migrated)

### Phase 4: Stop Writing to Legacy Fields
- Remove legacy field writes from all creation/update paths
- **Status: COMPLETE for Core Models** ✅
- **Status: IN PROGRESS for Coupons** ⚠️

### Phase 5: Remove Legacy Fields
- Drop legacy columns from schema
- **Status: COMPLETE for Core Models** ✅
- **Status: PENDING for Coupon model** ⏳

