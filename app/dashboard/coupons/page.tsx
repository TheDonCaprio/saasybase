export const dynamic = 'force-dynamic';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { formatDateServer } from '@/lib/formatDate.server';
import { stripMode, isPrismaModeError } from '@/lib/queryUtils';
import { isCouponCurrentlyActive } from '@/lib/coupons';
import { CouponRedeemer } from '@/components/dashboard/CouponRedeemer';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTicket } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Coupons',
    description: 'Redeem promo codes, review coupon activity, and plan discounts for upcoming billing cycles.',
    audience: 'user',
  });
}

const couponInclude = {
  coupon: {
    include: {
      applicablePlans: {
        include: {
          plan: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CouponRedemptionInclude;

export default async function DashboardCouponsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/coupons', resolvedSearchParams);
  const { userId } = await requireAuth(returnPath);

  const pageParam = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
  const limitParam = Number.parseInt(String(resolvedSearchParams?.limit ?? '20'), 10);
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search : '';

  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
  const skip = (page - 1) * pageSize;

  const whereRaw: Record<string, unknown> = { userId };
  if (search) {
    const trimmed = search.trim();
    if (trimmed) {
      whereRaw.OR = [
        { coupon: { code: { contains: trimmed.toUpperCase(), mode: 'insensitive' } } },
        { coupon: { description: { contains: trimmed, mode: 'insensitive' } } },
      ];
    }
  }

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

  const totalCount = await runWithFallback((criteria) => prisma.couponRedemption.count({ where: criteria }));

  const redemptions = await runWithFallback((criteria) =>
    prisma.couponRedemption.findMany({
      where: criteria,
      include: couponInclude,
      orderBy,
      skip,
      take: pageSize,
    })
  );

  const now = new Date();
  const [readyNowCount, usedCount] = await Promise.all([
    prisma.couponRedemption.count({
      where: {
        userId,
        consumedAt: null,
        coupon: {
          active: true,
          OR: [{ percentOff: { gt: 0 } }, { amountOffCents: { gt: 0 } }],
          AND: [
            { startsAt: { lte: now } },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      },
    }),
    prisma.couponRedemption.count({
      where: {
        userId,
        consumedAt: { not: null },
      },
    }),
  ]);

  // filterSummary removed — no longer used after header changes
  const readyHelper = readyNowCount > 0 ? 'Apply during checkout expiry' : 'Redeem a code to start saving';
  const usedHelper = usedCount > 0 ? 'Redeemed and used codes' : 'No coupons used yet';

  const payload = await Promise.all(redemptions.map(async (item) => ({
    id: item.id,
    couponId: item.couponId,
    code: item.coupon.code,
    description: item.coupon.description,
    percentOff: item.coupon.percentOff,
    amountOffCents: item.coupon.amountOffCents,
    redeemedAt: item.redeemedAt.toISOString(),
    redeemedAtFormatted: await formatDateServer(item.redeemedAt, userId),
    consumedAt: item.consumedAt ? item.consumedAt.toISOString() : null,
    consumedAtFormatted: item.consumedAt ? await formatDateServer(item.consumedAt, userId) : null,
    startsAt: item.coupon.startsAt ? item.coupon.startsAt.toISOString() : null,
    startsAtFormatted: item.coupon.startsAt ? await formatDateServer(item.coupon.startsAt, userId) : null,
    endsAt: item.coupon.endsAt ? item.coupon.endsAt.toISOString() : null,
    endsAtFormatted: item.coupon.endsAt ? await formatDateServer(item.coupon.endsAt, userId) : null,
    active: item.coupon.active,
    currentlyActive: isCouponCurrentlyActive(item.coupon),
    eligiblePlans: item.coupon.applicablePlans.map((entry) => ({
      id: entry.planId,
      name: entry.plan?.name ?? null,
    })),
  })));

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="rose"
        eyebrow="Promotions"
  eyebrowIcon={<FontAwesomeIcon icon={faTicket} />}
        title="Coupon wallet"
        description="Redeem team-provided codes and keep tabs on what’s ready for your next billing cycle."
        stats={[
          {
            label: 'Ready to apply',
            value: readyNowCount,
            helper: readyHelper,
            tone: readyNowCount > 0 ? 'emerald' : 'indigo',
          },
          {
            label: 'Used codes',
            value: usedCount,
            helper: usedHelper,
            tone: usedCount > 0 ? 'slate' : 'amber',
          },
        ]}
      />
      <CouponRedeemer
        initialRedemptions={payload}
        initialTotalCount={totalCount}
        initialPage={page}
        pageSize={pageSize}
        initialSearch={search}
      />
    </div>
  );
}
