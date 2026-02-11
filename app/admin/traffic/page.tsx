import { requireAdminSectionAccess } from '../../../lib/route-guards';
import TrafficAnalyticsDashboard from '../../../components/admin/TrafficAnalyticsDashboard';
import { DashboardPageHeader } from '../../../components/dashboard/DashboardPageHeader';
import { AdminStatCard, type AdminStatCardProps } from '../../../components/admin/AdminStatCard';
import { getAdminTrafficSnapshot, ADMIN_TRAFFIC_PERIODS, type AdminTrafficResponse } from '../../../lib/admin-traffic';
import { dashboardMutedPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRoad } from '@fortawesome/free-solid-svg-icons';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Traffic',
    description:
      'Monitor visits, page views, and engagement trends to quickly spot anomalies and opportunities using Google Analytics intelligence.',
    audience: 'admin',
  });
}

const numberFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const formatNumber = (value: number) => numberFormatter.format(value);
const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

const formatDuration = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0s';
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
};

export default async function TrafficPage() {
  await requireAdminSectionAccess('traffic');

  const traffic = await getAdminTrafficSnapshot({ period: '30d' });

  let visitsToday = 0;
  let visitsYesterday = 0;
  let pageViewsToday = 0;
  let pageViewsYesterday = 0;

  try {
    const todaySnapshot = await getAdminTrafficSnapshot({ period: '1d' });
    visitsToday = Number(todaySnapshot.totals?.visits ?? 0);
    pageViewsToday = Number(todaySnapshot.totals?.pageViews ?? 0);

    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yStr = yesterday.toISOString().slice(0, 10);
      const yesterdaySnapshot = await getAdminTrafficSnapshot({ period: 'custom', startDate: yStr, endDate: yStr });
      visitsYesterday = Number(yesterdaySnapshot.totals?.visits ?? 0);
      pageViewsYesterday = Number(yesterdaySnapshot.totals?.pageViews ?? 0);
    } catch {
      // ignore secondary GA failure
    }
  } catch {
    // GA unavailable — keep zeros
  }

  const heroStats = [
    {
      label: 'Visits today',
      value: formatNumber(visitsToday),
      helper: `vs ${formatNumber(visitsYesterday)} yesterday`,
      tone: 'indigo' as const
    },
    {
      label: 'Pageviews today',
      value: formatNumber(pageViewsToday),
      helper: `vs ${formatNumber(pageViewsYesterday)} yesterday`,
      tone: 'purple' as const
    }
  ];

  let engagementSnapshot: AdminTrafficResponse = traffic;
  try {
    engagementSnapshot = await getAdminTrafficSnapshot({ period: '7d' });
  } catch {
    // fallback to 30d snapshot if GA 7d request fails
  }

  // previous 7-day period snapshot for delta comparisons
  let prevEngagementSnapshot: AdminTrafficResponse | null = null;
  try {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = new Date();
    const prevStart = new Date(now.getTime() - 14 * DAY_MS);
    const prevEnd = new Date(now.getTime() - 8 * DAY_MS);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    const prevEndStr = prevEnd.toISOString().slice(0, 10);
    prevEngagementSnapshot = await getAdminTrafficSnapshot({ period: 'custom', startDate: prevStartStr, endDate: prevEndStr });
  } catch {
    // ignore - leave prevEngagementSnapshot null
  }

  const computeDelta = (current: number, previous: number | null) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  const metricCards: AdminStatCardProps[] = [
    {
      label: 'Total page views (30D)',
      value: formatNumber(traffic.totals.pageViews),
      helper: 'Screens and page views captured',
      accent: 'violet'
    },
    {
      label: 'New users (30D)',
      value: formatNumber(traffic.totals.newUsers),
      helper: `${formatPercent(traffic.derived.newUserShare)} of visits`,
      accent: 'emerald'
    },
    {
      label: 'Avg session duration (30D)',
      value: formatDuration(traffic.totals.averageSessionDurationSeconds),
      helper: 'Across all sessions',
      accent: 'indigo'
    },
    {
      label: 'Top country (30D)',
      value: traffic.breakdowns.countries[0]?.name ?? 'N/A',
      helper: traffic.breakdowns.countries[0]
        ? `${formatPercent(traffic.breakdowns.countries[0].share)} of visits`
        : 'No country data',
      accent: 'amber'
    }
  ];

  return (
    <div className="space-y-10">
      <DashboardPageHeader
        accent="indigo"
        eyebrow="Traffic intelligence"
        eyebrowIcon={<FontAwesomeIcon icon={faRoad} className="w-5 h-5" />}
        title="Traffic analytics hub"
        description="Spot today's biggest traffic swings, compare them with yesterday, and drill into engagement trends powered by Google Analytics."
        stats={heroStats}
      >
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metricCards.map((card) => (
          <AdminStatCard key={card.label} {...card} />
        ))}
      </section>

      <div
        className={dashboardMutedPanelClass(
          'text-sm text-slate-600 dark:text-neutral-300 flex flex-col gap-2 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between'
        )}
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">Engagement snapshot (7D)</p>
          <p className="text-sm text-slate-500 dark:text-neutral-400">Summary for the last 7 days vs the prior 7-day period</p>
          <p>
            {formatNumber(engagementSnapshot.totals.engagedSessions)} engaged sessions · {formatPercent(engagementSnapshot.derived.engagedSessionShare)} engaged share
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 dark:text-neutral-400">
          <div className="space-y-1">
            <div className="uppercase tracking-wide text-slate-500 dark:text-neutral-400 text-[10px]">Page views</div>
            <div className="flex items-baseline gap-2">
              <div className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(engagementSnapshot.totals.pageViews)}</div>
              {prevEngagementSnapshot ? (
                (() => {
                  const delta = computeDelta(engagementSnapshot.totals.pageViews, prevEngagementSnapshot?.totals.pageViews ?? null);
                  if (delta === null) return null;
                  const positive = delta > 0;
                  return (
                    <span className={positive ? 'text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs' : 'text-rose-700 bg-rose-50 rounded px-2 py-0.5 text-xs'}>
                      {positive ? '+' : ''}{percentFormatter.format(delta)}%
                    </span>
                  );
                })()
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <div className="uppercase tracking-wide text-slate-500 dark:text-neutral-400 text-[10px]">Visitors</div>
            <div className="flex items-baseline gap-2">
              <div className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(engagementSnapshot.totals.uniqueVisitors)}</div>
              {prevEngagementSnapshot ? (
                (() => {
                  const delta = computeDelta(engagementSnapshot.totals.uniqueVisitors, prevEngagementSnapshot?.totals.uniqueVisitors ?? null);
                  if (delta === null) return null;
                  const positive = delta > 0;
                  return (
                    <span className={positive ? 'text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs' : 'text-rose-700 bg-rose-50 rounded px-2 py-0.5 text-xs'}>
                      {positive ? '+' : ''}{percentFormatter.format(delta)}%
                    </span>
                  );
                })()
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <div className="uppercase tracking-wide text-slate-500 dark:text-neutral-400 text-[10px]">Engagement rate</div>
            <div className="flex items-baseline gap-2">
              <div className="font-semibold text-slate-900 dark:text-neutral-100">{formatPercent(engagementSnapshot.totals.engagementRate)}</div>
              {prevEngagementSnapshot ? (
                (() => {
                  const delta = computeDelta(engagementSnapshot.totals.engagementRate, prevEngagementSnapshot?.totals.engagementRate ?? null);
                  if (delta === null) return null;
                  const positive = delta > 0;
                  return (
                    <span className={positive ? 'text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs' : 'text-rose-700 bg-rose-50 rounded px-2 py-0.5 text-xs'}>
                      {positive ? '+' : ''}{percentFormatter.format(delta)}%
                    </span>
                  );
                })()
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <div className="uppercase tracking-wide text-slate-500 dark:text-neutral-400 text-[10px]">Avg. session</div>
            <div className="flex items-baseline gap-2">
              <div className="font-semibold text-slate-900 dark:text-neutral-100">{formatDuration(engagementSnapshot.totals.averageSessionDurationSeconds)}</div>
              {prevEngagementSnapshot ? (
                (() => {
                  const delta = computeDelta(engagementSnapshot.totals.averageSessionDurationSeconds, prevEngagementSnapshot?.totals.averageSessionDurationSeconds ?? null);
                  if (delta === null) return null;
                  const positive = delta > 0;
                  return (
                    <span className={positive ? 'text-emerald-700 bg-emerald-50 rounded px-2 py-0.5 text-xs' : 'text-rose-700 bg-rose-50 rounded px-2 py-0.5 text-xs'}>
                      {positive ? '+' : ''}{percentFormatter.format(delta)}%
                    </span>
                  );
                })()
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <TrafficAnalyticsDashboard
        initialData={traffic}
        periodOptions={ADMIN_TRAFFIC_PERIODS}
      />
    </div>
  );
}
