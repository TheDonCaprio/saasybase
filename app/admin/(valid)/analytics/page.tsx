import { requireAdminSectionAccess } from '../../../../lib/route-guards';
import { DashboardPageHeader } from '../../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard, type AdminStatCardProps } from '../../../../components/admin/AdminStatCard';
// removed dashboardMutedPanelClass import (subscriber snapshot removed)
import AnalyticsDashboard from '../../../../components/admin/AnalyticsDashboard';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import { getAdminAnalytics } from '../../../../lib/admin-analytics';
import { ADMIN_ANALYTICS_PERIODS, type AdminAnalyticsPeriod } from '../../../../lib/admin-analytics-shared';
import { faSackDollar, faChartLine, faUserCheck, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Analytics',
    description: 'Monitor revenue momentum, subscriber health, and customer growth without leaving the admin experience.',
    audience: 'admin',
  });
}

const numberFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const formatNumber = (value: number) => numberFormatter.format(value);
const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;
// (formatGrowth helper intentionally removed here; dashboard uses its own formatter)

interface AdminAnalyticsPageProps {
  searchParams?: Promise<{ period?: string }>;
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  await requireAdminSectionAccess('analytics');

  const activeCurrency = await getActiveCurrencyAsync();
  const formatCurrency = (dollars: number) => formatCurrencyUtil(Math.round(dollars * 100), activeCurrency);

  const resolvedSearchParams = await searchParams;
  const requestedPeriod = (resolvedSearchParams?.period as AdminAnalyticsPeriod | undefined) ?? '30d';
  const analytics = await getAdminAnalytics(requestedPeriod);

  const totalUsers = analytics.users.total;
  const payingUsers = analytics.users.active;
  const freeUsers = Math.max(totalUsers - payingUsers, 0);
  const payingSharePercent = totalUsers > 0 ? (payingUsers / totalUsers) * 100 : 0;
  // (arpu removed from UI; compute on-demand elsewhere if needed)

  const heroStats = [
    {
      label: 'Revenue today',
      value: formatCurrency(analytics.revenue.daily),
      helper: `vs yesterday: ${formatCurrency(analytics.revenue.yesterday)}`,
      tone: 'emerald' as const
    },
    {
      label: 'Sign ups today',
      value: formatNumber(analytics.users.today),
      helper: `${formatNumber(analytics.users.thisWeek)} this week`,
      tone: 'indigo' as const
    }
  ];

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total revenue',
      value: formatCurrency(analytics.revenue.total),
      helper: 'Processed lifetime',
      icon: faSackDollar,
      accent: 'theme'
    },
    {
      label: 'Monthly recurring revenue',
      value: formatCurrency(analytics.revenue.mrr),
      helper: `${formatCurrency(analytics.revenue.arr)} ARR`,
      icon: faChartLine,
      accent: 'theme'
    },
    {
      label: 'Paying customers',
      value: formatNumber(payingUsers),
      helper: `${formatPercent(payingSharePercent)} of ${formatNumber(totalUsers)} users`,
      icon: faUserCheck,
      accent: 'theme'
    },
    {
      label: 'Total users',
      value: formatNumber(totalUsers),
      helper: `${formatNumber(freeUsers)} free · ${formatNumber(payingUsers)} paying`,
      icon: faUserPlus,
      accent: 'theme'
    }
  ];

  // subscriptionSummary removed; snapshot section deleted

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Growth analytics"
        eyebrowIcon={<FontAwesomeIcon icon={faChartLine} className="w-5 h-5" />}
        title="Sales & growth"
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 min-[834px]:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      {/* Subscriber snapshot removed per request */}

      <AnalyticsDashboard
        initialData={analytics}
        initialPeriod={analytics.period}
        periodOptions={ADMIN_ANALYTICS_PERIODS}
        currency={activeCurrency}
      />
    </div>
  );
}
