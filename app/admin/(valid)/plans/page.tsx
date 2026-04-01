export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../../lib/route-guards';
import { prisma } from '../../../../lib/prisma';
import { PlanManagement } from '../../../../components/admin/PlanManagement';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import {
  faLayerGroup,
  faArrowsRotate,
  faBolt,
  faClock
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

const numberFormatter = new Intl.NumberFormat('en-US');

const formatNumber = (value: number) => numberFormatter.format(value);

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Plans',
    description: 'Curate your product catalog, adjust pricing, and keep subscription SKUs aligned across Stripe and the app.',
    audience: 'admin',
  });
}

export default async function AdminPlansPage() {
  await requireAdminAuth('/admin/plans');

  const activeCurrency = await getActiveCurrencyAsync();
  const formatCurrency = (dollars: number) =>
    formatCurrencyUtil(Math.round(dollars * 100), activeCurrency);

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [plans, activeSubscriptionCount, expiringSubscriptionCount] = await Promise.all([
    prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            subscriptions: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      }
    }),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.subscription.count({
      where: {
        status: { in: ['ACTIVE', 'SCHEDULED_CANCEL'] },
        expiresAt: {
          gte: now,
          lte: thirtyDaysFromNow
        }
      }
    })
  ]);

  const totalPlans = plans.length;
  const activePlans = plans.filter((plan) => plan.active).length;
  const subscriptionPlans = plans.filter((plan) => plan.autoRenew).length;
  const oneTimePlans = totalPlans - subscriptionPlans;

  const priceSummary = plans.reduce(
    (acc, plan) => {
      acc.total += plan.priceCents;
      acc.max = Math.max(acc.max, plan.priceCents);
      return acc;
    },
    { total: 0, max: 0 }
  );

  const averagePrice = totalPlans > 0 ? priceSummary.total / totalPlans / 100 : 0;
  const highestPrice = priceSummary.max / 100;

  // Determine Bestseller plan by active subscriber count
  const Bestseller = plans.reduce((best, p) => {
    if (!best) return p;
    return (p._count?.subscriptions ?? 0) > (best._count?.subscriptions ?? 0) ? p : best;
  }, plans[0] as (typeof plans)[number] | undefined);
  const BestsellerName = Bestseller ? Bestseller.name : '—';

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total plans',
      value: formatNumber(totalPlans),
      helper: `Bestseller: ${BestsellerName}`,
      icon: faLayerGroup,
      accent: 'theme'
    },
    {
      label: 'Average price',
      value: formatCurrency(averagePrice),
      helper: `Max ${formatCurrency(highestPrice)}`,
      icon: faBolt,
      accent: 'theme'
    },
    {
      label: 'Active subscriptions',
      value: formatNumber(activeSubscriptionCount),
      helper: (() => {
        const plansWithActiveSubs = plans.filter((p) => (p._count?.subscriptions ?? 0) > 0).length;
        return `Across ${formatNumber(plansWithActiveSubs)} plan${plansWithActiveSubs === 1 ? '' : 's'}`;
      })(),
      icon: faArrowsRotate,
      accent: 'theme'
    },
    {
      label: 'Expiring in 30 days',
      value: formatNumber(expiringSubscriptionCount),
      helper: 'Includes scheduled cancels',
      icon: faClock,
      accent: 'theme'
    }
  ];

  const heroStats = [
    {
      label: 'Active plans',
      value: formatNumber(activePlans),
      helper: `${formatNumber(totalPlans - activePlans)} inactive`,
      tone: 'emerald' as const
    },
    {
      label: 'Subscription SKUs',
      value: formatNumber(subscriptionPlans),
      helper: `${formatNumber(oneTimePlans)} one-time offers`,
      tone: 'indigo' as const
    }
  ];

  const serializablePlans = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    shortDescription: plan.shortDescription,
    description: plan.description,
    priceCents: plan.priceCents,
    durationHours: plan.durationHours,
    active: plan.active,
    sortOrder: plan.sortOrder,
    externalPriceId: plan.externalPriceId,
    externalPriceIds: plan.externalPriceIds,
    externalProductIds: plan.externalProductIds,
    autoRenew: plan.autoRenew,
    recurringInterval: plan.recurringInterval,
    recurringIntervalCount: plan.recurringIntervalCount,
    tokenLimit: plan.tokenLimit,
    tokenName: plan.tokenName,
    supportsOrganizations: plan.supportsOrganizations,
    organizationSeatLimit: plan.organizationSeatLimit,
    organizationTokenPoolStrategy: plan.organizationTokenPoolStrategy,
    activeSubscriberCount: plan._count.subscriptions
  }));

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Catalog"
        eyebrowIcon={<FontAwesomeIcon icon={faLayerGroup} />}
        title="Plan management"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <PlanManagement plans={serializablePlans} currency={activeCurrency} />
    </div>
  );
}
