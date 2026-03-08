import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { asRecord, toError } from '@/lib/runtime-guards';
import { normalizeCouponCode, ensureProviderCoupon, isCouponCurrentlyActive, getPendingRedemptionCount } from '@/lib/coupons';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '@/lib/queryUtils';
import { formatDateServer } from '@/lib/formatDate.server';

function formatError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

export async function GET(request: NextRequest) {
  try {
    const { userId } = await authService.getSession();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
    const limitParam = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const cursor = searchParams.get('cursor');
    const countParam = searchParams.get('count');
    const search = searchParams.get('search');
    const unusedOnlyParam = searchParams.get('unusedOnly');
    const wantsUnusedOnly = typeof unusedOnlyParam === 'string' && ['1', 'true', 'yes'].includes(unusedOnlyParam.toLowerCase());

    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
    const skip = (page - 1) * take;
    const wantCount = countParam !== 'false';

    let whereRaw: Record<string, unknown> = { userId };
    const dbUrl = process.env.DATABASE_URL || '';
    if (search) {
      const trimmed = search.trim();
      if (trimmed) {
        whereRaw.OR = [
          { coupon: { code: buildStringContainsFilter(trimmed.toUpperCase(), dbUrl) } },
          { coupon: { description: buildStringContainsFilter(trimmed, dbUrl) } },
        ];
      }
    }

    if (wantsUnusedOnly) {
      const existingAnd = Array.isArray(whereRaw.AND)
        ? whereRaw.AND
        : whereRaw.AND
          ? [whereRaw.AND]
          : [];
      whereRaw.AND = [
        ...existingAnd,
        { consumedAt: null },
        { coupon: { active: true } },
      ];
    }

    whereRaw = sanitizeWhereForInsensitiveSearch(whereRaw, dbUrl);

    let where = whereRaw as Prisma.CouponRedemptionWhereInput;

    const runWithFallback = async <T,>(fn: (criteria: Prisma.CouponRedemptionWhereInput) => Promise<T>): Promise<T> => {
      try {
        return await fn(where);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          where = stripMode(whereRaw) as Prisma.CouponRedemptionWhereInput;
          return await fn(where);
        }
        throw err;
      }
    };

    const orderBy: Prisma.CouponRedemptionOrderByWithRelationInput[] = [
      { redeemedAt: 'desc' },
      { id: 'desc' },
    ];

    let totalCount: number | null = null;
    if (wantCount) {
      totalCount = await runWithFallback((criteria) => prisma.couponRedemption.count({ where: criteria }));
    }

    type RedemptionWithCoupon = Prisma.CouponRedemptionGetPayload<{ include: { coupon: { include: typeof couponInclude } } }>;

    const runFindMany = async (args: Prisma.CouponRedemptionFindManyArgs): Promise<RedemptionWithCoupon[]> => {
      try {
        return await prisma.couponRedemption.findMany({
          ...args,
          include: { coupon: { include: couponInclude } },
        }) as RedemptionWithCoupon[];
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          const safeWhere = stripMode((args.where ?? {}) as Record<string, unknown>);
          return await prisma.couponRedemption.findMany({
            ...args,
            where: safeWhere as Prisma.CouponRedemptionWhereInput,
            include: { coupon: { include: couponInclude } },
          }) as RedemptionWithCoupon[];
        }
        throw err;
      }
    };

    let redemptions: RedemptionWithCoupon[] = [];

    if (cursor) {
      const cursorRow = await prisma.couponRedemption.findUnique({ where: { id: cursor }, select: { id: true } });
      if (cursorRow) {
        redemptions = await runFindMany({
          where,
          orderBy,
          cursor: { id: cursorRow.id },
          skip: 1,
          take,
        });
      }
    }

    if (!cursor || redemptions.length === 0) {
      redemptions = await runFindMany({
        where,
        orderBy,
        skip,
        take,
      });
    }

    const payload = await Promise.all(redemptions.map(async (redemption) => {
      const redeemedAtFormatted = await formatDateServer(redemption.redeemedAt, userId ?? undefined);
      const consumedAtFormatted = redemption.consumedAt ? await formatDateServer(redemption.consumedAt, userId ?? undefined) : null;
      const startsAtFormatted = redemption.coupon.startsAt ? await formatDateServer(redemption.coupon.startsAt, userId ?? undefined) : null;
      const endsAtFormatted = redemption.coupon.endsAt ? await formatDateServer(redemption.coupon.endsAt, userId ?? undefined) : null;

      return {
        id: redemption.id,
        couponId: redemption.couponId,
        code: redemption.coupon.code,
        description: redemption.coupon.description,
        percentOff: redemption.coupon.percentOff,
        amountOffCents: redemption.coupon.amountOffCents,
        redeemedAt: redemption.redeemedAt.toISOString(),
        redeemedAtFormatted,
        consumedAt: redemption.consumedAt ? redemption.consumedAt.toISOString() : null,
        consumedAtFormatted,
        startsAt: redemption.coupon.startsAt ? redemption.coupon.startsAt.toISOString() : null,
        startsAtFormatted,
        endsAt: redemption.coupon.endsAt ? redemption.coupon.endsAt.toISOString() : null,
        endsAtFormatted,
        active: redemption.coupon.active,
        currentlyActive: isCouponCurrentlyActive(redemption.coupon),
        eligiblePlans: redemption.coupon.applicablePlans.map((entry) => ({
          id: entry.planId,
          name: entry.plan?.name ?? null,
        })),
      };
    }));

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
    const e = toError(err);
    Logger.error('Dashboard coupons GET failed', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to load coupons' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await authService.getSession();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const raw = await request.json().catch(() => null) as unknown;
    const body = asRecord(raw) || {};
    const codeRaw = typeof body.code === 'string' ? body.code : '';
    if (!codeRaw) {
      return formatError('Coupon code is required');
    }
    const code = normalizeCouponCode(codeRaw);

    const coupon = await prisma.coupon.findUnique({
      where: { code },
      include: couponInclude,
    });
    if (!coupon) {
      return formatError('Coupon not found', 404);
    }

    const now = new Date();
    if (!coupon.active) {
      return formatError('Coupon is not active');
    }
    if (coupon.startsAt && coupon.startsAt > now) {
      return formatError('Coupon is not active yet');
    }
    if (coupon.endsAt && coupon.endsAt < now) {
      return formatError('Coupon has expired');
    }
    if (!coupon.percentOff && !coupon.amountOffCents) {
      Logger.warn('Coupon missing discount values', { couponId: coupon.id });
      return formatError('Coupon is not configured correctly');
    }

    const existing = await prisma.couponRedemption.findUnique({
      where: {
        couponId_userId: {
          couponId: coupon.id,
          userId,
        },
      },
    });
    if (existing) {
      if (!existing.consumedAt) {
        return formatError('You have already redeemed this coupon');
      }
      return formatError('This coupon was already used by you');
    }

    const pendingCount = await getPendingRedemptionCount(coupon.id);
    if (coupon.maxRedemptions && coupon.redemptionCount + pendingCount >= coupon.maxRedemptions) {
      return formatError('Coupon has reached the redemption limit');
    }

    const couponResult = await ensureProviderCoupon(coupon);

    const redemption = await prisma.$transaction(async (tx) => {
      const refreshed = await tx.coupon.findUnique({ where: { id: couponResult.coupon.id } });
      if (!refreshed) {
        throw new Error('Coupon no longer exists');
      }
      const pending = await tx.couponRedemption.count({ where: { couponId: coupon.id, consumedAt: null } });
      if (refreshed.maxRedemptions && refreshed.redemptionCount + pending >= refreshed.maxRedemptions) {
        throw new Error('limit_reached');
      }
      return tx.couponRedemption.create({ data: { couponId: coupon.id, userId } });
    });

    return NextResponse.json({
      redemption: {
        id: redemption.id,
        couponId: coupon.id,
        code: coupon.code,
        description: coupon.description,
        percentOff: coupon.percentOff,
        amountOffCents: coupon.amountOffCents,
        redeemedAt: redemption.redeemedAt,
        redeemedAtFormatted: await formatDateServer(redemption.redeemedAt, userId ?? undefined),
        consumedAt: redemption.consumedAt,
        consumedAtFormatted: redemption.consumedAt ? await formatDateServer(redemption.consumedAt, userId ?? undefined) : null,
        startsAt: coupon.startsAt,
        startsAtFormatted: coupon.startsAt ? await formatDateServer(coupon.startsAt, userId ?? undefined) : null,
        endsAt: coupon.endsAt,
        endsAtFormatted: coupon.endsAt ? await formatDateServer(coupon.endsAt, userId ?? undefined) : null,
        active: coupon.active,
        currentlyActive: isCouponCurrentlyActive(coupon),
        stripePromotionCodeId: couponResult.coupon.externalPromotionCodeId,
        eligiblePlans: coupon.applicablePlans.map((entry) => ({
          id: entry.planId,
          name: entry.plan?.name ?? null,
        })),
      },
    });
  } catch (err: unknown) {
    const e = toError(err);
    if (e.message === 'limit_reached') {
      return formatError('Coupon has reached the redemption limit');
    }
    Logger.error('Dashboard coupon redeem failed', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to redeem coupon' }, { status: 500 });
  }
}
