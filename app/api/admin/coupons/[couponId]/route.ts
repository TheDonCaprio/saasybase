import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-actions';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { asRecord, toError } from '@/lib/runtime-guards';
import { normalizeCouponCode, ensureProviderCoupon, syncProviderPromotionState } from '@/lib/coupons';
import { getActivePaymentProvider } from '@/lib/payment/provider-config';
import { getProviderCurrency } from '@/lib/payment/registry';

import type { Coupon, Prisma } from '@prisma/client';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sanitizeDescription(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') return null;
  return input.slice(0, 255);
}

async function fetchCouponOr404(id: string): Promise<Coupon | null> {
  try {
    return await prisma.coupon.findUnique({ where: { id } });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Failed to fetch coupon', { couponId: id, error: e.message });
    return null;
  }
}

const couponInclude = {
  applicablePlans: {
    include: {
      plan: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.CouponInclude;

export async function PUT(request: NextRequest, context: { params: Promise<{ couponId: string }> }) {
  const { couponId } = await context.params;
  try {
    const actorId = await requireAdmin();
    const existing = await fetchCouponOr404(couponId);
    if (!existing) {
      return jsonError('Coupon not found', 404, 'COUPON_NOT_FOUND');
    }

    const raw = await request.json().catch(() => null) as unknown;
    const body = asRecord(raw) || {};

    if (body.code && normalizeCouponCode(String(body.code)) !== existing.code) {
      return jsonError('Coupon code cannot be changed. Delete and recreate the coupon instead.', 400, 'COUPON_CODE_IMMUTABLE');
    }

    if (body.percentOff !== undefined && Number(body.percentOff) !== existing.percentOff) {
      return jsonError('Changing discount values is not supported. Please create a new coupon.', 400, 'COUPON_DISCOUNT_IMMUTABLE');
    }

    if (body.amountOffCents !== undefined && Number(body.amountOffCents) !== existing.amountOffCents) {
      return jsonError('Changing discount values is not supported. Please create a new coupon.', 400, 'COUPON_DISCOUNT_IMMUTABLE');
    }

    if (body.duration !== undefined && String(body.duration) !== String(existing.duration)) {
      return jsonError('Changing coupon duration is not supported. Delete and recreate the coupon instead.', 400, 'COUPON_DURATION_IMMUTABLE');
    }

    if (
      body.durationInMonths !== undefined &&
      String(body.durationInMonths ?? '') !== String(existing.durationInMonths ?? '')
    ) {
      return jsonError('Changing coupon durationInMonths is not supported. Delete and recreate the coupon instead.', 400, 'COUPON_DURATION_MONTHS_IMMUTABLE');
    }

    const updates: Prisma.CouponUpdateInput = {};

    const activeProviderKey = getActivePaymentProvider();
    const activeProviderCurrency = getProviderCurrency(activeProviderKey).toLowerCase();

    const currencyCandidateRaw = body.currency;
    const currencyCandidate =
      currencyCandidateRaw === undefined
        ? undefined
        : (typeof currencyCandidateRaw === 'string' ? currencyCandidateRaw.trim().toLowerCase() : null);

    const minimumPurchaseRaw = body.minimumPurchaseCents;
    const minimumPurchaseCandidate =
      minimumPurchaseRaw === undefined
        ? undefined
        : (minimumPurchaseRaw === null || minimumPurchaseRaw === '' ? null : Number(minimumPurchaseRaw));

    if (body.description !== undefined) {
      updates.description = sanitizeDescription(body.description);
    }

    // Currency/minimum purchase validation (admin-side) to avoid creating coupons
    // whose thresholds won't match the plan pricing currency/units.
    if (currencyCandidate !== undefined) {
      if (currencyCandidate !== null && !/^[a-z]{3}$/.test(currencyCandidate)) {
        return jsonError('currency must be a 3-letter ISO code (e.g., usd, ngn)', 400, 'COUPON_CURRENCY_INVALID');
      }

      // Disallow changing currency once set, except allowing null -> activeProviderCurrency.
      const existingCurrency = existing.currency ? existing.currency.toLowerCase() : null;
      if (existingCurrency && currencyCandidate && currencyCandidate !== existingCurrency) {
        return jsonError('Changing currency is not supported. Delete and recreate the coupon instead.', 400, 'COUPON_CURRENCY_IMMUTABLE');
      }
      if (existingCurrency && currencyCandidate === null) {
        return jsonError('Clearing currency is not supported once set.', 400, 'COUPON_CURRENCY_IMMUTABLE');
      }
      if (!existingCurrency && currencyCandidate && currencyCandidate !== activeProviderCurrency) {
        return jsonError(
          `currency must match the active provider currency (${activeProviderCurrency.toUpperCase()})`,
          400,
          'COUPON_CURRENCY_PROVIDER_MISMATCH',
        );
      }

      updates.currency = currencyCandidate;
    }

    if (minimumPurchaseCandidate !== undefined) {
      if (minimumPurchaseCandidate !== null) {
        if (
          Number.isNaN(minimumPurchaseCandidate) ||
          minimumPurchaseCandidate <= 0 ||
          !Number.isInteger(minimumPurchaseCandidate)
        ) {
          return jsonError(
            'minimumPurchaseCents must be a whole number greater than 0 when provided',
            400,
            'COUPON_MINIMUM_PURCHASE_INVALID',
          );
        }
      }

      const effectiveCurrency =
        currencyCandidate !== undefined
          ? currencyCandidate
          : (existing.currency ? existing.currency.toLowerCase() : null);

      if (minimumPurchaseCandidate !== null && !effectiveCurrency) {
        return jsonError('currency is required when minimumPurchaseCents is set', 400, 'COUPON_MINIMUM_PURCHASE_REQUIRES_CURRENCY');
      }

      if (
        minimumPurchaseCandidate !== null &&
        effectiveCurrency &&
        effectiveCurrency !== activeProviderCurrency
      ) {
        return jsonError(
          `currency must match the active provider currency (${activeProviderCurrency.toUpperCase()}) for this coupon type`,
          400,
          'COUPON_CURRENCY_PROVIDER_MISMATCH',
        );
      }

      // If the coupon is restricted to plans, ensure the minimum isn't above the cheapest eligible plan.
      if (minimumPurchaseCandidate !== null) {
        const restrictions = await prisma.couponPlan.findMany({
          where: { couponId },
          select: { plan: { select: { priceCents: true } } },
        });
        if (restrictions.length > 0) {
          const minPlanPrice = restrictions.reduce(
            (min, row) => Math.min(min, Number(row.plan?.priceCents ?? 0)),
            Number.POSITIVE_INFINITY,
          );
          if (Number.isFinite(minPlanPrice) && minimumPurchaseCandidate > minPlanPrice) {
            return jsonError(
              'minimumPurchaseCents cannot be greater than the cheapest selected plan price',
              400,
              'COUPON_MINIMUM_PURCHASE_GT_CHEAPEST_PLAN',
            );
          }
        }
      }

      updates.minimumPurchaseCents = minimumPurchaseCandidate;
    }

    // Parse candidate startsAt/endsAt values (do this early so we can
    // validate effective state transitions and prohibit creating an
    // active+expired coupon).
    const startsAtCandidate = body.startsAt !== undefined ? parseDate(body.startsAt) : undefined;
    const endsAtCandidate = body.endsAt !== undefined ? parseDate(body.endsAt) : undefined;

    const effectiveEndsAt = endsAtCandidate ?? existing.endsAt;
    const effectiveActive = body.active !== undefined ? Boolean(body.active) : existing.active;

    // Basic validation for provided dates
    if (startsAtCandidate && endsAtCandidate && startsAtCandidate > endsAtCandidate) {
      return jsonError('startsAt must be before endsAt', 400, 'COUPON_DATE_RANGE_INVALID');
    }
    if (startsAtCandidate && existing.endsAt && startsAtCandidate > existing.endsAt && endsAtCandidate === undefined) {
      return jsonError('startsAt must be before endsAt', 400, 'COUPON_DATE_RANGE_INVALID');
    }

    // Enforce: coupon cannot be active while expired. Compute the effective
    // endsAt and active after applying the requested changes and reject
    // updates that would produce an active coupon with an endsAt in the past.
    if (effectiveActive && effectiveEndsAt && effectiveEndsAt.getTime() < Date.now()) {
      return jsonError('Coupons cannot be active while expired. Set active=false or choose a future endsAt.', 400, 'COUPON_ACTIVE_EXPIRED');
    }

    // Now apply parsed values to updates and continue normal validations.
    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (body.maxRedemptions !== undefined) {
      if (body.maxRedemptions === null) {
        updates.maxRedemptions = null;
      } else {
        const max = Number(body.maxRedemptions);
        if (Number.isNaN(max) || max <= 0) {
          return jsonError('maxRedemptions must be greater than 0 when provided', 400, 'COUPON_MAX_REDEMPTIONS_INVALID');
        }
        if (existing.redemptionCount > max) {
          return jsonError('Cannot set maxRedemptions below current redemption count', 400, 'COUPON_MAX_REDEMPTIONS_BELOW_COUNT');
        }
        updates.maxRedemptions = max;
      }
    }

    if (body.startsAt !== undefined) {
      const startsAt = parseDate(body.startsAt);
      if (!startsAt) {
        return jsonError('Invalid startsAt value', 400, 'COUPON_STARTSAT_INVALID');
      }
      updates.startsAt = startsAt;
    }

    if (body.endsAt !== undefined) {
      const endsAt = parseDate(body.endsAt);
      if (endsAt && updates.startsAt instanceof Date && endsAt < updates.startsAt) {
        return jsonError('endsAt must be after startsAt', 400, 'COUPON_DATE_RANGE_INVALID');
      }
      if (endsAt && existing.startsAt && endsAt < existing.startsAt && !updates.startsAt) {
        return jsonError('endsAt must be after startsAt', 400, 'COUPON_DATE_RANGE_INVALID');
      }
      updates.endsAt = endsAt;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError('No supported fields to update', 400, 'COUPON_NO_SUPPORTED_UPDATES');
    }

    const updated = await prisma.coupon.update({ where: { id: couponId }, data: updates });
    const couponResult = await ensureProviderCoupon(updated);
    if (body.active !== undefined) {
      await syncProviderPromotionState(couponResult.coupon);
    }

    const pendingCount = await prisma.couponRedemption.count({ where: { couponId, consumedAt: null } });

    const fullCoupon = await prisma.coupon.findUnique({
      where: { id: couponId },
      include: couponInclude,
    });

    if (!fullCoupon) {
      return NextResponse.json({
        coupon: {
          ...couponResult.coupon,
          pendingRedemptions: pendingCount,
          eligiblePlans: [],
        },
      });
    }

    const { applicablePlans, ...rest } = fullCoupon;

    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'coupon.update',
      targetType: 'coupon',
      details: { couponId, code: existing.code },
    });

    return NextResponse.json({
      coupon: {
        ...rest,
        pendingRedemptions: pendingCount,
        eligiblePlans: applicablePlans.map((entry) => ({
          id: entry.planId,
          name: entry.plan?.name ?? null,
        })),
      },
    });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Admin coupon update failed', { couponId, error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ couponId: string }> }) {
  const { couponId } = await context.params;
  try {
    const actorId = await requireAdmin();
    const existing = await fetchCouponOr404(couponId);
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const forceParam = url.searchParams.get('force');
    const forceDelete = forceParam === '1' || forceParam?.toLowerCase() === 'true';

    const pending = await prisma.couponRedemption.count({ where: { couponId, consumedAt: null } });
    const hasHistoricalRedemptions = existing.redemptionCount > 0 || pending > 0;

    if (!forceDelete && hasHistoricalRedemptions) {
      return NextResponse.json({
        error: 'Coupons with redemptions cannot be deleted. Use force delete if you want to remove it permanently.',
        requiresForce: true,
      }, { status: 400 });
    }

    // Deactivate provider artifacts (Stripe/Paddle/etc.) before deleting.
    // We attempt both generic external fields and legacy Stripe fields.
    try {
      const { paymentService } = await import('@/lib/payment/service');

      const promotionIds = new Set<string>();
      const couponIds = new Set<string>();

      if (existing.externalPromotionCodeId) promotionIds.add(existing.externalPromotionCodeId);
      if (existing.stripePromotionCodeId) promotionIds.add(existing.stripePromotionCodeId);
      if (existing.externalCouponId) couponIds.add(existing.externalCouponId);
      if (existing.stripeCouponId) couponIds.add(existing.stripeCouponId);

      for (const id of promotionIds) {
        try {
          await paymentService.provider.updatePromotionCode(id, false);
        } catch (err: unknown) {
          Logger.warn('Failed to deactivate provider promotion during delete', {
            couponId,
            provider: paymentService.provider.name,
            promotionId: id,
            error: toError(err).message,
          });
        }
      }

      for (const id of couponIds) {
        // Some providers (Paddle) represent “coupon” and “promotion” with the same entity.
        // deleteCoupon() is expected to archive/disable.
        try {
          await paymentService.provider.deleteCoupon(id);
        } catch (err: unknown) {
          Logger.warn('Failed to delete/archive provider coupon during delete', {
            couponId,
            provider: paymentService.provider.name,
            externalCouponId: id,
            error: toError(err).message,
          });
        }
      }
    } catch (err: unknown) {
      Logger.warn('Failed to deactivate provider artifacts during coupon delete', { couponId, error: toError(err).message });
    }

    if (forceDelete) {
      await prisma.$transaction(async (tx) => {
        await tx.couponRedemption.deleteMany({ where: { couponId } });
        await tx.coupon.delete({ where: { id: couponId } });
      });
    } else {
      await prisma.coupon.delete({ where: { id: couponId } });
    }

    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'coupon.delete',
      targetType: 'coupon',
      details: { couponId, code: existing.code, forced: forceDelete },
    });

    return NextResponse.json({ success: true, forced: forceDelete });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Admin coupon delete failed', { couponId, error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to delete coupon' }, { status: 500 });
  }
}
