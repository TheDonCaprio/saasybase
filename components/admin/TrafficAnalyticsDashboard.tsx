'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import SimpleLineChart from './SimpleLineChart';
import { TrafficDrilldownModal, type TrafficDrilldownRow } from './TrafficDrilldownModal';
import { useFormatSettings } from '../FormatSettingsProvider';
import { formatDate } from '../../lib/formatDate';
import {
  ADMIN_TRAFFIC_PERIODS,
  getTrafficPeriodLabel,
  type AdminTrafficFilters,
  type AdminTrafficMetricKey,
  type AdminTrafficProviderMetricDescriptor,
  type AdminTrafficPeriod,
  type AdminTrafficPeriodOption,
  type AdminTrafficResponse
} from '../../lib/admin-traffic-contract';
import {
  dashboardDangerPanelClass,
  dashboardMutedPanelClass,
  dashboardPanelClass
} from '../dashboard/dashboardSurfaces';

const BREAKDOWN_PAGE_SIZE = 25;
const DEVICE_LABEL_MAP: Record<string, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
  tablet: 'Tablet'
};

type BreakdownGroup = 'countries' | 'pages' | 'devices' | 'referrers' | 'events';

type DashboardFilters = {
  period: AdminTrafficPeriod;
  country: string;
  page: string;
  deviceType: string;
  startDate: string;
  endDate: string;
};

interface ModalState {
  group: BreakdownGroup | null;
  loading: boolean;
  rows: TrafficDrilldownRow[];
  totalRows: number;
  totalMetricValue: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  error: string | null;
}

interface TrafficAnalyticsDashboardProps {
  initialData: AdminTrafficResponse;
  periodOptions?: AdminTrafficPeriodOption[];
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

const getDefaultCustomRange = () => {
  const today = new Date();
  const end = today.toISOString().split('T')[0];
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const startIso = start.toISOString().split('T')[0];
  return { start: startIso, end };
};

const toDashboardFilters = (filters: AdminTrafficFilters): DashboardFilters => ({
  period: filters.period,
  country: filters.country ?? '',
  page: filters.page ?? '',
  deviceType: filters.deviceType ?? '',
  startDate: filters.period === 'custom' ? filters.startDate ?? '' : '',
  endDate: filters.period === 'custom' ? filters.endDate ?? '' : ''
});

const isFiltersEqual = (a: DashboardFilters, b: DashboardFilters): boolean =>
  a.period === b.period &&
  a.country === b.country &&
  a.page === b.page &&
  a.deviceType === b.deviceType &&
  a.startDate === b.startDate &&
  a.endDate === b.endDate;

const formatDeviceLabel = (device: string): string => DEVICE_LABEL_MAP[device] ?? (device ? device.charAt(0).toUpperCase() + device.slice(1) : 'Unknown');

function getMetricDescriptor(data: AdminTrafficResponse, key: AdminTrafficMetricKey): AdminTrafficProviderMetricDescriptor | undefined {
  return data.provider.metrics.find((metric) => metric.key === key);
}

function resolveMetricDisplay(data: AdminTrafficResponse, key: AdminTrafficMetricKey): {
  key: AdminTrafficMetricKey;
  label: string;
  value: number;
  derived?: boolean;
} {
  const descriptor = getMetricDescriptor(data, key);
  if (descriptor?.supported) {
    return {
      key,
      label: descriptor.label,
      value: data.metricValues[key] ?? 0,
      derived: descriptor.derived,
    };
  }

  if (descriptor?.replaces) {
    const replacementDescriptor = getMetricDescriptor(data, descriptor.replaces);
    return {
      key: descriptor.replaces,
      label: replacementDescriptor?.label ?? descriptor.label,
      value: data.metricValues[descriptor.replaces] ?? 0,
      derived: replacementDescriptor?.derived,
    };
  }

  return {
    key,
    label: descriptor?.label ?? key,
    value: data.metricValues[key] ?? 0,
    derived: descriptor?.derived,
  };
}

export default function TrafficAnalyticsDashboard({
  initialData,
  periodOptions = ADMIN_TRAFFIC_PERIODS
}: TrafficAnalyticsDashboardProps) {
  const settings = useFormatSettings();
  const [data, setData] = useState<AdminTrafficResponse>(initialData);
  const [filters, setFilters] = useState<DashboardFilters>(() => toDashboardFilters(initialData.filters));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({
    group: null,
    loading: false,
    rows: [],
    totalRows: 0,
    totalMetricValue: 0,
    page: 1,
    pageSize: BREAKDOWN_PAGE_SIZE,
    hasMore: false,
    error: null
  });
  const fetchId = useRef(0);

  const rangeLabel = useMemo(() => {
    const start = formatDate(data.range.start, { mode: settings.mode, timezone: settings.timezone });
    const end = formatDate(data.range.end, { mode: settings.mode, timezone: settings.timezone });
    return start === end ? start : `${start} → ${end}`;
  }, [data.range.end, data.range.start, settings]);

  const periodMeta = useMemo(
    () =>
      periodOptions.find((option) => option.value === data.period) ?? {
        label: getTrafficPeriodLabel(data.period),
        value: data.period
      },
    [data.period, periodOptions]
  );

  const countryOptions = useMemo(() => data.filterOptions.countries, [data.filterOptions.countries]);
  const pageOptions = useMemo(() => data.filterOptions.pages, [data.filterOptions.pages]);
  const deviceOptions = useMemo(() => data.filterOptions.deviceTypes, [data.filterOptions.deviceTypes]);

  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (filters.country) {
      parts.push(`Country · ${filters.country}`);
    }
    if (filters.page) {
      parts.push(`Page · ${filters.page}`);
    }
    if (filters.deviceType) {
      parts.push(`Device · ${formatDeviceLabel(filters.deviceType)}`);
    }
    return parts;
  }, [filters.country, filters.deviceType, filters.page]);

  const visitsSeries = useMemo(() => data.charts.visits, [data.charts.visits]);
  const pageViewsSeries = useMemo(() => data.charts.pageViews, [data.charts.pageViews]);

  const runFetch = useCallback(
    async (targetFilters: DashboardFilters) => {
      const requestId = ++fetchId.current;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ period: targetFilters.period });
      if (targetFilters.country) {
        params.set('country', targetFilters.country);
      }
      if (targetFilters.page) {
        params.set('page', targetFilters.page);
      }
      if (targetFilters.deviceType) {
        params.set('deviceType', targetFilters.deviceType);
      }
      if (targetFilters.period === 'custom') {
        if (!targetFilters.startDate || !targetFilters.endDate) {
          setCustomRangeError('Select both a start date and an end date');
          setLoading(false);
          return;
        }
        if (targetFilters.startDate > targetFilters.endDate) {
          setCustomRangeError('Start date must be before end date');
          setLoading(false);
          return;
        }
        setCustomRangeError(null);
        params.set('startDate', targetFilters.startDate);
        params.set('endDate', targetFilters.endDate);
      } else {
        setCustomRangeError(null);
      }

      try {
        const response = await fetch(`/api/admin/traffic?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          const message = payload?.error ?? `Request failed with status ${response.status}`;
          throw new Error(message);
        }

        const payload = (await response.json()) as AdminTrafficResponse;
        if (fetchId.current === requestId) {
          setData(payload);
          const normalized = toDashboardFilters(payload.filters);
          setFilters((prev) => (isFiltersEqual(prev, normalized) ? prev : normalized));
        }
      } catch (err: unknown) {
        if (fetchId.current === requestId) {
          const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load traffic analytics';
          setError(message);
        }
      } finally {
        if (fetchId.current === requestId) {
          setLoading(false);
        }
      }
    },
    []
  );

  const handlePeriodChange = (value: AdminTrafficPeriod) => {
    if (value === filters.period && value !== 'custom') {
      return;
    }
    const defaults = value === 'custom' ? getDefaultCustomRange() : null;
    const next: DashboardFilters = {
      ...filters,
      period: value,
      startDate: value === 'custom' ? filters.startDate || defaults?.start || '' : '',
      endDate: value === 'custom' ? filters.endDate || defaults?.end || '' : ''
    };
    setFilters(next);
    void runFetch(next);
  };

  const handleSelectFilterChange = (key: 'country' | 'page' | 'deviceType', value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    void runFetch(next);
  };

  const handleCustomDateChange = (key: 'startDate' | 'endDate', value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (!next.startDate || !next.endDate) {
      setCustomRangeError('Select both a start date and an end date');
      return;
    }
    if (next.startDate > next.endDate) {
      setCustomRangeError('Start date must be before end date');
      return;
    }
    setCustomRangeError(null);
    void runFetch(next);
  };

  const clearFilters = () => {
    const base: DashboardFilters = {
      period: '30d',
      country: '',
      page: '',
      deviceType: '',
      startDate: '',
      endDate: ''
    };
    setFilters(base);
    setCustomRangeError(null);
    void runFetch(base);
  };

  const handleRetry = () => {
    void runFetch(filters);
  };

  const openModal = (group: BreakdownGroup) => {
    setModalState({
      group,
      loading: true,
      rows: [],
      totalRows: 0,
      totalMetricValue: 0,
      page: 1,
      pageSize: BREAKDOWN_PAGE_SIZE,
      hasMore: false,
      error: null
    });
  };

  const closeModal = () => {
    setModalState({
      group: null,
      loading: false,
      rows: [],
      totalRows: 0,
      totalMetricValue: 0,
      page: 1,
      pageSize: BREAKDOWN_PAGE_SIZE,
      hasMore: false,
      error: null
    });
  };

  const loadModalData = useCallback(
    async (group: BreakdownGroup, targetPage: number, pageSize = BREAKDOWN_PAGE_SIZE) => {
      const safePage = Math.max(1, targetPage);
      const safePageSize = Math.min(100, Math.max(1, pageSize));

      setModalState((prev) => {
        if (prev.group !== group) {
          return prev;
        }
        return {
          ...prev,
          loading: true,
          error: null,
          page: safePage,
          pageSize: safePageSize
        };
      });

      try {
        const params = new URLSearchParams({
          period: filters.period,
          group,
          pageNumber: String(safePage),
          pageSize: String(safePageSize)
        });

        if (filters.country) {
          params.set('country', filters.country);
        }
        if (filters.page) {
          params.set('page', filters.page);
        }
        if (filters.deviceType) {
          params.set('deviceType', filters.deviceType);
        }
        if (filters.period === 'custom' && filters.startDate && filters.endDate) {
          params.set('startDate', filters.startDate);
          params.set('endDate', filters.endDate);
        }

        const response = await fetch(`/api/admin/traffic?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          const message = payload?.error ?? `Failed to load ${group} breakdown`;
          throw new Error(message);
        }

        const result = (await response.json()) as {
          rows: TrafficDrilldownRow[];
          totalRows: number;
          totalMetricValue: number;
          page: number;
          pageSize: number;
          hasMore: boolean;
        };

        setModalState((prev) => {
          if (prev.group !== group) {
            return prev;
          }
          return {
            ...prev,
            loading: false,
            error: null,
            rows: Array.isArray(result.rows) ? result.rows : [],
            totalRows: Number.isFinite(result.totalRows) ? result.totalRows : 0,
            totalMetricValue: Number.isFinite(result.totalMetricValue) ? result.totalMetricValue : 0,
            page: result.page ?? safePage,
            pageSize: result.pageSize ?? safePageSize,
            hasMore: Boolean(result.hasMore)
          };
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load breakdown data';
        setModalState((prev) => {
          if (prev.group !== group) {
            return prev;
          }
          return {
            ...prev,
            loading: false,
            error: message,
            rows: [],
            totalRows: 0,
            totalMetricValue: 0,
            hasMore: false
          };
        });
      }
    },
    [filters]
  );

  useEffect(() => {
    if (!modalState.group) {
      return;
    }
    void loadModalData(modalState.group, modalState.page, modalState.pageSize);
  }, [loadModalData, modalState.group, modalState.page, modalState.pageSize]);

  const handleModalPageChange = (targetPage: number) => {
    if (!modalState.group || targetPage === modalState.page) {
      return;
    }
    void loadModalData(modalState.group, targetPage, modalState.pageSize);
  };

  const customOption = periodOptions.find((option) => option.value === 'custom');
  const quickPeriodOptions = periodOptions.filter((option) => option.value !== 'custom');

  const trendTitle = useMemo(() => {
    const granularity = data.charts.granularity;
    if (granularity === 'monthly') {
      return 'Monthly visits';
    }
    if (granularity === 'yearly') {
      return 'Yearly visits';
    }
    return 'Daily visits';
  }, [data.charts.granularity]);

  const insightStats = useMemo(
    () => {
      const replacementForNewUsers = resolveMetricDisplay(data, 'newUsers');
      const replacementForEngagement = resolveMetricDisplay(data, 'engagementRate');
      const replacementForEngagedSessions = resolveMetricDisplay(data, 'engagedSessions');

      return [
        {
          label: 'Unique visitor share',
          value: formatPercent(data.derived.uniqueVisitorShare)
        },
        replacementForNewUsers.key === 'bounceRate'
          ? {
              label: replacementForNewUsers.label,
              value: formatPercent(replacementForNewUsers.value)
            }
          : {
              label: 'New user share',
              value: formatPercent(data.derived.newUserShare)
            },
        replacementForEngagement.key === 'estimatedEngagedVisitRate'
          ? {
              label: replacementForEngagement.label,
              value: formatPercent(replacementForEngagement.value)
            }
          : {
              label: 'Engaged session share',
              value: formatPercent(data.derived.engagedSessionShare)
            },
        {
          label: resolveMetricDisplay(data, 'averageSessionDurationSeconds').label,
          value: formatDuration(data.totals.averageSessionDurationSeconds)
        },
        replacementForNewUsers.key === 'viewsPerVisit'
          ? {
              label: replacementForNewUsers.label,
              value: replacementForNewUsers.value.toFixed(2)
            }
          : {
              label: 'Page views',
              value: formatNumber(data.totals.pageViews)
            },
        {
          label: 'Visits',
          value: formatNumber(data.totals.visits)
        },
        {
          label: 'Unique visitors',
          value: formatNumber(data.totals.uniqueVisitors)
        },
        replacementForEngagedSessions.key === 'estimatedEngagedVisits'
          ? {
              label: replacementForEngagedSessions.label,
              value: formatNumber(replacementForEngagedSessions.value)
            }
          : {
              label: 'Engaged sessions',
              value: formatNumber(data.totals.engagedSessions)
            }
      ];
    },
    [
      data.derived.engagedSessionShare,
      data.derived.newUserShare,
      data.derived.uniqueVisitorShare,
      data.metricValues,
      data.provider.metrics,
      data.totals.averageSessionDurationSeconds,
      data.totals.pageViews,
      data.totals.visits,
      data.totals.uniqueVisitors,
      data.totals.engagedSessions
    ]
  );

  const graphFormatter = useMemo(() => new Intl.NumberFormat('en-US'), []);

  return (
    <div className="space-y-8">
      <div className={dashboardPanelClass('space-y-6 p-4 sm:p-6')}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="space-y-1">

              <p className="text-sm text-slate-600 dark:text-neutral-300">{rangeLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePeriodChange(option.value)}
                className={clsx(
                  'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900',
                  filters.period === option.value
                    ? 'bg-indigo-600 text-white shadow-sm focus-visible:ring-indigo-400'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-900/70'
                )}
              >
                {option.label}
              </button>
            ))}
            {customOption ? (
              <button
                type="button"
                onClick={() => handlePeriodChange(customOption.value)}
                className={clsx(
                  'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900',
                  filters.period === 'custom'
                    ? 'bg-indigo-600 text-white shadow-sm focus-visible:ring-indigo-400'
                    : 'border border-dashed border-slate-300 bg-white text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-300 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-900/70'
                )}
              >
                {customOption.label}
              </button>
            ) : null}
          </div>
        </div>
        {filters.period === 'custom' ? (
          <div className="grid gap-4 sm:grid-cols-[repeat(2,minmax(0,200px))]">
            <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-neutral-400">
              <span className="font-semibold text-slate-700 dark:text-neutral-200">Start date</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) => handleCustomDateChange('startDate', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-neutral-400">
              <span className="font-semibold text-slate-700 dark:text-neutral-200">End date</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) => handleCustomDateChange('endDate', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-neutral-400">
            <span className="font-semibold text-slate-700 dark:text-neutral-200">Country</span>
            <select
              value={filters.country}
              onChange={(event) => handleSelectFilterChange('country', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="">All countries</option>
              {countryOptions.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-neutral-400">
            <span className="font-semibold text-slate-700 dark:text-neutral-200">Page</span>
            <select
              value={filters.page}
              onChange={(event) => handleSelectFilterChange('page', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="">All pages</option>
              {pageOptions.map((page) => (
                <option key={page} value={page}>
                  {page}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 dark:text-neutral-400">
            <span className="font-semibold text-slate-700 dark:text-neutral-200">Device</span>
            <select
              value={filters.deviceType}
              onChange={(event) => handleSelectFilterChange('deviceType', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="">All devices</option>
              {deviceOptions.map((device) => (
                <option key={device} value={device}>
                  {formatDeviceLabel(device)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(filters.country || filters.page || filters.deviceType || filters.period === 'custom') ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-neutral-400">
            <div className="flex flex-wrap gap-3">
              {summaryParts.map((part) => (
                <span key={part} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-neutral-800/70 dark:text-neutral-200">
                  {part}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              Clear filters
            </button>
          </div>
        ) : null}
        {customRangeError ? (
          <div className={dashboardDangerPanelClass('rounded-2xl border border-rose-200/70 bg-rose-50/80 p-3 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200')}>
            {customRangeError}
          </div>
        ) : null}
        {loading ? (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">Refreshing…</span>
        ) : null}
        {error ? (
          <div
            className={dashboardDangerPanelClass(
              'flex flex-col gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/80 p-4 text-sm dark:border-rose-500/40 dark:bg-rose-500/10 sm:flex-row sm:items-center sm:justify-between'
            )}
          >
            <span className="font-medium text-rose-700 dark:text-rose-200">{error}</span>
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

      <div className={dashboardPanelClass('space-y-6 p-4 sm:p-6')}>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Engagement insights</h3>
        <div className="grid gap-4 sm:grid-cols-2 min-[834px]:grid-cols-4">
          {insightStats.map((stat) => (
            <div
              key={stat.label}
              className={dashboardMutedPanelClass(
                'rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900/40'
              )}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">{stat.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-neutral-50">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={dashboardPanelClass('space-y-6 p-4 sm:p-6')}>
        <SimpleLineChart
          data={visitsSeries}
          stackedData={pageViewsSeries}
          stackedColor="#10b981"
          stackedLabel="Page views"
          title={`${trendTitle} (${periodMeta.label.toLowerCase()})`}
          color="#3b82f6"
          formatValue={(value) => graphFormatter.format(value)}
          formatStackedValue={(value) => graphFormatter.format(value)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6 xl:col-span-2')}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Top countries</h3>
            {data.breakdowns.countries.length > 0 ? (
              <button
                type="button"
                onClick={() => openModal('countries')}
                className="inline-flex items-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                View details
              </button>
            ) : null}
          </div>
          {data.breakdowns.countries.length > 0 ? (
            <div className="space-y-3">
              {data.breakdowns.countries.slice(0, 10).map((country, index) => (
                <div key={`${country.name}-${index}`} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-neutral-200">
                    <span className="w-5 text-xs text-slate-400 dark:text-neutral-500">{index + 1}.</span>
                    <span>{country.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(country.visits)}</p>
                    <p className="text-xs text-slate-500 dark:text-neutral-400">{formatPercent(country.share)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-400">No country data available</p>
          )}
        </div>
        <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Device mix</h3>
            {data.breakdowns.devices.length > 0 ? (
              <button
                type="button"
                onClick={() => openModal('devices')}
                className="inline-flex items-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                View details
              </button>
            ) : null}
          </div>
          {data.breakdowns.devices.length > 0 ? (
            <div className="space-y-3">
              {data.breakdowns.devices.slice(0, 6).map((device) => (
                <div key={device.type} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-neutral-200">{device.type}</span>
                  <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatPercent(device.share)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-400">No device data available</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Top pages</h3>
            {data.breakdowns.pages.length > 0 ? (
              <button
                type="button"
                onClick={() => openModal('pages')}
                className="inline-flex items-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                View details
              </button>
            ) : null}
          </div>
          {data.breakdowns.pages.length > 0 ? (
            <div className="space-y-3">
              {/* mobile/table header */}
              <div className="hidden grid-cols-[1fr_auto] gap-3 text-xs text-slate-500 dark:text-neutral-400 sm:hidden" />
              <div className="grid grid-cols-[1fr_auto] gap-3 text-xs text-slate-500 dark:text-neutral-400 sm:hidden">
                <div className="font-medium">Page</div>
                <div className="font-medium text-right">Views · Share</div>
              </div>
              {data.breakdowns.pages.slice(0, 10).map((page) => (
                <div
                  key={page.path}
                  className="grid w-full min-w-0 grid-cols-[1fr_auto] items-center gap-3 text-sm sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 break-words whitespace-normal text-slate-700 dark:text-neutral-200" title={page.path}>
                    {page.path}
                  </span>
                  <span className="flex flex-row items-baseline gap-2 text-left sm:flex-col sm:items-end sm:text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(page.views)}</span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">{formatPercent(page.share)}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-400">No page data available</p>
          )}
        </div>
        <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Top referrers</h3>
            {data.breakdowns.referrers.length > 0 ? (
              <button
                type="button"
                onClick={() => openModal('referrers')}
                className="inline-flex items-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                View details
              </button>
            ) : null}
          </div>
          {data.breakdowns.referrers.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-3 text-xs text-slate-500 dark:text-neutral-400 sm:hidden">
                <div className="font-medium">Referrer</div>
                <div className="font-medium text-right">Sessions · Share</div>
              </div>
              {data.breakdowns.referrers.slice(0, 10).map((referrer, index) => (
                <div
                  key={`${referrer.label}-${index}`}
                  className="grid w-full min-w-0 grid-cols-[1fr_auto] items-center gap-3 text-sm sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 break-words whitespace-normal text-slate-700 dark:text-neutral-200" title={referrer.label}>
                    {referrer.label}
                  </span>
                  <span className="flex flex-row items-baseline gap-2 text-left sm:flex-col sm:items-end sm:text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(referrer.sessions)}</span>
                    <span className="text-xs text-slate-500 dark:text-neutral-400">{formatPercent(referrer.share)}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-neutral-400">No referrer data available</p>
          )}
        </div>
      </div>

      <div className={dashboardPanelClass('space-y-4 p-4 sm:p-6')}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-50">Top events</h3>
          {data.breakdowns.events.length > 0 ? (
            <button
              type="button"
              onClick={() => openModal('events')}
              className="inline-flex items-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              View details
            </button>
          ) : null}
        </div>
        {data.breakdowns.events.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3 text-xs text-slate-500 dark:text-neutral-400 sm:hidden">
              <div className="font-medium">Event</div>
              <div className="font-medium text-right">Count</div>
            </div>
            {data.breakdowns.events.slice(0, 10).map((event, index) => (
              <div
                key={`${event.name}-${index}`}
                className="grid w-full min-w-0 grid-cols-[1fr_auto] items-center gap-3 text-sm sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 break-words whitespace-normal text-slate-700 dark:text-neutral-200" title={event.name}>
                  {event.name}
                </span>
                <span className="flex-shrink-0 whitespace-nowrap font-semibold text-slate-900 dark:text-neutral-100">{formatNumber(event.count)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-neutral-400">No event data available</p>
        )}
      </div>

      <div className={dashboardPanelClass('flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between')}>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Need raw analytics?</h3>
          <p className="text-sm text-slate-600 dark:text-neutral-300">
            Jump into the dedicated traffic workspace for deeper segmentation, funnel exploration, and custom dashboards powered by {data.provider.label}.
          </p>
        </div>
        {data.provider.externalDashboardUrl ? (
          <a
            href={data.provider.externalDashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Open {data.provider.label} workspace
          </a>
        ) : null}
      </div>

      {modalState.group ? (
        <TrafficDrilldownModal
          isOpen
          onClose={closeModal}
          title={
            modalState.group === 'countries'
              ? 'Top countries'
              : modalState.group === 'pages'
              ? 'Top pages'
              : modalState.group === 'devices'
              ? 'Device types'
              : modalState.group === 'referrers'
              ? 'Top referrers'
              : 'Top events'
          }
          subtitle={summaryParts.length > 0 ? summaryParts.join(' • ') : undefined}
          rows={modalState.rows}
          totalRows={modalState.totalRows}
          totalMetricValue={modalState.totalMetricValue}
          page={modalState.page}
          pageSize={modalState.pageSize}
          hasMore={modalState.hasMore}
          loading={modalState.loading}
          error={modalState.error}
          onPageChange={handleModalPageChange}
        />
      ) : null}
    </div>
  );
}
