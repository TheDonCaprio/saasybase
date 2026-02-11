import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { adminRateLimit } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { toError } from '@/lib/runtime-guards';
import { PaymentProviderFactory } from '@/lib/payment/factory';
import { getProviderCurrency } from '@/lib/payment/registry';
import { providerSupportsCoupons } from '@/lib/payment/provider-config';
import { filterProvidersForCatalogSync } from '@/lib/payment/catalog-sync';
import { providerSupportsOneTimePrices, setIdByProvider, getIdByProvider } from '@/lib/utils/provider-ids';
import { PaymentError } from '@/lib/payment/errors';

function unwrapPaymentError(err: unknown): { messages: string[]; root: unknown } {
  const messages: string[] = [];
  let cur: unknown = err;

  // Walk PaymentError.originalError chain (used by PaymentProviderError wrappers)
  for (let i = 0; i < 6; i += 1) {
    if (cur instanceof Error) messages.push(cur.message);
    if (cur instanceof PaymentError && cur.originalError != null) {
      cur = cur.originalError;
      continue;
    }
    break;
  }

  return { messages: Array.from(new Set(messages)).filter(Boolean), root: cur };
}

function isNotImplementedProviderError(err: unknown): boolean {
  const unwrapped = unwrapPaymentError(err);
  const messages = unwrapped.messages.map(m => m.toLowerCase());

  if (messages.some(m => m.includes('not implemented') || m.includes('not supported'))) return true;

  return false;
}

function looksLikeProviderPriceId(providerName: string, priceId: string): boolean {
  if (!priceId) return false;
  if (providerName === 'stripe') return priceId.startsWith('price_');
  if (providerName === 'paddle') return priceId.startsWith('pri_');
  if (providerName === 'paystack') return true; // plan_code formats vary
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin();
    const rl = await adminRateLimit(adminId, request, 'admin-billing:sync', { limit: 12, windowMs: 120_000 });

    if (!rl.success && !rl.allowed) {
      Logger.error('Admin billing sync rate limiter unavailable', { actorId: adminId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }

    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const scope = body && typeof body.scope === 'string' ? body.scope : 'all';

    const configuredProviders = filterProvidersForCatalogSync(PaymentProviderFactory.getAllConfiguredProviders());
    if (configuredProviders.length === 0) {
      return NextResponse.json({ error: 'No payment providers are configured.' }, { status: 400 });
    }

    const result = {
      providers: configuredProviders.map(p => p.name),
      plans: { scanned: 0, updated: 0, createdPrices: 0, errors: 0, skippedNotSupported: 0 },
      coupons: {
        scanned: 0,
        updated: 0,
        createdArtifacts: 0,
        errors: 0,
        skippedNoNativeSupport: 0,
        skippedExpired: 0,
        skippedNotSupported: 0,
      },
    };

    if (scope === 'all' || scope === 'plans') {
      const plans = await prisma.plan.findMany({
        select: {
          id: true,
          name: true,
          shortDescription: true,
          priceCents: true,
          autoRenew: true,
          recurringInterval: true,
          recurringIntervalCount: true,
          externalPriceIds: true,
          externalProductIds: true,
          stripePriceId: true,
          externalPriceId: true,
        },
      });

      result.plans.scanned = plans.length;

      for (const plan of plans) {
        let nextExternalPriceIds: string | null = plan.externalPriceIds;
        let nextExternalProductIds: string | null = plan.externalProductIds;
        let stripePriceIdToSet: string | null | undefined;
        let externalPriceIdToSet: string | null | undefined;
        let touched = false;

        for (const { name: providerName, provider } of configuredProviders) {
          const shouldCreate = Boolean(plan.autoRenew) || providerSupportsOneTimePrices(providerName);
          if (!shouldCreate) continue;

          // Razorpay enforces a minimum interval for daily period (daily requires interval_count >= 7).
          // We now support interval_count on the Plan model; skip with an actionable warning if it's too small.
          if (providerName === 'razorpay' && plan.autoRenew) {
            const interval = (plan.recurringInterval || 'month').toLowerCase();
            const intervalCount = typeof plan.recurringIntervalCount === 'number' ? plan.recurringIntervalCount : 1;
            if (interval === 'day' && intervalCount < 7) {
              result.plans.skippedNotSupported += 1;
              Logger.warn('Admin billing sync: skipping Razorpay daily plan (Razorpay requires interval_count >= 7)', {
                actorId: adminId,
                provider: providerName,
                planId: plan.id,
                planName: plan.name,
                interval,
                intervalCount,
                requiredMinIntervalCount: 7,
              });
              continue;
            }
          }

          const existing = getIdByProvider(plan.externalPriceIds, providerName, null);
          if (existing && looksLikeProviderPriceId(providerName, existing)) {
            continue;
          }

          try {
            const productId = providerName === 'razorpay'
              ? ''
              : await provider.createProduct({
                  name: plan.name,
                  description: plan.shortDescription || undefined,
                  metadata: { planId: plan.id },
                });

            const providerCurrency = getProviderCurrency(providerName);
            const price = await provider.createPrice({
              unitAmount: plan.priceCents,
              currency: providerCurrency,
              productId,
              recurring: plan.autoRenew
                ? {
                    interval: (plan.recurringInterval || 'month') as 'day' | 'week' | 'month' | 'year',
                    intervalCount: typeof plan.recurringIntervalCount === 'number' ? plan.recurringIntervalCount : 1,
                  }
                : undefined,
              metadata: { planId: plan.id, name: plan.name },
            });

            nextExternalPriceIds = setIdByProvider(nextExternalPriceIds, providerName, price.id);
			const productIdToPersist = providerName === 'razorpay'
				? (price.productId || null)
				: productId;
			nextExternalProductIds = productIdToPersist
				? setIdByProvider(nextExternalProductIds, providerName, productIdToPersist)
				: nextExternalProductIds;
            touched = true;
            result.plans.createdPrices += 1;

            if (providerName === 'stripe' && !plan.stripePriceId) {
              stripePriceIdToSet = price.id;
              externalPriceIdToSet = price.id;
            }
          } catch (e: unknown) {
            if (isNotImplementedProviderError(e)) {
              result.plans.skippedNotSupported += 1;
              Logger.warn('Admin billing sync: provider does not support plan catalog mutations (skipping)', {
                actorId: adminId,
                provider: providerName,
                planId: plan.id,
                error: toError(e).message,
              });
              continue;
            }

            result.plans.errors += 1;
            const unwrapped = unwrapPaymentError(e);
            Logger.error('Admin billing sync: failed to create plan price on provider', {
              actorId: adminId,
              provider: providerName,
              planId: plan.id,
              currency: getProviderCurrency(providerName),
              razorpayCurrencyOverride: providerName === 'razorpay' ? (process.env.RAZORPAY_CURRENCY || null) : null,
              error: toError(e).message,
              providerMessages: unwrapped.messages,
              providerRoot: unwrapped.root,
            });
          }
        }

        if (touched) {
          await prisma.plan.update({
            where: { id: plan.id },
            data: {
              externalPriceIds: nextExternalPriceIds,
              externalProductIds: nextExternalProductIds,
              ...(stripePriceIdToSet ? { stripePriceId: stripePriceIdToSet } : {}),
              ...(externalPriceIdToSet ? { externalPriceId: externalPriceIdToSet } : {}),
            },
          });
          result.plans.updated += 1;
        }
      }
    }

    if (scope === 'all' || scope === 'coupons') {
      const coupons = await prisma.coupon.findMany({
        select: {
          id: true,
          code: true,
          active: true,
          percentOff: true,
          amountOffCents: true,
          endsAt: true,
          externalCouponId: true,
          externalPromotionCodeId: true,
          externalCouponIds: true,
          externalPromotionCodeIds: true,
        },
      });

      result.coupons.scanned = coupons.length;

      for (const coupon of coupons) {
        const isExpired = Boolean(coupon.endsAt) && coupon.endsAt != null && coupon.endsAt.getTime() <= Date.now();

        let nextExternalCouponIds: string | null = coupon.externalCouponIds;
        let nextExternalPromotionCodeIds: string | null = coupon.externalPromotionCodeIds;
        let legacyCouponIdToSet: string | null | undefined;
        let legacyPromotionIdToSet: string | null | undefined;
        let touched = false;

        for (const { name: providerName, provider } of configuredProviders) {
          if (!providerSupportsCoupons(providerName)) {
            result.coupons.skippedNoNativeSupport += 1;
            continue;
          }

          const providerKey = providerName;
          const existingCouponId = getIdByProvider(nextExternalCouponIds, providerKey, null);
          const existingPromotionId = getIdByProvider(nextExternalPromotionCodeIds, providerKey, null);

          // Stripe (and others) will reject creating coupon/promo code artifacts with an expires_at in the past.
          // If this coupon is already expired, only keep existing artifacts; do not try to create new ones.
          if (isExpired && (!existingCouponId || !existingPromotionId)) {
            result.coupons.skippedExpired += 1;
            continue;
          }

          try {
            let ensuredCouponId = existingCouponId || null;
            let ensuredPromotionId = existingPromotionId || null;

            if (!ensuredCouponId) {
              const providerCurrency = getProviderCurrency(providerName);
              ensuredCouponId = await provider.createCoupon({
                duration: 'once',
                code: coupon.code,
                percentOff: coupon.percentOff || undefined,
                amountOff: coupon.amountOffCents || undefined,
                currency: coupon.amountOffCents ? providerCurrency : undefined,
                expiresAt: coupon.endsAt || undefined,
              });
              result.coupons.createdArtifacts += 1;
            }

            if (!ensuredPromotionId && ensuredCouponId) {
              ensuredPromotionId = await provider.createPromotionCode({
                couponId: ensuredCouponId,
                code: coupon.code,
                active: coupon.active,
                expiresAt: coupon.endsAt || undefined,
                metadata: { couponId: coupon.id },
              });
              result.coupons.createdArtifacts += 1;
            }

            if (ensuredCouponId && ensuredCouponId !== existingCouponId) {
              nextExternalCouponIds = setIdByProvider(nextExternalCouponIds, providerKey, ensuredCouponId);
              touched = true;
            }
            if (ensuredPromotionId && ensuredPromotionId !== existingPromotionId) {
              nextExternalPromotionCodeIds = setIdByProvider(nextExternalPromotionCodeIds, providerKey, ensuredPromotionId);
              touched = true;
            }

            // Keep legacy fields aligned with Stripe if present, otherwise with the first provider that created artifacts.
            if (providerName === 'stripe' && ensuredCouponId && ensuredPromotionId) {
              legacyCouponIdToSet = ensuredCouponId;
              legacyPromotionIdToSet = ensuredPromotionId;
            } else if (!legacyCouponIdToSet && ensuredCouponId) {
              legacyCouponIdToSet = ensuredCouponId;
            } else if (!legacyPromotionIdToSet && ensuredPromotionId) {
              legacyPromotionIdToSet = ensuredPromotionId;
            }
          } catch (e: unknown) {
            if (isNotImplementedProviderError(e)) {
              result.coupons.skippedNotSupported += 1;
              Logger.warn('Admin billing sync: provider does not support coupon catalog mutations (skipping)', {
                actorId: adminId,
                provider: providerName,
                couponId: coupon.id,
                error: toError(e).message,
              });
              continue;
            }

            result.coupons.errors += 1;
            const unwrapped = unwrapPaymentError(e);
            Logger.error('Admin billing sync: failed to ensure coupon artifacts on provider', {
              actorId: adminId,
              provider: providerName,
              couponId: coupon.id,
              error: toError(e).message,
              providerMessages: unwrapped.messages,
              providerRoot: unwrapped.root,
            });
          }
        }

        if (touched) {
          await prisma.coupon.update({
            where: { id: coupon.id },
            data: {
              externalCouponIds: nextExternalCouponIds,
              externalPromotionCodeIds: nextExternalPromotionCodeIds,
              ...(legacyCouponIdToSet ? { externalCouponId: legacyCouponIdToSet } : {}),
              ...(legacyPromotionIdToSet ? { externalPromotionCodeId: legacyPromotionIdToSet } : {}),
            },
          });
          result.coupons.updated += 1;
        }
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (e: unknown) {
    const guard = toAuthGuardErrorResponse(e);
    if (guard) return guard;

    const err = toError(e);
    Logger.error('Admin billing sync error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to sync billing catalog' }, { status: 500 });
  }
}
