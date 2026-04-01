export const dynamic = 'force-dynamic';
import { requireAdminSectionAccess } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import { PaginatedPurchaseManagement } from '../../../../components/admin/PaginatedPurchaseManagement';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import type { Prisma } from '@prisma/client';
import {
  faSackDollar,
  faCalendarDay,
  faReceipt,
  faUsers
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';
import { PAYMENT_PROVIDER_REGISTRY } from '../../../../lib/payment/registry';
import { buildDashboardUrl } from '../../../../lib/payment/provider-config';


export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Purchases',
    description: 'Track non-renewing plans, monitor entitlements, and process refunds without leaving the admin workspace.',
    audience: 'admin',
  });
}

export default async function AdminPurchasesPage() {
  await requireAdminSectionAccess('purchases');

  const activeCurrency = await getActiveCurrencyAsync();
  const formatCurrencyCents = (cents: number) => formatCurrencyUtil(cents, activeCurrency);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Get one-time purchases (payments without recurring subscriptions)
  const nonRecurringCondition: Prisma.PaymentWhereInput = {
    OR: [
      { subscription: { plan: { autoRenew: false } } },
      { AND: [{ subscriptionId: null }, { plan: { autoRenew: false } }] }
    ]
  };

  const purchaseInclude = {
    subscription: {
      include: { plan: true }
    },
    plan: true,
    user: true
  } satisfies Prisma.PaymentInclude;

  const [
    dbPurchases,
    totalCount,
    completedCount,
    pendingCount,
    failedCount,
    refundedCount,
    totalVolume,
    last30Volume,
    last30CompletedCount,
    refundedVolume,
    weekRevenueAgg,
    todayRevenueAgg,
    expiringSoonCount,
    expiringIn7Count,
    activeAccessCount,
    expiredAccessCount
  ] = await Promise.all([
    prisma.payment.findMany({
      where: nonRecurringCondition,
      include: purchaseInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.payment.count({ where: nonRecurringCondition }),
    prisma.payment.count({ where: { ...nonRecurringCondition, status: { in: ['COMPLETED', 'SUCCEEDED'] } } }),
    prisma.payment.count({ where: { ...nonRecurringCondition, status: { in: ['PENDING', 'PENDING_SUBSCRIPTION'] } } }),
    prisma.payment.count({ where: { ...nonRecurringCondition, status: 'FAILED' } }),
    prisma.payment.count({ where: { ...nonRecurringCondition, status: 'REFUNDED' } }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { ...nonRecurringCondition, status: { in: ['COMPLETED', 'SUCCEEDED'] } }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        ...nonRecurringCondition,
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.payment.count({
      where: {
        ...nonRecurringCondition,
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { ...nonRecurringCondition, status: 'REFUNDED' }
    }),
    // revenue this week (purchases)
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        ...nonRecurringCondition,
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: sevenDaysAgo }
      }
    }),
    // revenue today (purchases)
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        ...nonRecurringCondition,
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: startOfToday }
      }
    }),
    // active access count removed (not used client-side)
    // entitlements expiring in next 7 days (for purchases that attach subscriptions/entitlements)
    prisma.payment.count({
      where: {
        ...nonRecurringCondition,
        subscription: {
          status: 'ACTIVE',
          expiresAt: {
            gt: now,
            lte: sevenDaysFromNow
          }
        }
      }
    }),
    prisma.payment.count({
      where: {
        ...nonRecurringCondition,
        subscription: {
          status: 'ACTIVE',
          expiresAt: {
            gt: now,
            lte: fourteenDaysFromNow
          }
        }
      }
    }),
    // purchases with active access (active subscription not expired)
    prisma.payment.count({
      where: {
        AND: [nonRecurringCondition, {
          subscription: {
            status: 'ACTIVE',
            expiresAt: { gt: now }
          }
        }]
      }
    }),
    // purchases with expired access (no subscription or expired/inactive)
    prisma.payment.count({
      where: {
        AND: [nonRecurringCondition, {
          OR: [
            { subscription: null },
            { subscription: { status: { not: 'ACTIVE' } } },
            { subscription: { status: 'ACTIVE', expiresAt: { lte: now } } }
          ]
        }]
      }
    })
  ]);

  const purchases = dbPurchases.map(p => {
    const formatCurrencyString = (cents: number) => formatCurrencyCents(cents);

    const subtotalCents = typeof p.subtotalCents === 'number' ? p.subtotalCents : null;
    const explicitDiscountCents = typeof p.discountCents === 'number' ? p.discountCents : null;
    const derivedDiscountCents = explicitDiscountCents != null
      ? explicitDiscountCents
      : subtotalCents != null
        ? Math.max(0, subtotalCents - p.amountCents)
        : null;
    const effectiveDiscountCents = derivedDiscountCents != null && derivedDiscountCents > 0 ? derivedDiscountCents : null;

    return {
      id: p.id,
      planName: p.subscription?.plan?.name || p.plan?.name || 'Unknown',
      userName: p.user?.name || null,
      userEmail: p.user?.email || null,
      userId: p.userId,
      amountCents: p.amountCents,
      amountFormatted: formatCurrencyString(p.amountCents),
      subtotalCents,
      subtotalFormatted: subtotalCents != null ? formatCurrencyString(subtotalCents) : null,
      discountCents: explicitDiscountCents ?? effectiveDiscountCents,
      discountFormatted: effectiveDiscountCents != null ? formatCurrencyString(effectiveDiscountCents) : null,
      couponCode: p.couponCode ?? null,
      currency: p.currency ?? activeCurrency,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      externalPaymentId: p.externalPaymentId || null,
      externalSessionId: p.externalSessionId || null,
      dashboardUrl: getPaymentDashboardUrl(p),
      subscription: p.subscription ? {
        id: p.subscription.id,
        status: p.subscription.status,
        externalSubscriptionId: p.subscription.externalSubscriptionId ?? null,
        expiresAt: p.subscription.expiresAt?.toISOString() || null,
      } : null
    };
  });

  const lifetimeVolumeCents = Number(totalVolume._sum.amountCents ?? 0);
  const last30VolumeCents = Number(last30Volume._sum.amountCents ?? 0);
  const refundedVolumeCents = Number(refundedVolume._sum.amountCents ?? 0);
  const averageOrderValueCents = completedCount > 0 ? Math.round(lifetimeVolumeCents / completedCount) : 0;

  const weekRevenueCents = Number(weekRevenueAgg?._sum?.amountCents ?? 0);
  const todayRevenueCents = Number(todayRevenueAgg?._sum?.amountCents ?? 0);
  const expiringIn7 = Number(expiringIn7Count ?? 0);

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Lifetime revenue',
      value: formatCurrencyCents(lifetimeVolumeCents),
      helper: `Total refunds ${formatCurrencyCents(refundedVolumeCents)}`,
      icon: faSackDollar,
      accent: 'theme'
    },
    {
      label: '30-day revenue',
      value: formatCurrencyCents(last30VolumeCents),
      helper: `${formatNumber(last30CompletedCount)} completed purchases`,
      icon: faCalendarDay,
      accent: 'theme'
    },
    {
      label: 'Pending purchases',
      value: formatNumber(pendingCount),
      helper: `${formatNumber(failedCount)} failed overall`,
      icon: faReceipt,
      accent: 'theme'
    },
    {
      label: 'Average order value',
      value: formatCurrencyCents(averageOrderValueCents),
      helper: `Across ${formatNumber(completedCount)} completed purchases`,
      icon: faUsers,
      accent: 'theme'
    }
  ];

  const headerStats = [
    {
      label: 'Revenue this week',
      value: formatCurrencyCents(weekRevenueCents),
      helper: `${formatCurrencyCents(todayRevenueCents)} today`,
      tone: 'emerald' as const
    },
    {
      label: 'Expiring entitlements',
      value: formatNumber(expiringIn7),
      helper: `${formatNumber(expiringSoonCount)} expiring in 14 days`,
      tone: 'purple' as const
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="violet"
        eyebrow="Purchase ledger"
        eyebrowIcon={<FontAwesomeIcon icon={faReceipt} />}
        title="One-time purchase management"
        stats={headerStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <PaginatedPurchaseManagement
        displayCurrency={activeCurrency}
        initialPurchases={purchases}
        initialTotalCount={totalCount}
        initialPage={page}
        statusTotals={{
          All: Number(totalCount ?? 0),
          Succeeded: Number(completedCount ?? 0),
          Pending: Number(pendingCount ?? 0),
          Failed: Number(failedCount ?? 0),
          Refunded: Number(refundedCount ?? 0),
          Active: Number(activeAccessCount ?? 0),
          Expired: Number(expiredAccessCount ?? 0)
        }}
      />


    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getPaymentDashboardUrl(payment: {
  paymentProvider?: string | null;
  externalPaymentId?: string | null;
}): string | null {
  const providerId = (payment.paymentProvider || (payment.externalPaymentId ? 'stripe' : null) || process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();

  const paymentId = payment.externalPaymentId;

  if (!paymentId) return null;

  const providerConfig = PAYMENT_PROVIDER_REGISTRY[providerId];
  if (providerConfig) {
    try {
      return providerConfig.instantiate().getDashboardUrl('payment', paymentId);
    } catch (err) {
      void err;
    }
  }

  // Fallback to static patterns if provider isn't configured.
  return buildDashboardUrl(providerId, 'transaction', paymentId);
}
