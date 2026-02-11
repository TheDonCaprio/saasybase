import type { Coupon } from '@prisma/client';
import { prisma } from './prisma';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { providerSupportsCoupons, getActivePaymentProvider } from './payment/provider-config';
import { getProviderCurrency } from './payment/registry';
import { getIdByProvider, setIdByProvider } from './utils/provider-ids';
export { markRedemptionConsumed, getPendingRedemptionCount } from './couponRedemptions';

/**
 * Get the default currency for coupons, provider-aware
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Optional helper for Razorpay: extract an offer id embedded in the coupon description.
 *
 * This allows linking an app coupon to a Razorpay native Offer without changing the DB schema.
 * Supported patterns (case-insensitive), anywhere in `coupon.description`:
 * - `razorpayOfferId=offer_XXXX`
 * - `razorpay_offer: offer_XXXX`
 * - `rzp_offer=offer_XXXX`
 */
export function extractRazorpayOfferId(coupon: Pick<Coupon, 'description'>): string | null {
  const desc = typeof coupon.description === 'string' ? coupon.description : '';
  if (!desc) return null;

  const match = desc.match(
    /(?:razorpayOfferId|razorpay_offer|razorpay-offer|rzp_offer|rzpOfferId)\s*[:=]\s*(offer_[A-Za-z0-9]+)/i
  );
  return match?.[1] ?? null;
}

export function isCouponCurrentlyActive(coupon: Coupon, refDate: Date = new Date()): boolean {
  if (!coupon.active) return false;
  if (coupon.startsAt && coupon.startsAt > refDate) return false;
  if (coupon.endsAt && coupon.endsAt < refDate) return false;
  if (!coupon.percentOff && !coupon.amountOffCents) return false;
  return true;
}

/**
 * Check if a coupon is valid for a specific currency.
 * - Percent-off coupons work with any currency
 * - Amount-off coupons must match the transaction currency (if coupon.currency is set)
 * 
 * @param coupon The coupon to check
 * @param transactionCurrency The currency of the transaction (e.g., 'usd', 'ngn')
 * @returns true if the coupon is valid for this currency
 */
export function isCouponValidForCurrency(coupon: Coupon, transactionCurrency: string): boolean {
  // Percent-off coupons work with any currency
  if (coupon.percentOff && !coupon.amountOffCents) {
    return true;
  }

  // If coupon has no currency restriction, it works with any currency
  // (though this might lead to incorrect amounts for amount-off coupons)
  if (!coupon.currency) {
    return true;
  }

  // Compare currencies (case-insensitive)
  return coupon.currency.toLowerCase() === transactionCurrency.toLowerCase();
}

/**
 * Validates a coupon for use in a transaction.
 * Combines active status and currency compatibility checks.
 * 
 * @returns Object with valid flag and optional error message
 */
export function validateCouponForTransaction(
  coupon: Coupon,
  transactionCurrency: string,
  refDate: Date = new Date()
): { valid: boolean; error?: string } {
  if (!isCouponCurrentlyActive(coupon, refDate)) {
    return { valid: false, error: 'Coupon is not active or has expired' };
  }

  if (!isCouponValidForCurrency(coupon, transactionCurrency)) {
    return { 
      valid: false, 
      error: `This coupon is only valid for ${coupon.currency?.toUpperCase()} transactions` 
    };
  }

  return { valid: true };
}

export function calculateCouponDiscountCents(coupon: Coupon, priceCents: number): number {
  if (!coupon.percentOff && !coupon.amountOffCents) return 0;
  let discount = 0;
  if (coupon.percentOff) {
    discount = Math.round((priceCents * coupon.percentOff) / 100);
  } else if (coupon.amountOffCents) {
    discount = coupon.amountOffCents;
  }
  if (discount < 0) discount = 0;
  if (discount > priceCents) discount = priceCents;
  return discount;
}

/**
 * Result of ensuring a provider coupon
 */
export interface EnsureProviderCouponResult {
  coupon: Coupon;
  /** Whether the active provider supports native coupons */
  providerSupportsCoupons: boolean;
  /** 
   * For providers with native coupons: the promotion code ID to pass to checkout
   * For providers without: null (discount must be applied in-app)
   */
  promotionCodeId: string | null;
}

/**
 * Ensures a coupon has the necessary provider artifacts (for providers that support coupons)
 * or returns the coupon as-is for providers that require in-app discount handling.
 * 
 * @param coupon The database coupon
 * @returns Result containing the coupon and provider support info
 */
export async function ensureProviderCoupon(coupon: Coupon): Promise<EnsureProviderCouponResult> {
  // Check if payment provider is configured (generic check)
  if (!process.env.STRIPE_SECRET_KEY && !process.env.PAYMENT_PROVIDER) {
    Logger.warn('Skipping provider coupon bootstrap — missing configuration', { couponId: coupon.id });
    return { coupon, providerSupportsCoupons: false, promotionCodeId: null };
  }

  // Check if the active provider supports native coupons
  const activeProvider = getActivePaymentProvider();
  const supportsNativeCoupons = providerSupportsCoupons(activeProvider);

  if (!supportsNativeCoupons) {
    // Provider doesn't support native coupons - discount will be applied in-app
    Logger.info('Provider does not support native coupons, discount will be applied in-app', {
      couponId: coupon.id,
      couponCode: coupon.code,
      provider: activeProvider,
    });
    return { coupon, providerSupportsCoupons: false, promotionCodeId: null };
  }

  // Provider supports native coupons - create/verify provider artifacts
  const providerKey = activeProvider;
  // Prefer the provider map (multi-provider), fall back to legacy single-value fields
  let externalCouponId = getIdByProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coupon as any).externalCouponIds,
    providerKey,
    coupon.externalCouponId
  ) || null;
  let externalPromotionCodeId = getIdByProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coupon as any).externalPromotionCodeIds,
    providerKey,
    coupon.externalPromotionCodeId
  ) || null;

  try {
    const { paymentService } = await import('./payment/service');
    const provider = paymentService.provider;

    if (!externalCouponId) {
      const duration = coupon.duration === 'repeating' || coupon.duration === 'forever' || coupon.duration === 'once'
        ? coupon.duration
        : 'once';
      const durationInMonths = duration === 'repeating'
        ? (typeof coupon.durationInMonths === 'number' && coupon.durationInMonths > 0
          ? coupon.durationInMonths
          : 1)
        : undefined;
      const currency = getProviderCurrency(providerKey);

      externalCouponId = await provider.createCoupon({
        duration,
        durationInMonths,
        code: coupon.code,
        percentOff: coupon.percentOff || undefined,
        amountOff: coupon.amountOffCents || undefined,
        currency: coupon.amountOffCents ? currency : undefined,
        expiresAt: coupon.endsAt || undefined,
      });
    }

    if (!externalPromotionCodeId && externalCouponId) {
      externalPromotionCodeId = await provider.createPromotionCode({
        couponId: externalCouponId,
        code: coupon.code,
        active: coupon.active,
        expiresAt: coupon.endsAt || undefined,
        metadata: { couponId: coupon.id }
      });
    }
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to ensure provider promotion artifacts', { couponId: coupon.id, error: e.message, stack: e.stack });
    // Fall back to in-app discount handling
    return { coupon, providerSupportsCoupons: false, promotionCodeId: null };
  }

  // Persist the external IDs if they changed
  let updatedCoupon = coupon;
  const nextExternalCouponIds = setIdByProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coupon as any).externalCouponIds,
    providerKey,
    externalCouponId
  );
  const nextExternalPromotionCodeIds = setIdByProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coupon as any).externalPromotionCodeIds,
    providerKey,
    externalPromotionCodeId
  );

  // Keep legacy single-value fields updated for the active provider for backwards compatibility.
  const legacyCouponIdToPersist = externalCouponId;
  const legacyPromotionCodeIdToPersist = externalPromotionCodeId;

  if (
    legacyCouponIdToPersist !== coupon.externalCouponId ||
    legacyPromotionCodeIdToPersist !== coupon.externalPromotionCodeId ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextExternalCouponIds !== (coupon as any).externalCouponIds ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nextExternalPromotionCodeIds !== (coupon as any).externalPromotionCodeIds
  ) {
    try {
      updatedCoupon = await prisma.coupon.update({
        where: { id: coupon.id },
        data: {
          externalCouponId: legacyCouponIdToPersist,
          externalPromotionCodeId: legacyPromotionCodeIdToPersist,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(nextExternalCouponIds ? ({ externalCouponIds: nextExternalCouponIds } as any) : {}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(nextExternalPromotionCodeIds ? ({ externalPromotionCodeIds: nextExternalPromotionCodeIds } as any) : {}),
        },
      });
    } catch (err: unknown) {
      const e = toError(err);
      Logger.error('Failed to persist provider promotion metadata', { couponId: coupon.id, error: e.message });
      updatedCoupon = {
        ...coupon,
        externalCouponId: legacyCouponIdToPersist ?? null,
        externalPromotionCodeId: legacyPromotionCodeIdToPersist ?? null,
      };
    }
  }

  return {
    coupon: updatedCoupon,
    providerSupportsCoupons: true,
    promotionCodeId: externalPromotionCodeId,
  };
}

/**
 * Ensures a coupon has provider-native artifacts (coupon + promotion code) on *all*
 * configured providers that support coupons.
 *
 * This is best-effort: failures on one provider will not block others.
 *
 * Persists per-provider ID maps (`externalCouponIds`, `externalPromotionCodeIds`) and
 * keeps legacy single-value fields aligned (prefers Stripe when present).
 */
export async function ensureCouponArtifactsAcrossProviders(coupon: Coupon): Promise<Coupon> {
  const { PaymentProviderFactory } = await import('./payment/factory');
  const { filterProvidersForCatalogSync } = await import('./payment/catalog-sync');
  const configuredProviders = filterProvidersForCatalogSync(PaymentProviderFactory.getAllConfiguredProviders());
  if (configuredProviders.length === 0) return coupon;

  // Use per-provider maps when present; fall back to legacy single-value fields per provider.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextExternalCouponIds: string | null = ((coupon as any).externalCouponIds as string | null) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nextExternalPromotionCodeIds: string | null = ((coupon as any).externalPromotionCodeIds as string | null) ?? null;

  let legacyCouponIdToSet: string | null | undefined;
  let legacyPromotionIdToSet: string | null | undefined;
  let touched = false;

  for (const { name: providerName, provider } of configuredProviders) {
    if (!providerSupportsCoupons(providerName)) continue;

    const providerKey = providerName;
    const existingCouponId = getIdByProvider(nextExternalCouponIds, providerKey, coupon.externalCouponId) || null;
    const existingPromotionId =
      getIdByProvider(nextExternalPromotionCodeIds, providerKey, coupon.externalPromotionCodeId) || null;

    try {
      let ensuredCouponId = existingCouponId;
      let ensuredPromotionId = existingPromotionId;

      if (!ensuredCouponId) {
        const duration = coupon.duration === 'repeating' || coupon.duration === 'forever' || coupon.duration === 'once'
          ? coupon.duration
          : 'once';
        const durationInMonths = duration === 'repeating'
          ? (typeof coupon.durationInMonths === 'number' && coupon.durationInMonths > 0
            ? coupon.durationInMonths
            : 1)
          : undefined;
        const providerCurrency = getProviderCurrency(providerName);
        ensuredCouponId = await provider.createCoupon({
          duration,
          durationInMonths,
          code: coupon.code,
          percentOff: coupon.percentOff || undefined,
          amountOff: coupon.amountOffCents || undefined,
          currency: coupon.amountOffCents ? providerCurrency : undefined,
          expiresAt: coupon.endsAt || undefined,
        });
      }

      if (!ensuredPromotionId && ensuredCouponId) {
        ensuredPromotionId = await provider.createPromotionCode({
          couponId: ensuredCouponId,
          code: coupon.code,
          active: coupon.active,
          expiresAt: coupon.endsAt || undefined,
          metadata: { couponId: coupon.id },
        });
      }

      if (ensuredCouponId && ensuredCouponId !== existingCouponId) {
        nextExternalCouponIds = setIdByProvider(nextExternalCouponIds, providerKey, ensuredCouponId);
        touched = true;
      }
      if (ensuredPromotionId && ensuredPromotionId !== existingPromotionId) {
        nextExternalPromotionCodeIds = setIdByProvider(nextExternalPromotionCodeIds, providerKey, ensuredPromotionId);
        touched = true;
      }

      // Keep legacy fields aligned with Stripe if present, otherwise with the first provider.
      if (providerName === 'stripe' && ensuredCouponId && ensuredPromotionId) {
        legacyCouponIdToSet = ensuredCouponId;
        legacyPromotionIdToSet = ensuredPromotionId;
      } else if (!legacyCouponIdToSet && ensuredCouponId) {
        legacyCouponIdToSet = ensuredCouponId;
      } else if (!legacyPromotionIdToSet && ensuredPromotionId) {
        legacyPromotionIdToSet = ensuredPromotionId;
      }
    } catch (err: unknown) {
      const e = toError(err);
      Logger.error('Failed to ensure coupon artifacts on provider', {
        couponId: coupon.id,
        couponCode: coupon.code,
        provider: providerName,
        error: e.message,
        stack: e.stack,
      });
      continue;
    }
  }

  if (!touched && !legacyCouponIdToSet && !legacyPromotionIdToSet) {
    return coupon;
  }

  try {
    return await prisma.coupon.update({
      where: { id: coupon.id },
      data: {
        ...(typeof nextExternalCouponIds === 'string' ? { externalCouponIds: nextExternalCouponIds } : {}),
        ...(typeof nextExternalPromotionCodeIds === 'string'
          ? { externalPromotionCodeIds: nextExternalPromotionCodeIds }
          : {}),
        ...(legacyCouponIdToSet ? { externalCouponId: legacyCouponIdToSet } : {}),
        ...(legacyPromotionIdToSet ? { externalPromotionCodeId: legacyPromotionIdToSet } : {}),
      },
    });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to persist multi-provider coupon artifacts', { couponId: coupon.id, error: e.message });
    return coupon;
  }
}

export async function syncProviderPromotionState(coupon: Coupon): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY && !process.env.PAYMENT_PROVIDER) return;
  
  // Only sync if provider supports native coupons
  if (!providerSupportsCoupons()) {
    Logger.debug('Skipping promotion sync - provider does not support native coupons', { couponId: coupon.id });
    return;
  }
  
  const activeProvider = getActivePaymentProvider();
  const promotionId = getIdByProvider(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coupon as any).externalPromotionCodeIds,
    activeProvider,
    coupon.externalPromotionCodeId
  );

  if (!promotionId) return;
  
  try {
    const { paymentService } = await import('./payment/service');
    const provider = paymentService.provider;
    await provider.updatePromotionCode(promotionId, coupon.active);
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to sync provider promotion state', { couponId: coupon.id, error: e.message });
  }
}
