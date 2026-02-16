import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { normalizeCouponCode, ensureCouponArtifactsAcrossProviders } from '@/lib/coupons';
import { Logger } from '@/lib/logger';
import { toError, asRecord } from '@/lib/runtime-guards';
import { recordAdminAction } from '@/lib/admin-actions';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '@/lib/queryUtils';
import { getActivePaymentProvider } from '@/lib/payment/provider-config';
import { getProviderCurrency } from '@/lib/payment/registry';

const couponInclude = {
  applicablePlans: {
    include: {
      plan: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.CouponInclude;

type CouponWithPlans = Prisma.CouponGetPayload<{
  include: typeof couponInclude;
}>;

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

function sanitizeCouponCode(code: string): string {
  const normalized = normalizeCouponCode(code);
  if (!/^[A-Z0-9-]{3,64}$/.test(normalized)) {
    throw new Error('Coupon code must be 3-64 characters and alphanumeric with dashes');
  }
  return normalized;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDuration(value: unknown): {
  duration: 'once' | 'repeating' | 'forever';
  invalid: boolean;
} {
  if (value === null || value === undefined || value === '') {
    return { duration: 'once', invalid: false };
  }
  const raw = typeof value === 'string' ? value : '';
  if (raw === 'repeating' || raw === 'forever' || raw === 'once') {
    return { duration: raw, invalid: false };
  }
  return { duration: 'once', invalid: true };
}

function serializeCoupon(coupon: CouponWithPlans, pendingRedemptions = 0) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    percentOff: coupon.percentOff,
    amountOffCents: coupon.amountOffCents,
    currency: coupon.currency,
    duration: coupon.duration,
    durationInMonths: coupon.durationInMonths,
    minimumPurchaseCents: coupon.minimumPurchaseCents,
    active: coupon.active,
    maxRedemptions: coupon.maxRedemptions,
    redemptionCount: coupon.redemptionCount,
    startsAt: coupon.startsAt ? coupon.startsAt.toISOString() : null,
    endsAt: coupon.endsAt ? coupon.endsAt.toISOString() : null,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
    pendingRedemptions,
    eligiblePlans: coupon.applicablePlans.map((entry) => ({
      id: entry.planId,
      name: entry.plan?.name ?? null,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '50', 10);
    const cursor = searchParams.get('cursor');
    const countParam = searchParams.get('count');
    const search = searchParams.get('search');
    const access = searchParams.get('access');
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
    const skip = (page - 1) * take;
    const wantCount = countParam !== 'false';

    // Validate sort parameters
    const validSortFields = ['createdAt', 'startsAt', 'endsAt', 'redemptionCount', 'maxRedemptions'] as const;
    const validatedSort = validSortFields.includes(sortBy as typeof validSortFields[number])
      ? (sortBy as typeof validSortFields[number])
      : 'createdAt';
    const validatedOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const now = new Date();
    let whereRaw: Record<string, unknown> = {};
    const dbUrl = process.env.DATABASE_URL || '';

    // Access filter: based on dates (active/expired/scheduled)
    if (access === 'active') {
      // Active: within expiry date (startsAt <= now AND (endsAt is null OR endsAt > now))
      whereRaw.AND = [
        { startsAt: { lte: now } },
        {
          OR: [
            { endsAt: null },
            { endsAt: { gt: now } }
          ]
        }
      ];
    } else if (access === 'expired') {
      // Expired: past expiry date (endsAt <= now)
      whereRaw.endsAt = { lte: now };
    } else if (access === 'scheduled') {
      // Scheduled: yet to reach start date (startsAt > now)
      whereRaw.startsAt = { gt: now };
    }

    // Status filter: based on manual pause state (published/unpublished)
    if (status === 'published') {
      whereRaw.active = true;
    } else if (status === 'unpublished') {
      whereRaw.active = false;
    }

    if (search) {
      const trimmed = search.trim();
      if (trimmed) {
        whereRaw.OR = [
          { code: buildStringContainsFilter(trimmed.toUpperCase(), dbUrl) },
          { description: buildStringContainsFilter(trimmed, dbUrl) },
        ];
      }
    }

    whereRaw = sanitizeWhereForInsensitiveSearch(whereRaw, dbUrl);

    const queryOrderBy: Prisma.CouponOrderByWithRelationInput[] = [
      { [validatedSort]: validatedOrder },
      { id: 'desc' }
    ];

    const runFindMany = async (args: Prisma.CouponFindManyArgs): Promise<CouponWithPlans[]> => {
      try {
        return await prisma.coupon.findMany({
          ...args,
          include: couponInclude,
        }) as CouponWithPlans[];
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          const safeWhere = stripMode((args.where ?? {}) as Record<string, unknown>);
          return await prisma.coupon.findMany({
            ...args,
            where: safeWhere as Prisma.CouponWhereInput,
            include: couponInclude,
          }) as CouponWithPlans[];
        }
        throw err;
      }
    };

    let totalCount: number | null = null;
    if (wantCount) {
      try {
        totalCount = await prisma.coupon.count({ where: whereRaw as Prisma.CouponWhereInput });
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          const safeWhere = stripMode(whereRaw);
          totalCount = await prisma.coupon.count({ where: safeWhere as Prisma.CouponWhereInput });
        } else {
          throw err;
        }
      }
    }

    let coupons: CouponWithPlans[] = [];
    if (cursor) {
      const cursorCoupon = await prisma.coupon.findUnique({ where: { id: cursor }, select: { id: true } });
      if (cursorCoupon) {
        coupons = await runFindMany({
          where: whereRaw as Prisma.CouponWhereInput,
          orderBy: queryOrderBy,
          cursor: { id: cursorCoupon.id },
          skip: 1,
          take,
        });
      }
    }

    if (!cursor || coupons.length === 0) {
      coupons = await runFindMany({
        where: whereRaw as Prisma.CouponWhereInput,
        orderBy: queryOrderBy,
        skip,
        take,
      });
    }

    const couponIds = coupons.map((coupon) => coupon.id);
    const pendingMap = new Map<string, number>();
    if (couponIds.length > 0) {
      const pendingRows = await prisma.couponRedemption.findMany({
        where: { couponId: { in: couponIds }, consumedAt: null },
        select: { couponId: true },
      });
      for (const row of pendingRows) {
        pendingMap.set(row.couponId, (pendingMap.get(row.couponId) ?? 0) + 1);
      }
    }

    const payload = coupons.map((coupon) => serializeCoupon(coupon, pendingMap.get(coupon.id) || 0));

    const nextCursor = payload.length === take ? payload[payload.length - 1]?.id ?? null : null;
    const hasNextPage = nextCursor !== null || (totalCount !== null && page * take < totalCount);
    const hasPreviousPage = page > 1;

    return NextResponse.json({
      coupons: payload,
      totalCount,
      currentPage: page,
      pageSize: take,
      hasNextPage,
      hasPreviousPage,
      nextCursor,
    });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Admin coupons GET failed', { error: e.message, stack: e.stack });
    return jsonError('Failed to load coupons', 500, 'ADMIN_COUPONS_LOAD_FAILED');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const raw = await request.json().catch(() => null) as unknown;
    const body = asRecord(raw) || {};

    const code = sanitizeCouponCode(String(body.code || ''));
    const description = typeof body.description === 'string' ? body.description.slice(0, 255) : null;
    const percentOff = body.percentOff !== undefined ? Number(body.percentOff) : undefined;
    const amountOffCents = body.amountOffCents !== undefined ? Number(body.amountOffCents) : undefined;
    const currencyRaw = typeof body.currency === 'string' ? body.currency.trim() : '';
    const currency = currencyRaw ? currencyRaw.toLowerCase() : null;
    const minimumPurchaseRaw = body.minimumPurchaseCents;
    const minimumPurchaseCents =
      minimumPurchaseRaw === undefined || minimumPurchaseRaw === null || minimumPurchaseRaw === ''
        ? null
        : Number(minimumPurchaseRaw);
    const maxRedemptions = body.maxRedemptions !== undefined && body.maxRedemptions !== null ? Number(body.maxRedemptions) : null;
    const active = body.active === undefined ? true : Boolean(body.active);
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);

    const parsedDuration = parseDuration(body.duration);
    if (parsedDuration.invalid) {
      return jsonError('duration must be one of: once, repeating, forever', 400, 'COUPON_DURATION_INVALID');
    }
    const duration = parsedDuration.duration;
    let durationInMonths: number | null = null;
    if (duration === 'repeating') {
      const durationInMonthsRaw = body.durationInMonths;
      durationInMonths =
        durationInMonthsRaw === undefined || durationInMonthsRaw === null || durationInMonthsRaw === ''
          ? NaN
          : Number(durationInMonthsRaw);
    }

    if (!percentOff && !amountOffCents) {
      return jsonError('Provide percentOff or amountOffCents', 400, 'COUPON_DISCOUNT_MISSING');
    }
    if (percentOff && amountOffCents) {
      return jsonError('Use either percentOff or amountOffCents, not both', 400, 'COUPON_DISCOUNT_AMBIGUOUS');
    }
    if (percentOff !== undefined && (Number.isNaN(percentOff) || percentOff <= 0 || percentOff > 100)) {
      return jsonError('percentOff must be between 1 and 100', 400, 'COUPON_PERCENT_OFF_INVALID');
    }
    if (amountOffCents !== undefined && (Number.isNaN(amountOffCents) || amountOffCents <= 0)) {
      return jsonError('amountOffCents must be greater than 0', 400, 'COUPON_AMOUNT_OFF_INVALID');
    }
    if (currency !== null && !/^[a-z]{3}$/.test(currency)) {
      return jsonError('currency must be a 3-letter ISO code (e.g., usd, ngn)', 400, 'COUPON_CURRENCY_INVALID');
    }
    if (minimumPurchaseCents !== null) {
      if (Number.isNaN(minimumPurchaseCents) || minimumPurchaseCents <= 0 || !Number.isInteger(minimumPurchaseCents)) {
        return jsonError('minimumPurchaseCents must be a whole number greater than 0 when provided', 400, 'COUPON_MINIMUM_PURCHASE_INVALID');
      }
      if (currency === null) {
        return jsonError('currency is required when minimumPurchaseCents is set', 400, 'COUPON_MINIMUM_PURCHASE_REQUIRES_CURRENCY');
      }
    }

    // Amount-off coupons must be currency-scoped to avoid cross-currency confusion.
    if (amountOffCents !== undefined && currency === null) {
      return jsonError('currency is required when amountOffCents is set', 400, 'COUPON_AMOUNT_OFF_REQUIRES_CURRENCY');
    }

    // Enforce that currency-scoped coupon thresholds match the currently active provider currency.
    // This prevents admin users from creating minimum-purchase/amount-off coupons that will never validate at checkout.
    const activeProviderKey = getActivePaymentProvider();
    const activeProviderCurrency = getProviderCurrency(activeProviderKey);
    if ((minimumPurchaseCents !== null || amountOffCents !== undefined) && currency && currency !== activeProviderCurrency.toLowerCase()) {
      return jsonError(
        `currency must match the active provider currency (${activeProviderCurrency.toUpperCase()}) for this coupon type`,
        400,
        'COUPON_CURRENCY_PROVIDER_MISMATCH',
      );
    }
    if (maxRedemptions !== null && (Number.isNaN(maxRedemptions) || maxRedemptions <= 0)) {
      return jsonError('maxRedemptions must be greater than 0 when provided', 400, 'COUPON_MAX_REDEMPTIONS_INVALID');
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      return jsonError('startsAt must be before endsAt', 400, 'COUPON_DATE_RANGE_INVALID');
    }

    if (duration === 'repeating') {
      if (durationInMonths === null || !Number.isFinite(durationInMonths) || durationInMonths <= 0 || !Number.isInteger(durationInMonths)) {
        return jsonError('durationInMonths must be a whole number greater than 0 for repeating coupons', 400, 'COUPON_DURATION_MONTHS_INVALID');
      }
      if (durationInMonths > 36) {
        return jsonError('durationInMonths must be 36 or less', 400, 'COUPON_DURATION_MONTHS_TOO_LARGE');
      }
    }

    // Disallow creating a coupon that is both active and already expired.
    if (active && endsAt && endsAt.getTime() < Date.now()) {
      return jsonError('Coupons cannot be active while expired. Set active=false or choose a future endsAt.', 400, 'COUPON_ACTIVE_EXPIRED');
    }

    const planIdsRaw = Array.isArray(body.planIds) ? body.planIds : [];
    const uniquePlanIds = Array.from(
      new Set(
        planIdsRaw
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );

    if (uniquePlanIds.length > 0) {
      const planCount = await prisma.plan.count({ where: { id: { in: uniquePlanIds } } });
      if (planCount !== uniquePlanIds.length) {
        return jsonError('One or more selected plans were not found', 400, 'COUPON_PLANS_NOT_FOUND');
      }

      if (minimumPurchaseCents !== null) {
        const plans = await prisma.plan.findMany({
          where: { id: { in: uniquePlanIds } },
          select: { id: true, priceCents: true },
        });
        const minPlanPrice = plans.reduce((min, plan) => Math.min(min, Number(plan.priceCents ?? 0)), Number.POSITIVE_INFINITY);
        if (Number.isFinite(minPlanPrice) && minimumPurchaseCents > minPlanPrice) {
          return jsonError(
            'minimumPurchaseCents cannot be greater than the cheapest selected plan price',
            400,
            'COUPON_MINIMUM_PURCHASE_GT_CHEAPEST_PLAN',
          );
        }
      }
    }

    const coupon = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.coupon.create({
        data: {
          code,
          description,
          percentOff: percentOff ?? null,
          amountOffCents: amountOffCents ?? null,
          currency,
          duration,
          durationInMonths: duration === 'repeating' ? durationInMonths : null,
          minimumPurchaseCents,
          active,
          maxRedemptions,
          startsAt: startsAt ?? undefined,
          endsAt,
        },
      });

      if (uniquePlanIds.length > 0) {
        await tx.couponPlan.createMany({
          data: uniquePlanIds.map((planId) => ({ couponId: created.id, planId })),
        });
      }

      return created;
    });

    const updatedCoupon = await ensureCouponArtifactsAcrossProviders(coupon);

    const hydrated = await prisma.coupon.findUnique({
      where: { id: updatedCoupon.id },
      include: couponInclude,
    }) as CouponWithPlans | null;

    if (!hydrated) {
      return jsonError('Failed to load coupon after creation', 500, 'COUPON_CREATE_HYDRATE_FAILED');
    }

    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'coupon.create',
      targetType: 'coupon',
      details: { couponId: hydrated.id, code: hydrated.code, percentOff: hydrated.percentOff, amountOffCents: hydrated.amountOffCents, duration: hydrated.duration },
    });

    return NextResponse.json({ coupon: serializeCoupon(hydrated) });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    if (e.message && e.message.includes('Coupon code must')) {
      return jsonError(e.message, 400, 'COUPON_CODE_INVALID');
    }
    if (e.message && e.message.includes('Unique constraint')) {
      return jsonError('Coupon code already exists', 409, 'COUPON_CODE_ALREADY_EXISTS');
    }
    Logger.error('Admin coupons POST failed', { error: e.message, stack: e.stack });
    return jsonError('Failed to create coupon', 500, 'COUPON_CREATE_FAILED');
  }
}
