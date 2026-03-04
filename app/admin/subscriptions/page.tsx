export const dynamic = 'force-dynamic';
import { requireAdminSectionAccess } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { formatCurrency as formatCurrencyUtil } from '../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { PaginatedSubscriptionsManagement } from '../../../components/admin/PaginatedSubscriptionsManagement';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import {
  faRepeat,
  faClockRotateLeft,
  faUserSlash,
  faUserPlus
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { PAYMENT_PROVIDER_REGISTRY } from '../../../lib/payment/registry';
import { buildDashboardUrl } from '../../../lib/payment/provider-config';

const resolveDashboardUrl = (
  provider: string | null | undefined,
  type: 'payment' | 'subscription' | 'customer',
  id?: string | null,
  sessionId?: string | null
) => {
  if (!id) return null;
  const normalized = (provider || '').toLowerCase();

  if (normalized === 'paystack') {
    const base = 'https://dashboard.paystack.com';
    const trimmed = id.trim();
    const isNumeric = /^\d+$/.test(trimmed);
    if (type === 'payment') {
      if (isNumeric) return `${base}/#/transactions/${trimmed}/analytics`;
      const target = trimmed || sessionId?.trim();
      const query = target ? `?search=${encodeURIComponent(target)}` : '';
      return `${base}/#/transactions${query}`;
    }
    if (type === 'subscription') return `${base}/#/subscriptions/${trimmed}`;
    if (type === 'customer') return `${base}/#/customers/${trimmed}`;
  }

  // Infer Stripe for legacy rows with missing provider.
  const inferredProvider = normalized || (id.startsWith('pi_') || id.startsWith('sub_') || id.startsWith('cus_') ? 'stripe' : '');
  const providerId = (inferredProvider || process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();

  const providerConfig = PAYMENT_PROVIDER_REGISTRY[providerId];
  if (providerConfig) {
    try {
      return providerConfig.instantiate().getDashboardUrl(type, id);
    } catch (err) {
      void err;
    }
  }

  const fallbackType = type === 'payment' ? 'transaction' : type;
  return buildDashboardUrl(providerId, fallbackType, id);
};


export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Subscriptions',
    description: 'Monitor auto-renewing plans, handle cancellations, and keep an eye on recurring revenue without leaving the admin dashboard.',
    audience: 'admin',
  });
}

export default async function AdminSubscriptionsPage() {
  await requireAdminSectionAccess('subscriptions');

  const activeCurrency = await getActiveCurrencyAsync();
  const formatCurrencyCents = (cents: number) => formatCurrencyUtil(cents, activeCurrency);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const baseWhere = { plan: { autoRenew: true } } as const;

  const [
    dbSubs,
    totalCount,
    activeCount,
    scheduledCancelCount,
    cancelledCount,
    expiredCount,
    newIn30Count,
    churn30Count,
    expiringSoonCount,
    activePlans,
    lifetimeRevenue,
    last30Revenue,
    succeededPaymentsCount,
    pendingPaymentsCount,
    failedPaymentsCount,
    refundedPaymentsCount,
    distinctCustomers
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: baseWhere,
      include: {
        plan: true,
        user: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.subscription.count({ where: baseWhere }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        status: 'ACTIVE',
        canceledAt: null
      }
    }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        canceledAt: { not: null },
        status: { not: 'CANCELLED' }
      }
    }),
    prisma.subscription.count({ where: { ...baseWhere, status: 'CANCELLED' } }),
    prisma.subscription.count({ where: { ...baseWhere, status: 'EXPIRED' } }),
    prisma.subscription.count({ where: { ...baseWhere, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        OR: [{ status: 'CANCELLED' }, { status: 'EXPIRED' }],
        updatedAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        expiresAt: {
          gt: now,
          lte: thirtyDaysAhead
        }
      }
    }),
    prisma.subscription.findMany({
      where: {
        ...baseWhere,
        status: 'ACTIVE',
        canceledAt: null
      },
      select: {
        plan: {
          select: {
            priceCents: true
          }
        }
      }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        subscription: { plan: { autoRenew: true } }
      }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        subscription: { plan: { autoRenew: true } },
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    // (refunds payment count removed — not used client-side)
    // counts of subscriptions that have at least one payment in the given status
    prisma.subscription.count({
      where: {
        ...baseWhere,
        payments: { some: { status: { in: ['COMPLETED', 'SUCCEEDED'] } } }
      }
    }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        payments: { some: { status: 'PENDING' } }
      }
    }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        payments: { some: { status: 'FAILED' } }
      }
    }),
    prisma.subscription.count({
      where: {
        ...baseWhere,
        payments: { some: { status: 'REFUNDED' } }
      }
    }),
    prisma.subscription.findMany({
      where: baseWhere,
      distinct: ['userId'],
      select: { userId: true }
    })
  ]);

  const subs = dbSubs.map(s => {
    const latestPayment = s.payments?.[0];
    const providerName = s.paymentProvider ?? null;
    return {
      id: s.id,
      planName: s.plan?.name || 'Unknown',
      planAutoRenew: s.plan?.autoRenew ?? null,
      userEmail: s.user?.email ?? null,
      userName: s.user?.name ?? null,
      userId: s.userId,
      status: s.status,
      expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
      canceledAt: s.canceledAt ? s.canceledAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      externalSubscriptionId: s.externalSubscriptionId ?? null,
      stripeSubscriptionId: s.stripeSubscriptionId ?? null,
      dashboardUrl: s.externalSubscriptionId
        ? resolveDashboardUrl(providerName, 'subscription', s.externalSubscriptionId)
        : s.stripeSubscriptionId
          ? resolveDashboardUrl(providerName, 'subscription', s.stripeSubscriptionId)
          : null,
      latestPayment: latestPayment
        ? {
          id: latestPayment.id,
          amountCents: latestPayment.amountCents,
          ...(() => {
            const formatCurrency = (cents: number) => formatCurrencyCents(cents);

            const subtotalCents = typeof latestPayment.subtotalCents === 'number'
              ? latestPayment.subtotalCents
              : null;
            const derivedDiscountCents =
              typeof latestPayment.discountCents === 'number'
                ? latestPayment.discountCents
                : subtotalCents != null
                  ? Math.max(0, subtotalCents - latestPayment.amountCents)
                  : 0;
            const effectiveDiscountCents = derivedDiscountCents > 0 ? derivedDiscountCents : 0;

            return {
              amountFormatted: formatCurrency(latestPayment.amountCents),
              subtotalCents,
              subtotalFormatted: subtotalCents != null ? formatCurrency(subtotalCents) : null,
              discountCents: typeof latestPayment.discountCents === 'number' ? latestPayment.discountCents : null,
              discountFormatted: effectiveDiscountCents > 0 ? formatCurrency(effectiveDiscountCents) : null
            };
          })(),
          couponCode: latestPayment.couponCode ?? null,
          currency: latestPayment.currency ?? activeCurrency,
          createdAt: latestPayment.createdAt.toISOString(),
          externalPaymentId: latestPayment.externalPaymentId ?? null,
          externalSessionId: latestPayment.externalSessionId ?? null,
          status: latestPayment.status,
          externalRefundId: latestPayment.externalRefundId ?? null,
          paymentProvider: latestPayment.paymentProvider ?? providerName,
          dashboardUrl: latestPayment.externalPaymentId
            ? resolveDashboardUrl(latestPayment.paymentProvider ?? providerName, 'payment', latestPayment.externalPaymentId, latestPayment.externalSessionId)
            : latestPayment.stripePaymentIntentId
              ? resolveDashboardUrl(latestPayment.paymentProvider ?? providerName, 'payment', latestPayment.stripePaymentIntentId, latestPayment.externalSessionId)
              : null
        }
        : null
    };
  });

  const activeMRRCents = activePlans.reduce((sum, entry) => sum + (entry.plan?.priceCents ?? 0), 0);
  const lifetimeRevenueCents = Number(lifetimeRevenue._sum.amountCents ?? 0);
  const last30RevenueCents = Number(last30Revenue._sum.amountCents ?? 0);
  const uniqueCustomers = distinctCustomers.filter((entry) => entry.userId).length;
  // refunds count available as refundsCount if needed

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Active subscriptions',
      value: formatNumber(activeCount),
      helper: `${formatNumber(totalCount)} managed total`,
      icon: faRepeat,
      accent: 'theme'
    },
    {
      label: 'Scheduled cancellations',
      value: formatNumber(scheduledCancelCount),
      helper: `${formatNumber(expiringSoonCount)} expiring in 30 days`,
      icon: faClockRotateLeft,
      accent: 'theme'
    },
    {
      label: 'Lifetime churn',
      value: formatNumber(cancelledCount + expiredCount),
      helper: `${formatNumber(churn30Count)} in the last 30 days`,
      icon: faUserSlash,
      accent: 'theme'
    },
    {
      label: 'New subscriptions (30d)',
      value: formatNumber(newIn30Count),
      helper: `${formatNumber(uniqueCustomers)} unique customers`,
      icon: faUserPlus,
      accent: 'theme'
    }
  ];

  const headerStats = [
    {
      label: 'Active recurring revenue',
      value: formatCurrencyCents(activeMRRCents),
      helper: `${formatNumber(activeCount)} active subscriptions`,
      tone: 'indigo' as const
    },
    {
      label: '30-day subscription revenue',
      value: formatCurrencyCents(last30RevenueCents),
      helper: `${formatCurrencyCents(lifetimeRevenueCents)} lifetime receipts`,
      tone: 'emerald' as const
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Recurring plans"
        eyebrowIcon={<FontAwesomeIcon icon={faRepeat} />}
        title="Subscription management"
        stats={headerStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <PaginatedSubscriptionsManagement
        displayCurrency={activeCurrency}
        initialSubs={subs}
        initialTotalCount={totalCount}
        initialPage={page}
        statusTotals={{
          All: Number(totalCount ?? 0),
          Active: Number(activeCount ?? 0),
          'Scheduled Cancel': Number(scheduledCancelCount ?? 0),
          Cancelled: Number(cancelledCount ?? 0),
          Expired: Number(expiredCount ?? 0),
          Succeeded: Number(succeededPaymentsCount ?? 0),
          Pending: Number(pendingPaymentsCount ?? 0),
          Failed: Number(failedPaymentsCount ?? 0),
          Refunded: Number(refundedPaymentsCount ?? 0)
        }}
      />
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
