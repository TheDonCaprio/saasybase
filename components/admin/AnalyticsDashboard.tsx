'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import SimpleLineChart from './SimpleLineChart';
import SimpleBarChart from './SimpleBarChart';
import { formatDate } from '../../lib/formatDate';
import { formatCurrency as formatCurrencyUtil } from '../../lib/utils/currency';
import { useFormatSettings } from '../FormatSettingsProvider';
import {
  ADMIN_ANALYTICS_PERIODS,
  type AdminAnalyticsPeriod,
  type AdminAnalyticsPeriodOption,
  type AdminAnalyticsResponse
} from '../../lib/admin-analytics-shared';
import {
  dashboardDangerPanelClass,
  dashboardMutedPanelClass,
  dashboardPanelClass
} from '../dashboard/dashboardSurfaces';

interface AnalyticsDashboardProps {
  initialData: AdminAnalyticsResponse;
  initialPeriod: AdminAnalyticsPeriod;
  periodOptions?: AdminAnalyticsPeriodOption[];
  currency: string;
}

const statTileClass =
  'rounded-2xl border border-slate-200 bg-white/80 p-4 sm:p-5 shadow-sm transition dark:border-neutral-800 dark:bg-neutral-900/60';

const smallBadgeClass =
  'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200';

function formatGrowth(formatter: Intl.NumberFormat, value: number): string {
  const abs = Math.abs(value);
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${formatter.format(abs)}%`;
}

function formatPercent(formatter: Intl.NumberFormat, value: number): string {
  return `${formatter.format(value)}%`;
}

export default function AnalyticsDashboard({
  initialData,
  initialPeriod,
  periodOptions = ADMIN_ANALYTICS_PERIODS,
  currency
}: AnalyticsDashboardProps) {
  const settings = useFormatSettings();
  const [data, setData] = useState<AdminAnalyticsResponse>(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<AdminAnalyticsPeriod>(initialPeriod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchId = useRef(0);

  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
    []
  );

  // Format dollar values using the centralized currency utility
  const formatCurrency = useCallback((dollars: number) => formatCurrencyUtil(Math.round(dollars * 100), currency), [currency]);
  const formatNumber = useCallback((value: number) => numberFormatter.format(value), [numberFormatter]);
  const formatPercentValue = useCallback((value: number) => formatPercent(percentFormatter, value), [percentFormatter]);
  const formatGrowthValue = useCallback((value: number) => formatGrowth(percentFormatter, value), [percentFormatter]);

  const rangeLabel = useMemo(() => {
    const start = formatDate(data.startDate, { mode: settings.mode, timezone: settings.timezone });
    const end = formatDate(data.endDate, { mode: settings.mode, timezone: settings.timezone });
    return start === end ? start : `${start} → ${end}`;
  }, [data.startDate, data.endDate, settings]);

  const revenueSeries = useMemo(
    () =>
      [...(data.charts.revenue ?? [])]
        .reverse()
        .map((entry) => ({ date: entry.date, value: entry.revenue ?? (entry as { value?: number }).value ?? 0 })),
    [data.charts.revenue]
  );
  const subscriptionSeries = useMemo(
    () =>
      [...(data.charts.subscriptions ?? [])]
        .reverse()
        .map((entry) => ({
          date: entry.date,
          value: entry.subscriptions ?? (entry as { value?: number }).value ?? 0
        })),
    [data.charts.subscriptions]
  );
  const registrationChartSource = useMemo(
    () => (data.charts.users && data.charts.users.length > 0 ? data.charts.users : data.users.growthData),
    [data.charts.users, data.users.growthData]
  );
  const recentRegistrationSeries = useMemo(
    () =>
      [...registrationChartSource]
        .slice(0, 10)
        .reverse()
        .map((entry) => {
          const value =
            (entry as { users?: number; value?: number }).users ?? (entry as { value?: number }).value ?? 0;
          return { date: entry.date, value };
        }),
    [registrationChartSource]
  );
  // visits data will be fetched from the traffic API to mirror /admin/traffic
  const [visitsCountries, setVisitsCountries] = useState<
    Array<{ label: string; value: number; helper?: string }>
  >([]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ period: data.period });

    (async () => {
      try {
        const res = await fetch(`/api/admin/traffic?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!res.ok) return;
        const payload = (await res.json()) as unknown as {
          breakdowns?: { countries?: Array<{ name?: string; visits?: number; share?: number }> };
        };
        const rows = (payload.breakdowns?.countries ?? [])
          .filter((c) => (c.visits ?? 0) > 0)
          .slice(0, 5)
          .map((c) => ({
            label: String(c.name ?? 'Other'),
            value: Number(c.visits ?? 0),
            helper: formatPercentValue(Number(c.share ?? 0))
          }));
        if (mounted) setVisitsCountries(rows);
      } catch {
        // ignore fetch errors for this non-critical widget
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [data.period, formatPercentValue]);

  const freeUsers = useMemo(
    () => Math.max(data.users.total - data.users.active, 0),
    [data.users.total, data.users.active]
  );
  const payingShare = useMemo(
    () => (data.users.total > 0 ? (data.users.active / data.users.total) * 100 : 0),
    [data.users.total, data.users.active]
  );
  const arpu = useMemo(
    () => (data.users.total > 0 ? data.revenue.total / data.users.total : 0),
    [data.revenue.total, data.users.total]
  );
  const arppu = useMemo(
    () => (data.users.active > 0 ? data.revenue.total / data.users.active : 0),
    [data.revenue.total, data.users.active]
  );

  const topPlans = useMemo(() => data.plans.slice(0, 6), [data.plans]);

  const allTimeStats = useMemo(
    () => [
      { label: 'Total revenue', value: formatCurrency(data.revenue.total) },
      { label: 'Paying users', value: formatNumber(data.users.active) },
      { label: 'Total users', value: formatNumber(data.users.total) },
      { label: 'Total subscriptions', value: formatNumber(data.subscriptions.total) }
    ],
    [
      data.revenue.total,
      data.users.active,
      data.users.total,
      data.subscriptions.total,
      formatCurrency,
      formatNumber
    ]
  );

  const momentumStats = useMemo(
    () => [
      {
        label: 'Revenue (period)',
        value: formatCurrency(data.revenue.currentPeriod),
        helper: `${formatGrowthValue(data.revenue.growth)} vs previous`
      },
      { label: 'Daily average', value: formatCurrency(data.revenue.daily) },
      {
        label: 'New subscriptions',
        value: formatNumber(data.subscriptions.currentPeriod),
        helper: `${formatGrowthValue(data.subscriptions.growth)} vs previous`
      },
      {
        label: 'New users',
        value: formatNumber(data.users.currentPeriod),
        helper: `${formatGrowthValue(data.users.growth)} vs previous`
      }
    ],
    [
      data.revenue.currentPeriod,
      data.revenue.growth,
      data.revenue.daily,
      data.subscriptions.currentPeriod,
      data.subscriptions.growth,
      data.users.currentPeriod,
      data.users.growth,
      formatCurrency,
      formatNumber,
      formatGrowthValue
    ]
  );

  const healthStats = useMemo(
    () => [
      { label: 'Conversion rate', value: formatPercentValue(data.subscriptions.conversionRate) },
      { label: 'Churn rate', value: formatPercentValue(data.subscriptions.churnRate) },
      { label: 'Paying share', value: formatPercentValue(payingShare) },
      { label: 'Free users', value: formatNumber(freeUsers) }
    ],
    [
      data.subscriptions.conversionRate,
      data.subscriptions.churnRate,
      formatPercentValue,
      payingShare,
      formatNumber,
      freeUsers
    ]
  );

  const subscriptionBreakdown = useMemo(() => {
    const totalFromStats = data.subscriptions.total;
    const fallbackTotal = data.subscriptions.active + data.subscriptions.pending + data.subscriptions.canceled;
    const denominator = totalFromStats > 0 ? totalFromStats : fallbackTotal > 0 ? fallbackTotal : 1;
    return [
      {
        key: 'active',
        label: 'Active subscriptions',
        value: data.subscriptions.active,
        percentage: (data.subscriptions.active / denominator) * 100,
        gradient: 'from-emerald-500 to-emerald-600'
      },
      {
        key: 'pending',
        label: 'Pending',
        value: data.subscriptions.pending,
        percentage: (data.subscriptions.pending / denominator) * 100,
        gradient: 'from-amber-500 to-amber-600'
      },
      {
        key: 'canceled',
        label: 'Canceled',
        value: data.subscriptions.canceled,
        percentage: (data.subscriptions.canceled / denominator) * 100,
        gradient: 'from-rose-500 to-rose-600'
      }
    ];
  }, [data.subscriptions.active, data.subscriptions.canceled, data.subscriptions.pending, data.subscriptions.total]);

  const userComposition = useMemo(() => {
    const total = data.users.total > 0 ? data.users.total : freeUsers + data.users.active;
    const denominator = total > 0 ? total : 1;
    return [
      {
        key: 'paying',
        label: 'Paying users',
        value: data.users.active,
        percentage: (data.users.active / denominator) * 100,
        gradient: 'from-emerald-500 to-emerald-600'
      },
      {
        key: 'free',
        label: 'Free users',
        value: freeUsers,
        percentage: (freeUsers / denominator) * 100,
        gradient: 'from-indigo-500 to-indigo-600'
      }
    ];
  }, [data.users.active, data.users.total, freeUsers]);

  const runFetch = async (period: AdminAnalyticsPeriod, options: { force?: boolean } = {}) => {
    if (!options.force && period === selectedPeriod && fetchId.current !== 0) {
      return;
    }
    const requestId = ++fetchId.current;
    if (period !== selectedPeriod) {
      setSelectedPeriod(period);
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?period=${encodeURIComponent(period)}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const json = (await res.json()) as AdminAnalyticsResponse;
      if (fetchId.current === requestId) {
        setData(json);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to fetch analytics';
      if (fetchId.current === requestId) {
        setError(message);
      }
    } finally {
      if (fetchId.current === requestId) {
        setLoading(false);
      }
    }
  };

  const handlePeriodChange = (value: AdminAnalyticsPeriod) => {
    void runFetch(value);
  };

  const handleRetry = () => {
    void runFetch(selectedPeriod, { force: true });
  };

  return (
    <div className="space-y-8">
      <div className={dashboardPanelClass('space-y-5 p-3 sm:p-4')}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">

            <div className="space-y-1">

              <p className="text-sm text-slate-600 dark:text-neutral-300">{rangeLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePeriodChange(option.value)}
                disabled={loading && option.value === selectedPeriod}
                className={clsx(
                  'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900',
                  selectedPeriod === option.value
                    ? 'bg-indigo-600 text-white shadow-sm focus-visible:ring-indigo-400'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-900/70'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">Refreshing…</span>
        ) : null}
        {error ? (
          <div
            className={dashboardDangerPanelClass(
              'flex flex-col gap-3 rounded-2xl border border-rose-200/60 bg-rose-50/80 p-4 text-sm dark:border-rose-500/40 dark:bg-rose-500/10 sm:flex-row sm:items-center sm:justify-between'
            )}
          >
            <span className="font-medium text-rose-700 dark:text-rose-200">
              Failed to refresh analytics: {error}
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-400/60 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-500/10"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">This period highlights</h3>
          <span className={smallBadgeClass}>Prev window comparison</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 min-[834px]:grid-cols-4">
          {momentumStats.map((stat) => (
            <div key={stat.label} className={statTileClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-neutral-50">{stat.value}</p>
              {stat.helper ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">{stat.helper}</p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 min-[834px]:grid-cols-4">
          {healthStats.map((stat) => (
            <div
              key={stat.label}
              className={dashboardMutedPanelClass(
                'rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900/40'
              )}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-neutral-50">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
          <SimpleLineChart
            data={revenueSeries}
            title="Revenue trend"
            color="#10b981"
            formatValue={(value) => formatCurrency(value)}
          />
        </div>
        <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
          <SimpleLineChart
            data={subscriptionSeries}
            title="Subscriptions trend"
            color="#3b82f6"
            formatValue={(value) => formatNumber(value)}
          />
        </div>
      </div>

      <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <SimpleLineChart
            data={recentRegistrationSeries}
            title="Recent registrations"
            color="#8b5cf6"
            formatValue={(value) => formatNumber(value)}
          />
          <SimpleBarChart
            data={visitsCountries}
            title="Visits"
            color="#6366f1"
            formatValue={(value: number) => formatNumber(value)}
            emptyMessage="No traffic data recorded."
          />
        </div>
      </div>

      <div className={dashboardPanelClass('space-y-6 p-4 sm:p-6')}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Plan performance</h3>
          <span className={smallBadgeClass}>Top {topPlans.length}</span>
        </div>
        {topPlans.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            No plan data available for the selected period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-neutral-800">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left">Plan</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Revenue</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Users</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                {topPlans.map((plan) => (
                  <tr key={plan.id} className="bg-white/70 transition hover:bg-slate-50 dark:bg-neutral-900/40 dark:hover:bg-neutral-900/70">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium text-slate-900 dark:text-neutral-50">{plan.name}</span>
                        <div className="hidden w-40 sm:flex sm:flex-col">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                              style={{ width: `${Math.min(plan.percentage, 100).toFixed(1)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-300">
                      {formatCurrency(plan.revenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-700 dark:text-neutral-200">
                      {formatNumber(plan.users)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-medium text-slate-500 dark:text-neutral-300">
                      {formatPercentValue(plan.percentage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Customer & subscription mix</h3>
          <span className={smallBadgeClass}>Live snapshot</span>
        </div>
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-neutral-200">Subscription statuses</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-neutral-800">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 text-left">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Count</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                  {subscriptionBreakdown.map((item) => (
                    <tr key={item.key} className="bg-white/70 transition hover:bg-slate-50 dark:bg-neutral-900/40 dark:hover:bg-neutral-900/70">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900 dark:text-neutral-50">{item.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-neutral-200">
                        {formatNumber(item.value)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-medium text-slate-500 dark:text-neutral-300">
                        {formatPercentValue(item.percentage)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-neutral-200">User composition</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-neutral-800">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-neutral-400">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 text-left">Segment</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Users</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
                  {userComposition.map((item) => (
                    <tr key={item.key} className="bg-white/70 transition hover:bg-slate-50 dark:bg-neutral-900/40 dark:hover:bg-neutral-900/70">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900 dark:text-neutral-50">{item.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-neutral-200">
                        {formatNumber(item.value)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-medium text-slate-500 dark:text-neutral-300">
                        {formatPercentValue(item.percentage)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Avg revenue / user</p>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{formatCurrency(arpu)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/40">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Avg revenue / paying user</p>
                <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-50">{formatCurrency(arppu)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={dashboardPanelClass('space-y-6 p-3 sm:p-4')}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">All-time performance</h3>
          <span className={smallBadgeClass}>Lifetime</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 min-[834px]:grid-cols-4">
          {allTimeStats.map((stat) => (
            <div key={stat.label} className={statTileClass}>
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-neutral-50">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
