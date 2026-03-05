import { prisma } from '../../../lib/prisma';
export const dynamic = 'force-dynamic';
import { ensureUserExists } from '../../../lib/user-helpers';
import { formatDateServer } from '../../../lib/formatDate.server';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faDollarSign, faCoins, faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import { pluralize } from '../../../lib/pluralize';
import { UserSettingsTabs } from '../../../components/dashboard/UserSettingsTabs';
import { getDefaultTokenLabel, getFreePlanSettings } from '../../../lib/settings';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';
import { buildReturnPath, requireAuth } from '../../../lib/route-guards';
import { getOrganizationPlanContext, buildPlanDisplay } from '../../../lib/user-plan-context';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Profile',
    description: 'Manage profile details, preferences, and subscription insights from your SaaSyBase account hub.',
    audience: 'user',
  });
}
// nextDynamic removed - no dynamic imports required in this file



export default async function UserProfilePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const returnPath = buildReturnPath('/dashboard/profile', resolvedSearchParams);
  const { userId, orgId } = await requireAuth(returnPath);

  // Ensure user exists in database
  const user = await ensureUserExists();

  if (!user) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-neutral-50">Profile</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-sm text-slate-500 dark:text-neutral-400">Unable to load profile information.</div>
        </div>
      </div>
    );
  }

  const [subscription, paymentStats, userSettings, defaultTokenLabel, grossPaymentStats, recentPayments, organizationPlan] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      include: { plan: true }
    }),
    prisma.payment.aggregate({
      where: { userId, status: { not: 'REFUNDED' } },
      _sum: { amountCents: true },
      _count: { id: true }
    }),
    prisma.userSetting.findMany({ where: { userId } }),
    getDefaultTokenLabel(),
    prisma.payment.aggregate({
      where: { userId },
      _sum: { amountCents: true },
      _count: { id: true }
    }),
    prisma.payment.findMany({
      where: { userId },
      take: 200,
      select: {
        plan: { select: { name: true } },
        subscription: { select: { plan: { select: { name: true } } } }
      }
    }),
    getOrganizationPlanContext(userId, orgId)
  ]);

  const totalSpentCents = paymentStats._sum.amountCents ?? 0;
  const totalSpent = totalSpentCents / 100;
  const grossTotalCents = grossPaymentStats._sum.amountCents ?? 0;
  const grossTotal = grossTotalCents / 100;
  const grossCount = grossPaymentStats._count.id ?? 0;
  const netCount = paymentStats._count.id ?? 0;

  // compute most purchased plan from recentPayments
  const planCounts: Record<string, number> = {};
  for (const p of recentPayments) {
    const name = p.subscription?.plan?.name ?? p.plan?.name ?? 'Unknown';
    planCounts[name] = (planCounts[name] || 0) + 1;
  }
  const mostPurchased = Object.entries(planCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
  const mostPurchasedCount = Object.entries(planCounts).sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0;
  const daysRemaining = subscription ? Math.max(0, Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  const greetingName = user.name?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'there';
  // roleLabel and nextRenewalLabel removed — profile hero trimmed
  const daysLabel = pluralize(daysRemaining, 'day');
  const paidTokenBalance = typeof user.tokenBalance === 'number' ? user.tokenBalance : 0;
  const freeTokenBalanceVal = typeof user.freeTokenBalance === 'number' ? user.freeTokenBalance : 0;

  // Use free plan settings when user has no active subscription so UI reflects configured free tokens
  const freePlanSettings = await getFreePlanSettings();
  const planDisplay = buildPlanDisplay({
    subscription,
    organizationContext: organizationPlan,
    userTokenBalance: paidTokenBalance,
    userFreeTokenBalance: freeTokenBalanceVal,
    freePlanSettings,
    defaultTokenLabel,
  });
  const planName = planDisplay.planName;
  const tokenLabel = planDisplay.tokenLabel;
  const tokenStatValue = planDisplay.tokenStatValue;
  const tokenStatHelper = planDisplay.tokenStatHelper;
  const statusHelper = planDisplay.statusHelper;

  const preformattedCreatedAt = await formatDateServer(user.createdAt, userId);

  const currentPlanFooter = subscription
    ? `${daysLabel} left in current cycle`
    : planDisplay.planSource === 'ORGANIZATION' && planDisplay.workspace
      ? `Managed by ${planDisplay.workspace.name}`
      : 'No active subscription yet';

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        accent="emerald"
        eyebrow="Account"
        eyebrowIcon={<FontAwesomeIcon icon={faUser} />}
        title={`Welcome back, ${greetingName}`}
        stats={[
          {
            label: 'Status',
            value: planDisplay.statusValue,
            helper: statusHelper,
            tone: planDisplay.planSource === 'FREE' ? 'slate' : 'emerald',
          },
          {
            label: `Remaining ${tokenLabel}`,
            value: tokenStatValue,
            helper: tokenStatHelper,
            tone: 'purple',
          },
        ]}
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <AdminStatCard
          label="Gross lifetime spend"
          value={`$${grossTotal.toFixed(2)}`}
          helper={`${grossCount} transactions`}
          icon={faDollarSign}
          accent="theme"
        />
        <AdminStatCard
          label="Net lifetime spend"
          value={`$${totalSpent.toFixed(2)}`}
          helper={`${netCount} transactions`}
          icon={faDollarSign}
          accent="theme"
        />
        <AdminStatCard
          label="Most purchased"
          value={mostPurchased}
          helper={`${mostPurchasedCount} purchases`}
          icon={faCoins}
          accent="theme"
        />
        <AdminStatCard
          label="Current plan"
          value={planName}
          footer={currentPlanFooter}
          icon={faCalendarDays}
          accent="theme"
        />
      </section>

      <UserSettingsTabs
        user={user}
        subscription={subscription}
        userSettings={userSettings}
        initialActiveTab={undefined}
        preformattedCreatedAt={preformattedCreatedAt}
      />


    </div>
  );
}
