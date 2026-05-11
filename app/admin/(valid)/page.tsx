export const dynamic = 'force-dynamic';
import { requireAdminAreaActor } from '../../../lib/route-guards';
import { prisma } from '../../../lib/prisma';
import { formatDateServer } from '../../../lib/formatDate.server';
import { formatCurrency as formatCurrencyUtil } from '../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../lib/payment/registry';
import { asRecord } from '../../../lib/runtime-guards';
import { getAdminTrafficSnapshot } from '../../../lib/admin-traffic';
import { DashboardPageHeader, type DashboardPageHeaderStat } from '../../../components/dashboard/DashboardPageHeader';
import Link from 'next/link';
import {
  dashboardPanelClass,
  dashboardMutedPanelClass,
  dashboardPillClass
} from '../../../components/dashboard/dashboardSurfaces';
import { AdminStatCard } from '../../../components/admin/AdminStatCard';
import type { AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faRepeat,
  faCircleDollarToSlot,
  faArrowTrendUp,
  faReceipt,
  faGear,
  faSackDollar,
  faUserShield,
  faArrowUpRightFromSquare,
  faLifeRing,
  faGaugeHigh,
  faBolt,
  faWaveSquare,
  faUserPlus,
  faCalendarDay,
  faTriangleExclamation
} from '@fortawesome/free-solid-svg-icons';
import type { ModeratorSection } from '../../../lib/moderator';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Overview',
    description: 'Monitor revenue, keep an eye on subscriptions, and take action fast when something needs your attention.',
    audience: 'admin',
  });
}

export default async function AdminHome() {
  const actor = await requireAdminAreaActor();
  const isAdmin = actor.role === 'ADMIN';
  const canAccess = (section: ModeratorSection) => isAdmin || actor.permissions[section];

  const activeCurrency = await getActiveCurrencyAsync();
  // Format a dollar value as currency using the active provider's currency
  // NOTE: This wrapper accepts dollars (for compatibility with existing code)
  // and converts to cents for the formatCurrency utility
  const formatCurrency = (dollars: number) =>
    formatCurrencyUtil(Math.round(dollars * 100), activeCurrency);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const [
    totalUsers,
    totalPayments,
    activeSubscriptions,
    recentPayments,
    openTickets,
    inProgressTickets,
    newUsersLast7Days,
    paymentsToday
  ] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count(),
    prisma.subscription.count({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() } } }),
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true, subscription: { include: { plan: true } } },
      take: 5
    }),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.payment.count({ where: { createdAt: { gte: startOfToday } } })
  ]);

  const [todayRevenueAgg, todayRefundAgg, topPlanGroup] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        createdAt: { gte: startOfToday },
        status: { not: 'REFUNDED' },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        createdAt: { gte: startOfToday },
        status: 'REFUNDED',
      },
    }),
    prisma.payment.groupBy({
      by: ['planId'],
      where: {
        createdAt: { gte: startOfToday },
        status: { not: 'REFUNDED' },
        planId: { not: null },
      },
      _count: { planId: true },
      _sum: { amountCents: true },
      orderBy: [
        { _count: { planId: 'desc' } },
        { _sum: { amountCents: 'desc' } },
      ],
      take: 1,
    }),
  ]);

  let errorWarningToday = 0;
  let errorWarningWeek = 0;
  try {
    [errorWarningToday, errorWarningWeek] = await Promise.all([
      prisma.systemLog.count({
        where: {
          createdAt: { gte: startOfToday },
          level: { in: ['ERROR', 'WARN', 'WARNING', 'error', 'warn', 'warning'] },
        },
      }),
      prisma.systemLog.count({
        where: {
          createdAt: { gte: startOfWeek },
          level: { in: ['ERROR', 'WARN', 'WARNING', 'error', 'warn', 'warning'] },
        },
      }),
    ]);
  } catch {
    // Older/unmigrated environments may not have SystemLog table.
    errorWarningToday = 0;
    errorWarningWeek = 0;
  }

  const topPlanTodayPlanId = topPlanGroup[0]?.planId ?? null;
  const topPlanToday = topPlanTodayPlanId
    ? await prisma.plan.findUnique({ where: { id: topPlanTodayPlanId }, select: { name: true } })
    : null;
  const topPlanTodayLabel = topPlanToday?.name ?? (topPlanTodayPlanId ? 'Unknown plan' : 'No plan sales yet');
  const todayRevenueCents = Number(todayRevenueAgg._sum.amountCents ?? 0) - Number(todayRefundAgg._sum.amountCents ?? 0);

  const totalRevenue = await prisma.payment.aggregate({
    _sum: { amountCents: true },
    where: { status: { not: 'REFUNDED' } }
  });

  const refundedAmount = await prisma.payment.aggregate({
    _sum: { amountCents: true },
    where: { status: 'REFUNDED' }
  });

  // Coerce recent payments from Prisma into a safe runtime shape for the UI
  type RecentPayment = {
    id: string;
    amountCents: number;
    createdAt: Date | string;
    user?: { email?: string } | null;
    subscription?: { plan?: { name?: string } } | null;
    formattedCreatedAt?: string | null;
  };

  const recentPaymentsWithFormats = await Promise.all((recentPayments || []).map(async (raw) => {
    const pRec = asRecord(raw) || {};
    const id = String(pRec.id ?? '');
    const amountCents = Number(pRec.amountCents ?? 0);
    const createdAt = pRec.createdAt instanceof Date ? pRec.createdAt : new Date(String(pRec.createdAt ?? Date.now()));
    const user = (asRecord(pRec.user) as Record<string, unknown> | undefined) || undefined;
    const subscription = (asRecord(pRec.subscription) as Record<string, unknown> | undefined) || undefined;
    const formattedCreatedAt = createdAt ? await formatDateServer(createdAt) : null;
    return { id, amountCents, createdAt, user, subscription, formattedCreatedAt } as RecentPayment;
  }));

  const totalRevenueCents = Number(totalRevenue._sum.amountCents ?? 0);
  const refundedCents = Number(refundedAmount._sum.amountCents ?? 0);
  const netRevenueCents = totalRevenueCents - refundedCents;
  const conversionRate = totalUsers > 0 ? (activeSubscriptions / totalUsers) * 100 : 0;
  const averageTransactionValue = totalPayments > 0 ? netRevenueCents / totalPayments / 100 : 0;
  const refundRate = totalRevenueCents > 0 ? (refundedCents / totalRevenueCents) * 100 : 0;

  // Fetch today's visits (compare with yesterday) using the same traffic snapshot logic as /admin/traffic.
  let visitsToday = 0;
  let visitsYesterday = 0;
  try {
    const traffic = await getAdminTrafficSnapshot({ period: '1d' });
    visitsToday = Number(traffic.totals?.visits ?? 0);
    // previousPeriod is not provided by traffic snapshot; we can approximate by querying a 1-day custom range for yesterday
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yStr = yesterday.toISOString().slice(0, 10);
      const yesterdaySnapshot = await getAdminTrafficSnapshot({ period: 'custom', startDate: yStr, endDate: yStr });
      visitsYesterday = Number(yesterdaySnapshot.totals?.visits ?? 0);
    } catch {
      // ignore secondary failure
    }
  } catch {
    // GA unavailable — keep zeros
  }

  const visitsDelta = visitsToday - visitsYesterday;
  const visitsTrend = visitsDelta === 0 ? 'flat' : visitsDelta > 0 ? 'up' : 'down';

  const headerStats: DashboardPageHeaderStat[] = [];
  if (canAccess('traffic')) {
    headerStats.push({
      label: 'Visits today',
      value: formatNumber(visitsToday),
      helper: `vs ${formatNumber(visitsYesterday)} yesterday`,
      tone: 'indigo'
    });
  }
  if (canAccess('support')) {
    headerStats.push({
      label: 'Open tickets',
      value: formatNumber(openTickets),
      helper: `${formatNumber(inProgressTickets)} in progress`,
      tone: 'amber'
    });
  }

  const metricCandidates: Array<{ section: ModeratorSection; card: AdminStatCardProps }> = [
    {
      section: 'users',
      card: {
        label: 'Total users',
        value: formatNumber(totalUsers),
        helper: 'All-time accounts',
        icon: faUsers,
        accent: 'theme'
      }
    },
    {
      section: 'subscriptions',
      card: {
        label: 'Active subscriptions',
        value: formatNumber(activeSubscriptions),
        helper: `${conversionRate.toFixed(1)}% conversion`,
        icon: faRepeat,
        accent: 'theme'
      }
    },
    {
      section: 'transactions',
      card: {
        label: 'Net revenue',
        value: formatCurrency(netRevenueCents / 100),
        helper: `Refunds: ${formatCurrency(refundedCents / 100)}`,
        icon: faCircleDollarToSlot,
        accent: 'theme'
      }
    },
    {
      section: 'transactions',
      card: {
        label: 'Total transactions',
        value: formatNumber(totalPayments),
        helper: averageTransactionValue ? `${formatCurrency(averageTransactionValue)} avg.` : 'No transactions yet',
        icon: faArrowTrendUp,
        accent: 'theme'
      }
    },
    {
      section: 'users',
      card: {
        label: 'New users (7d)',
        value: formatNumber(newUsersLast7Days),
        helper: 'Recently joined accounts',
        icon: faUserPlus,
        accent: 'theme'
      }
    },
    {
      section: 'transactions',
      card: {
        label: 'Payments today',
        value: formatNumber(paymentsToday),
        helper: `Refund rate ${refundRate.toFixed(1)}%`,
        icon: faCalendarDay,
        accent: 'theme'
      }
    },
    {
      section: 'transactions',
      card: {
        label: 'Revenue today',
        value: formatCurrency(todayRevenueCents / 100),
        helper: `Top plan: ${topPlanTodayLabel}`,
        icon: faSackDollar,
        accent: 'theme'
      }
    },
    {
      section: 'analytics',
      card: {
        label: 'Issues Today',
        value: formatNumber(errorWarningToday),
        helper: `${formatNumber(errorWarningWeek)} this week`,
        icon: faTriangleExclamation,
        accent: 'theme'
      }
    }
  ];

  const metrics = metricCandidates
    .filter(({ section }) => canAccess(section))
    .map(({ card }) => card);

  type QuickLinkCandidate = QuickLink & { section?: ModeratorSection; adminOnly?: boolean };

  const quickLinkCandidates: QuickLinkCandidate[] = [
    {
      href: '/admin/users',
      title: 'Manage users',
      description: 'View, filter, and adjust roles or status.',
      icon: faUsers,
      section: 'users'
    },
    {
      href: '/admin/transactions',
      title: 'Review transactions',
      description: 'Audit payments, trigger refunds, monitor disputes.',
      icon: faReceipt,
      section: 'transactions'
    },
    {
      href: '/admin/settings',
      title: 'System settings',
      description: 'Tune billing, integrations, and platform defaults.',
      icon: faGear,
      adminOnly: true
    },
    {
      href: '/admin/analytics',
      title: 'View analytics',
      description: 'Revenue, traffic, and conversion snapshots.',
      icon: faArrowTrendUp,
      section: 'analytics'
    },
    {
      href: '/admin/notifications',
      title: 'Manage notifications',
      description: 'Broadcast messages and configure digests.',
      icon: faRepeat,
      section: 'notifications'
    },
    {
      href: '/admin/plans',
      title: 'Plans & pricing',
      description: 'Create or update subscription plans.',
      icon: faSackDollar,
      adminOnly: true
    },
    {
      href: '/admin/moderation',
      title: 'Moderation activity',
      description: 'Audit moderator and admin actions in one view.',
      icon: faUserShield,
      adminOnly: true
    }
  ];

  const quickLinks: QuickLink[] = quickLinkCandidates
    .filter((link) => {
      if (link.adminOnly && !isAdmin) {
        return false;
      }
      if (link.section && !canAccess(link.section)) {
        return false;
      }
      return true;
    })
    .map(({ href, title, description, icon }) => ({ href, title, description, icon }));

  const showTransactionsPanels = canAccess('transactions');
  const showQuickActions = quickLinks.length > 0;

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Operations center"
        eyebrowIcon={<FontAwesomeIcon icon={faGear} />}
        title="Quick overview"
        stats={headerStats.length > 0 ? headerStats : undefined}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 min-[834px]:grid-cols-4">
        {metrics.length > 0
          ? metrics.map((metric) => <AdminStatCard key={metric.label} {...metric} />)
          : (
            <div className={dashboardMutedPanelClass('md:col-span-2 xl:col-span-4 text-sm text-slate-600 dark:text-neutral-300')}>
              No metric cards are available for your access level yet.
            </div>
          )}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className={dashboardPanelClass('relative flex h-full flex-col gap-4 overflow-hidden')}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.22),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Traffic pulse</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Daily momentum</h3>
            </div>
            <span className={dashboardPillClass('text-indigo-700 dark:text-indigo-200')}>
              <FontAwesomeIcon icon={faWaveSquare} className="h-3.5 w-3.5" />
              {visitsTrend === 'up' ? '+' : visitsTrend === 'down' ? '-' : ''}{formatNumber(Math.abs(visitsDelta))}
            </span>
          </div>
          <div className="relative space-y-2">
            <div className="text-3xl font-semibold leading-none text-slate-900 dark:text-neutral-100">{formatNumber(visitsToday)}</div>
            <p className="text-sm text-slate-600 dark:text-neutral-300">Visits today • {formatNumber(visitsYesterday)} yesterday</p>
          </div>
          {canAccess('traffic') ? (
            <Link
              href="/admin/traffic"
              className="relative mt-auto inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300"
            >
              Open traffic analytics
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className={dashboardPanelClass('relative flex h-full flex-col gap-4 overflow-hidden')}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.22),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Revenue quality</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Transaction health</h3>
            </div>
            <span className={dashboardPillClass('text-emerald-700 dark:text-emerald-200')}>
              <FontAwesomeIcon icon={faGaugeHigh} className="h-3.5 w-3.5" />
              {averageTransactionValue ? formatCurrency(averageTransactionValue) : '—'}
            </span>
          </div>
          <dl className="relative grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-neutral-400">Refund rate</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-100">{refundRate.toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-neutral-400">Net revenue</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-100">{formatCurrency(netRevenueCents / 100)}</dd>
            </div>
          </dl>
          {canAccess('transactions') ? (
            <Link
              href="/admin/transactions"
              className="relative mt-auto inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300"
            >
              Open transactions
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className={dashboardPanelClass('relative flex h-full flex-col gap-4 overflow-hidden')}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.2),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Support load</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Queue status</h3>
            </div>
            <span className={dashboardPillClass('text-amber-700 dark:text-amber-200')}>
              <FontAwesomeIcon icon={faLifeRing} className="h-3.5 w-3.5" />
              {formatNumber(openTickets + inProgressTickets)}
            </span>
          </div>
          <div className="relative grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Open</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(openTickets)}</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">In progress</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(inProgressTickets)}</p>
            </div>
          </div>
          <Link
            href="/admin/support"
            className="relative mt-auto inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300"
          >
            Open support desk
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {showTransactionsPanels || showQuickActions ? (
        <section
          className={`grid gap-6 ${
            showTransactionsPanels && showQuickActions ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : 'xl:grid-cols-1'
          }`}
        >
          {showTransactionsPanels ? (
            <div className="space-y-6">
              <div className={dashboardPanelClass('space-y-5 overflow-hidden') + ' relative'}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_65%)] opacity-70 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_60%)]" />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Recent transactions</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-400">Latest five payments across the platform.</p>
                  </div>
                  <span className={dashboardPillClass('text-slate-700 dark:text-neutral-200')}>
                    {recentPaymentsWithFormats.length} new
                  </span>
                </div>

                <div className="relative space-y-3">
                  {recentPaymentsWithFormats.length > 0 ? (
                    recentPaymentsWithFormats.map((payment: RecentPayment) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:hover:border-neutral-700"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900 dark:text-neutral-100">{payment.user?.email || 'Unknown user'}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-400">{payment.subscription?.plan?.name || 'Plan removed'}</p>
                          </div>
                          <div className="border-t border-[color:rgb(var(--border-primary-rgb)_/_calc(var(--border-primary-a)*0.55))] pt-3 sm:border-t-0 sm:pt-0 sm:pl-4 text-left sm:text-right">
                            <p className="font-mono text-base sm:text-sm text-slate-900 dark:text-neutral-100">{formatCurrency(payment.amountCents / 100)}</p>
                            <p className="text-xs text-slate-500 dark:text-neutral-400">{payment.formattedCreatedAt ?? '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={dashboardMutedPanelClass('text-sm text-slate-600 dark:text-neutral-300')}>
                      No transactions yet. Once payments land, they’ll roll in here with customer details.
                    </div>
                  )}
                </div>
              </div>

              <div className={dashboardMutedPanelClass('space-y-5') + ' relative overflow-hidden'}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_65%)] opacity-70 dark:bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.25),_transparent_60%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Financial summary</h3>
                    <p className="text-sm text-slate-500 dark:text-neutral-400">Rolling snapshot of performance across revenue streams.</p>
                  </div>
                  <span className={dashboardPillClass('text-emerald-600 dark:text-emerald-200')}>
                    <FontAwesomeIcon icon={faSackDollar} className="h-4 w-4" />
                    {formatCurrency(netRevenueCents / 100)}
                  </span>
                </div>
                <dl className="relative grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Gross revenue</dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">{formatCurrency(totalRevenueCents / 100)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Refunded</dt>
                    <dd className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-300">{formatCurrency(refundedCents / 100)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Conversion rate</dt>
                    <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-100">{conversionRate.toFixed(1)}%</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {showQuickActions ? (
            <div className="space-y-6">
              <div className={dashboardPanelClass('space-y-4')}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Quick actions</h3>
                  {isAdmin ? (
                    <Link
                      href="/admin/logs"
                      className="text-xs font-semibold uppercase tracking-wide text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300"
                    >
                      System logs
                    </Link>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                    <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5" />
                    Recommended next step
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700 dark:text-neutral-300">
                    {openTickets > 0
                      ? `Resolve support backlog (${formatNumber(openTickets)} open) to keep response times healthy.`
                      : paymentsToday > 0
                        ? `Review today's ${formatNumber(paymentsToday)} payments for anomalies and successful renewals.`
                        : 'No urgent issues detected — use this window to review plans, pricing, and announcement drafts.'}
                  </p>
                </div>
                <div className="space-y-3">
                  {quickLinks.map((action) => (
                    <a
                      key={action.href}
                      href={action.href}
                      className="group flex !flex-nowrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-neutral-800/70 dark:bg-neutral-900/70 dark:hover:border-indigo-500/40"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 transition group-hover:bg-indigo-500/20 group-hover:text-indigo-600 dark:text-indigo-300">
                          <FontAwesomeIcon icon={action.icon} className="h-4 w-4" />
                        </span>
                        <span className="block">
                          <span className="font-medium text-slate-900 dark:text-neutral-100">{action.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 transition group-hover:text-slate-600 dark:text-neutral-400 dark:group-hover:text-neutral-300">
                            {action.description}
                          </span>
                        </span>
                      </span>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-indigo-500" />
                    </a>
                  ))}
                </div>
              </div>

              {/* 'Stay on top of alerts' removed per request */}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

interface QuickLink {
  href: string;
  title: string;
  description: string;
  icon: IconDefinition;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
