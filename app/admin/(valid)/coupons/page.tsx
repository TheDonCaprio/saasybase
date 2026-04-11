export const dynamic = 'force-dynamic';
import type { Prisma } from '@/lib/prisma-client';
import { requireAdminAuth } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import { stripMode, isPrismaModeError } from '@/lib/queryUtils';
import { CouponManagement } from '@/components/admin/CouponManagement';
import { DashboardPageHeader } from '@/components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import type { AdminStatCardProps } from '@/components/admin/AdminStatCard';
import {
  faTicket,
  faCalendarPlus,
  faHourglassEnd,
  faGift
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { formatDateServer } from '@/lib/formatDate.server';
import { buildDashboardMetadata } from '@/lib/dashboardMetadata';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Coupons',
    description: 'Launch time-bound promotions, pause underperforming codes, and monitor redemption health without leaving the admin workspace.',
    audience: 'admin',
  });
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

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  await requireAdminAuth('/admin/coupons');

  const activeCurrency = await getActiveCurrencyAsync();

  const resolvedSearchParams = await searchParams;

  const pageParam = Number.parseInt(String(resolvedSearchParams?.page ?? '1'), 10);
  const limitParam = Number.parseInt(String(resolvedSearchParams?.limit ?? '50'), 10);
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search : '';
  const accessParamRaw = typeof resolvedSearchParams?.access === 'string' ? resolvedSearchParams.access.toLowerCase() : 'all';
  const statusParamRaw = typeof resolvedSearchParams?.status === 'string' ? resolvedSearchParams.status.toLowerCase() : 'all';
  
  const accessParam = ['active', 'expired', 'scheduled'].includes(accessParamRaw)
    ? (accessParamRaw as 'active' | 'expired' | 'scheduled')
    : 'all';
  const statusParam = ['published', 'unpublished'].includes(statusParamRaw)
    ? (statusParamRaw as 'published' | 'unpublished')
    : 'all';

  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
  const skip = (page - 1) * pageSize;

  const whereRaw: Record<string, unknown> = {};
  const now = new Date();

  // Access filter: based on dates
  if (accessParam === 'active') {
    // Active: within expiry date (startsAt <= now < endsAt)
    whereRaw.startsAt = { lte: now };
    whereRaw.endsAt = { gt: now };
  } else if (accessParam === 'expired') {
    // Expired: past expiry date (endsAt <= now)
    whereRaw.endsAt = { lte: now };
  } else if (accessParam === 'scheduled') {
    // Scheduled: yet to reach start date (startsAt > now)
    whereRaw.startsAt = { gt: now };
  }

  // Status filter: based on manual pause state
  if (statusParam === 'published') {
    whereRaw.active = true;
  } else if (statusParam === 'unpublished') {
    whereRaw.active = false;
  }

  if (search) {
    const trimmed = search.trim();
    if (trimmed) {
      whereRaw.OR = [
        { code: { contains: trimmed.toUpperCase(), mode: 'insensitive' } },
        { description: { contains: trimmed, mode: 'insensitive' } },
      ];
    }
  }

  const where = whereRaw as Prisma.CouponWhereInput;

  const runWithFallback = async <T,>(fn: (criteria: Prisma.CouponWhereInput) => Promise<T>): Promise<T> => {
    try {
      return await fn(where);
    } catch (err: unknown) {
      if (isPrismaModeError(err)) {
        const fallbackWhere = stripMode(whereRaw) as Prisma.CouponWhereInput;
        return await fn(fallbackWhere);
      }
      throw err;
    }
  };

  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
  globalCouponCount,
  activeNowCount,
  scheduledCount,
    expiringSoonCount,
    limitedCount,
    lifetimeRedemptionsAggregate,
    pendingRedemptionsTotal
  ] = await Promise.all([
    prisma.coupon.count(),
    prisma.coupon.count({
      where: {
        // Active codes: manually published and currently in their start/end window
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }]
      }
    }),
    prisma.coupon.count({ where: { active: true, startsAt: { gt: now } } }),
    prisma.coupon.count({ where: { active: true, endsAt: { gte: now, lte: sevenDaysFromNow } } }),
    prisma.coupon.count({ where: { maxRedemptions: { not: null } } }),
    prisma.coupon.aggregate({ _sum: { redemptionCount: true } }),
    prisma.couponRedemption.count({ where: { consumedAt: null } })
  ]);

  // Also compute a few counts keyed by the human labels ListFilters expects
  const [accessActiveCount, accessExpiredCount, accessScheduledCount, publishedCount, unpublishedCount] = await Promise.all([
    // Active by dates: started and not ended (endsAt null or > now)
    prisma.coupon.count({ where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }),
    // Expired by dates: ended at or before now
    prisma.coupon.count({ where: { endsAt: { lte: now } } }),
    // Scheduled by dates: starts in the future
    prisma.coupon.count({ where: { startsAt: { gt: now } } }),
    // Published/unpublished by manual active flag
    prisma.coupon.count({ where: { active: true } }),
    prisma.coupon.count({ where: { active: false } })
  ]);

  // Additional redemption metrics
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [redemptionsToday, redemptionsThisWeek] = await Promise.all([
    prisma.couponRedemption.count({ where: { consumedAt: { gte: todayStart } } }),
    prisma.couponRedemption.count({ where: { consumedAt: { gte: weekAgo } } })
  ]);

  const lifetimeRedemptions = Number(lifetimeRedemptionsAggregate._sum.redemptionCount ?? 0);

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total codes',
      value: formatNumber(globalCouponCount),
      helper: `${formatNumber(limitedCount)} with limited supply`,
      icon: faTicket,
      accent: 'theme'
    },
    {
      label: 'Expiring soon',
      value: formatNumber(expiringSoonCount),
      helper: 'Expiring within 7 days',
      icon: faHourglassEnd,
      accent: 'theme'
    },
    {
      label: 'Scheduled launches',
      value: formatNumber(scheduledCount),
      helper: 'Start date in the future',
      icon: faCalendarPlus,
      accent: 'theme'
    },
    {
      label: 'Pending redemptions',
      value: formatNumber(pendingRedemptionsTotal),
      helper: 'Awaiting consumption',
      icon: faGift,
      accent: 'theme'
    }
  ];

  const headerStats = [
    {
      label: 'Active Codes',
      value: formatNumber(activeNowCount),
      helper: `${formatNumber(redemptionsToday)} redemptions today`,
      tone: 'emerald' as const
    },
    {
      label: 'Total Redemptions',
      value: formatNumber(lifetimeRedemptions),
      helper: `${formatNumber(redemptionsThisWeek)} redemptions this week`,
      tone: 'indigo' as const
    }
  ];

  const totalCount = await runWithFallback((criteria) => prisma.coupon.count({ where: criteria }));
  const coupons = await runWithFallback((criteria) =>
    prisma.coupon.findMany({
      where: criteria,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      include: couponInclude,
    })
  );

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

  const results = await Promise.all(coupons.map(async (coupon) => ({
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    percentOff: coupon.percentOff,
    amountOffCents: coupon.amountOffCents,
    duration: (coupon.duration === 'once' || coupon.duration === 'repeating' || coupon.duration === 'forever'
      ? coupon.duration
      : 'once') as 'once' | 'repeating' | 'forever',
    durationInMonths: coupon.durationInMonths,
    active: coupon.active,
    maxRedemptions: coupon.maxRedemptions,
    redemptionCount: coupon.redemptionCount,
    startsAt: coupon.startsAt ? coupon.startsAt.toISOString() : null,
    endsAt: coupon.endsAt ? coupon.endsAt.toISOString() : null,
    startsAtFormatted: coupon.startsAt ? await formatDateServer(coupon.startsAt) : null,
    endsAtFormatted: coupon.endsAt ? await formatDateServer(coupon.endsAt) : null,
    createdAt: coupon.createdAt.toISOString(),
    createdAtFormatted: await formatDateServer(coupon.createdAt),
    updatedAt: coupon.updatedAt.toISOString(),
    updatedAtFormatted: await formatDateServer(coupon.updatedAt),
    pendingRedemptions: pendingMap.get(coupon.id) || 0,
    eligiblePlans: coupon.applicablePlans.map((entry) => ({
      id: entry.planId,
      name: entry.plan?.name ?? null,
    })),
  })));

  // Build label-keyed totals for the ListFilters component (it looks up by human labels)
  const statusTotals: Record<string, number> = {
    All: Number(globalCouponCount),
    Active: Number(accessActiveCount),
    Expired: Number(accessExpiredCount),
    Scheduled: Number(accessScheduledCount),
    Published: Number(publishedCount),
    Unpublished: Number(unpublishedCount),
  };

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Promotion codes"
          eyebrowIcon={<FontAwesomeIcon icon={faTicket} />}
        title="Coupon management"
        stats={headerStats}
      >
 
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      {/* Monitoring panel removed per admin request */}

      <CouponManagement
        initialCoupons={results}
        initialTotalCount={totalCount}
        initialPage={page}
        pageSize={pageSize}
        initialSearch={search}
        initialAccess={accessParam}
        initialPublishStatus={statusParam}
        statusTotals={statusTotals}
        displayCurrency={activeCurrency}
      />
    </div>
  );
}
