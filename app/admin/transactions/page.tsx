export const dynamic = 'force-dynamic';
import { requireAdminSectionAccess } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { formatCurrency as formatCurrencyUtil } from '../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { PaginatedPaymentManagement } from '../../../components/admin/PaginatedPaymentManagement';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import {
  faSackDollar,
  faCalendarCheck,
  faClock,
  faCreditCard
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { PAYMENT_PROVIDER_REGISTRY } from '../../../lib/payment/registry';
import { buildDashboardUrl } from '../../../lib/payment/provider-config';


export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Transactions',
    description: 'Track revenue, refunds, and payment statuses with live financial telemetry for every charge.',
    audience: 'admin',
  });
}

export default async function AdminTransactionsPage() {
  await requireAdminSectionAccess('transactions');

  const activeCurrency = await getActiveCurrencyAsync();
  const formatCurrency = (dollars: number) =>
    formatCurrencyUtil(Math.round(dollars * 100), activeCurrency);

  const page = 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    payments,
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
    activeSubscriptionsCount,
    expiringIn7Count,
    activeAccessCount,
    expiredAccessCount
  ] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        subscription: { include: { plan: true } },
        plan: true,
        user: true
      }
    }),
    prisma.payment.count(),
    prisma.payment.count({ where: { status: { in: ['COMPLETED', 'SUCCEEDED'] } } }),
    prisma.payment.count({ where: { status: { in: ['PENDING', 'PENDING_SUBSCRIPTION'] } } }),
    prisma.payment.count({ where: { status: 'FAILED' } }),
    prisma.payment.count({ where: { status: 'REFUNDED' } }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: { in: ['COMPLETED', 'SUCCEEDED'] } }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.payment.count({
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: 'REFUNDED' }
    }),
    // revenue this week (last 7 days)
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: sevenDaysAgo }
      }
    }),
    // revenue today
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        status: { in: ['COMPLETED', 'SUCCEEDED'] },
        createdAt: { gte: startOfToday }
      }
    }),
    // active subscriptions
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    // subscriptions expiring in next 7 days
    prisma.subscription.count({ where: { status: 'ACTIVE', expiresAt: { gte: now, lte: sevenDaysFromNow } } }),
    // payments with active access (active subscription not expired)
    prisma.payment.count({
      where: {
        subscription: {
          status: 'ACTIVE',
          expiresAt: { gt: now }
        }
      }
    }),
    // payments with expired access (no subscription or expired/inactive)
    prisma.payment.count({
      where: {
        OR: [
          { subscription: null },
          { subscription: { status: { not: 'ACTIVE' } } },
          { subscription: { status: 'ACTIVE', expiresAt: { lte: now } } }
        ]
      }
    })
  ]);

  const successfulVolumeCents = Number(totalVolume._sum.amountCents ?? 0);
  const last30VolumeCents = Number(last30Volume._sum.amountCents ?? 0);
  const refundedVolumeCents = Number(refundedVolume._sum.amountCents ?? 0);
  const averageOrderValue = completedCount > 0 ? successfulVolumeCents / completedCount / 100 : 0;

  // newly added aggregates (normalize values)
  const weekRevenueCents = Number(weekRevenueAgg?._sum?.amountCents ?? 0);
  const todayRevenueCents = Number(todayRevenueAgg?._sum?.amountCents ?? 0);
  const activeSubscriptions = Number(activeSubscriptionsCount ?? 0);
  const expiringIn7 = Number(expiringIn7Count ?? 0);
  const activeAccess = Number(activeAccessCount ?? 0);
  const expiredAccess = Number(expiredAccessCount ?? 0);

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Lifetime volume',
      value: formatCurrency(successfulVolumeCents / 100),
      helper: `Total refunds ${formatCurrency(refundedVolumeCents / 100)}`,
      icon: faSackDollar,
      accent: 'emerald'
    },
    {
      label: '30-day volume',
      value: formatCurrency(last30VolumeCents / 100),
      helper: `${formatNumber(last30CompletedCount)} successful charges`,
      icon: faCalendarCheck,
      accent: 'indigo'
    },
    {
      label: 'Pending charges',
      value: formatNumber(pendingCount),
      helper: `${formatNumber(failedCount)} failed overall`,
      icon: faClock,
      accent: 'amber'
    },
    {
      label: 'Average order value',
      value: formatCurrency(averageOrderValue),
      helper: `Across ${formatNumber(completedCount)} completed charges`,
      icon: faCreditCard,
      accent: 'violet'
    }
  ];

  const headerStats = [
    {
      label: 'Revenue this week',
      value: formatCurrency(weekRevenueCents / 100),
      helper: `${formatCurrency(todayRevenueCents / 100)} today`,
      tone: 'emerald' as const
    },
    {
      label: 'Active subscriptions',
      value: formatNumber(activeSubscriptions),
      helper: `${formatNumber(expiringIn7)} expiring in 7 days`,
      tone: 'purple' as const
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Billing ledger"
        eyebrowIcon={<FontAwesomeIcon icon={faMoneyBillWave} />}
        title="Transaction management"
        description="Stay ahead of revenue trends, keep an eye on refunds, and dive into individual charges without leaving the dashboard."
        stats={headerStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      {/* Map payments to include server-formatted amounts for SSR */}
      <PaginatedPaymentManagement
        initialPayments={payments.map((p) => ({
          ...p,
          amountFormatted: (() => {
            try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (p.currency ?? 'usd').toUpperCase() }).format((p.amountCents ?? 0) / 100); } catch (e) { void e; return `$${((p.amountCents ?? 0) / 100).toFixed(2)}`; }
          })(),
          subtotalFormatted: (p.subtotalCents != null) ? (() => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (p.currency ?? 'usd').toUpperCase() }).format((p.subtotalCents ?? 0) / 100); } catch (e) { void e; return null; } })() : null,
          discountFormatted: (p.discountCents != null) ? (() => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: (p.currency ?? 'usd').toUpperCase() }).format((p.discountCents ?? 0) / 100); } catch (e) { void e; return null; } })() : null,
          dashboardUrl: getPaymentDashboardUrl(p),
        }))}
        initialTotalCount={totalCount}
        initialPage={page}
        statusTotals={{
          All: Number(totalCount ?? 0),
          Succeeded: Number(completedCount ?? 0),
          Pending: Number(pendingCount ?? 0),
          Failed: Number(failedCount ?? 0),
          Refunded: Number(refundedCount ?? 0),
          Active: Number(activeAccess ?? 0),
          Expired: Number(expiredAccess ?? 0)
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
  stripePaymentIntentId?: string | null;
}): string | null {
  const providerId = (payment.paymentProvider || (payment.stripePaymentIntentId ? 'stripe' : null) || process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();

  const paymentId = providerId === 'stripe'
    ? (payment.stripePaymentIntentId || payment.externalPaymentId)
    : (payment.externalPaymentId || payment.stripePaymentIntentId);

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
