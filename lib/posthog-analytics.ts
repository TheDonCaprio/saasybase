import { Logger } from './logger';
import { toError } from './runtime-guards';
import type {
  AdminTrafficBreakdownGroup,
  AdminTrafficProviderMeta,
} from './admin-traffic-contract';
import type {
  BreakdownGroup,
  TrafficBreakdownResult,
  TrafficFilters,
  TimeseriesGranularity,
} from './google-analytics';

type PostHogQueryResponse = {
  results?: unknown[];
  columns?: string[];
  query_status?: {
    results?: unknown[];
    columns?: string[];
    complete?: boolean;
    error?: boolean;
    error_message?: string | null;
  };
};

type QueryRow = Record<string, unknown>;

export interface PostHogTrafficSnapshot {
  totalVisits: number;
  uniqueVisitors: number;
  newUsers: number;
  engagedSessions: number;
  totalPageViews: number;
  averageSessionDurationSeconds: number;
  engagementRate: number;
  bounceRate: number;
  viewsPerVisit: number;
  estimatedEngagedVisits: number;
  estimatedEngagedVisitRate: number;
  topCountries: Array<{ country: string; count: number; percentage: number }>;
  topPages: Array<{ page: string; count: number; percentage: number }>;
  deviceTypes: Array<{ type: string; count: number; percentage: number }>;
  dailyVisits: Array<{ date: string; visits: number; pageViews: number }>;
  topReferrers: Array<{ referrer: string; count: number; percentage: number }>;
  topEvents: Array<{ event: string; count: number }>;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
  timeseriesGranularity: TimeseriesGranularity;
  provider: AdminTrafficProviderMeta;
}

export const POSTHOG_PROVIDER: AdminTrafficProviderMeta = {
  key: 'posthog',
  label: 'PostHog',
  externalDashboardUrl: process.env.POSTHOG_APP_HOST?.trim() || 'https://us.posthog.com',
  metrics: [
    { key: 'visits', label: 'Visits', supported: true },
    { key: 'uniqueVisitors', label: 'Unique visitors', supported: true },
    { key: 'pageViews', label: 'Page views', supported: true },
    { key: 'newUsers', label: 'New users', supported: false, replaces: 'bounceRate', description: 'PostHog does not expose a GA4-equivalent new users metric in this dashboard adapter.' },
    { key: 'engagedSessions', label: 'Engaged sessions', supported: false, replaces: 'estimatedEngagedVisits', description: 'Approximated from non-bounce sessions.' },
    { key: 'engagementRate', label: 'Engagement rate', supported: false, replaces: 'estimatedEngagedVisitRate', description: 'Approximated as 100 minus bounce rate.' },
    { key: 'averageSessionDurationSeconds', label: 'Avg. session duration', supported: true },
    { key: 'bounceRate', label: 'Bounce rate', supported: true },
    { key: 'viewsPerVisit', label: 'Views per visit', supported: true },
    { key: 'estimatedEngagedVisits', label: 'Estimated engaged visits', supported: true, derived: true, description: 'Derived from non-bounce sessions.' },
    { key: 'estimatedEngagedVisitRate', label: 'Estimated engaged visit rate', supported: true, derived: true, description: 'Derived as 100 minus bounce rate.' },
  ],
};

const BREAKDOWN_CONFIG: Record<AdminTrafficBreakdownGroup, {
  labelExpr: string;
  countExpr: string;
  fallback: string;
  includePercentage: boolean;
  pageviewsOnly: boolean;
}> = {
  countries: {
    labelExpr: `coalesce(nullIf(properties.$geoip_country_name, ''), 'Unknown')`,
    countExpr: distinctCountExpr(sessionIdExpr('events')),
    fallback: 'Unknown',
    includePercentage: true,
    pageviewsOnly: true,
  },
  pages: {
    labelExpr: `coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), 'Unknown page')`,
    countExpr: 'count()',
    fallback: 'Unknown page',
    includePercentage: true,
    pageviewsOnly: true,
  },
  devices: {
    labelExpr: `lower(coalesce(nullIf(properties.$device_type, ''), 'unknown'))`,
    countExpr: distinctCountExpr(sessionIdExpr('events')),
    fallback: 'unknown',
    includePercentage: true,
    pageviewsOnly: true,
  },
  referrers: {
    labelExpr: `coalesce(nullIf(properties.$referring_domain, ''), nullIf(properties.$referrer, ''), '(direct) / (none)')`,
    countExpr: distinctCountExpr(sessionIdExpr('events')),
    fallback: '(direct) / (none)',
    includePercentage: true,
    pageviewsOnly: true,
  },
  events: {
    labelExpr: 'event',
    countExpr: 'count()',
    fallback: 'unknown',
    includePercentage: false,
    pageviewsOnly: false,
  },
};

function sessionIdExpr(tableName = 'events'): string {
  return `coalesce(nullIf(${tableName}.properties.$session_id, ''), concat('anon:', ${tableName}.distinct_id, ':', toString(toStartOfHour(${tableName}.timestamp))))`;
}

function distinctCountExpr(expr: string): string {
  return `count(DISTINCT ${expr})`;
}

function getPostHogConfig() {
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const appHost = (process.env.POSTHOG_APP_HOST?.trim() || 'https://us.posthog.com').replace(/\/$/, '');

  if (!projectId || !personalApiKey) {
    Logger.warn('PostHog is disabled due to missing configuration', {
      hasProjectId: Boolean(projectId),
      hasPersonalApiKey: Boolean(personalApiKey),
    });
    return null;
  }

  return { projectId, personalApiKey, appHost };
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(filters: TrafficFilters): {
  rangeStart: string;
  rangeEnd: string;
  fillStart: Date;
  fillEnd: Date;
  daysInRange: number;
} {
  const now = new Date();
  const today = startOfDay(now);

  if (filters.period === 'custom') {
    if (!filters.startDate || !filters.endDate) {
      throw new Error('PostHog custom range requires both startDate and endDate');
    }

    const start = startOfDay(new Date(`${filters.startDate}T00:00:00`));
    const end = endOfDay(new Date(`${filters.endDate}T00:00:00`));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('PostHog custom range is invalid');
    }

    return {
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      fillStart: start,
      fillEnd: end,
      daysInRange: Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1),
    };
  }

  const dayMap: Record<Exclude<TrafficFilters['period'], 'custom'>, number> = {
    '1d': 1,
    '2d': 2,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '6m': 180,
    '12m': 365,
    lifetime: 0,
  };

  if (filters.period === 'lifetime') {
    const start = new Date('2015-08-14T00:00:00.000Z');
    const end = endOfDay(now);
    return {
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      fillStart: start,
      fillEnd: end,
      daysInRange: Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1),
    };
  }

  const days = dayMap[filters.period];
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const end = endOfDay(now);
  return {
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    fillStart: start,
    fillEnd: end,
    daysInRange: days,
  };
}

function determineTimeseriesGranularity(daysInRange: number): TimeseriesGranularity {
  if (daysInRange > 365 * 3) return 'yearly';
  if (daysInRange > 90) return 'monthly';
  return 'daily';
}

function buildWhereClauses(filters: TrafficFilters, range: { rangeStart: string; rangeEnd: string }, options?: { pageviewsOnly?: boolean }): string[] {
  const clauses = [
    `timestamp >= toDateTime(${sqlString(range.rangeStart)})`,
    `timestamp <= toDateTime(${sqlString(range.rangeEnd)})`,
  ];

  if (options?.pageviewsOnly) {
    clauses.push(`event = '$pageview'`);
  }

  if (filters.country) {
    clauses.push(`coalesce(nullIf(properties.$geoip_country_name, ''), 'Unknown') = ${sqlString(filters.country)}`);
  }

  if (filters.page) {
    clauses.push(`coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), 'Unknown page') = ${sqlString(filters.page)}`);
  }

  if (filters.deviceType) {
    clauses.push(`lower(coalesce(nullIf(properties.$device_type, ''), 'unknown')) = ${sqlString(filters.deviceType.toLowerCase())}`);
  }

  return clauses;
}

async function runPostHogQuery(sql: string, name: string): Promise<QueryRow[]> {
  const config = getPostHogConfig();
  if (!config) {
    throw new Error('PostHog configuration missing');
  }

  const response = await fetch(`${config.appHost}/api/projects/${config.projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.personalApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query: sql,
      },
      name,
      refresh: 'blocking',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`PostHog API request failed: ${response.status} ${message}`);
  }

  const payload = (await response.json()) as PostHogQueryResponse;
  const results = payload.results ?? payload.query_status?.results ?? [];
  const columns = payload.columns ?? payload.query_status?.columns ?? [];

  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as QueryRow;
    }

    if (Array.isArray(row) && Array.isArray(columns)) {
      return columns.reduce<QueryRow>((acc, column, index) => {
        acc[column] = row[index];
        return acc;
      }, {});
    }

    return {};
  });
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function buildTimeseriesBuckets(start: Date, end: Date, granularity: TimeseriesGranularity): string[] {
  const buckets: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    if (granularity === 'yearly') {
      buckets.push(`${cursor.getUTCFullYear()}-01-01`);
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (granularity === 'monthly') {
      buckets.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }

    buckets.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }

  return buckets;
}

function normalizeBucket(value: string, granularity: TimeseriesGranularity): string {
  const date = value.slice(0, 10);
  if (granularity === 'yearly') {
    return `${date.slice(0, 4)}-01-01`;
  }
  if (granularity === 'monthly') {
    return `${date.slice(0, 7)}-01`;
  }
  return date;
}

export async function fetchPostHogTrafficSnapshot(filters: TrafficFilters): Promise<PostHogTrafficSnapshot> {
  const config = getPostHogConfig();
  if (!config) {
    throw new Error('PostHog configuration missing');
  }

  const range = resolveDateRange(filters);
  const granularity = determineTimeseriesGranularity(range.daysInRange);
  const pageviewWhere = buildWhereClauses(filters, range, { pageviewsOnly: true }).join(' AND ');
  const eventWhere = buildWhereClauses(filters, range, { pageviewsOnly: false }).join(' AND ');
  const bucketExpr = granularity === 'daily'
    ? 'toStartOfDay(timestamp)'
    : granularity === 'monthly'
      ? 'toStartOfMonth(timestamp)'
      : 'toStartOfYear(timestamp)';

  try {
    const [totalsRows, countriesRows, pagesRows, devicesRows, referrersRows, eventsRows, timeseriesRows] = await Promise.all([
      runPostHogQuery(`
        WITH pageviews AS (
          SELECT timestamp, distinct_id, ${sessionIdExpr()} AS session_id
          FROM events
          WHERE ${pageviewWhere}
        ),
        session_rollup AS (
          SELECT session_id, min(timestamp) AS session_start, max(timestamp) AS session_end, count() AS page_views
          FROM pageviews
          GROUP BY session_id
        )
        SELECT
          (SELECT count(DISTINCT session_id) FROM pageviews) AS visits,
          (SELECT count(DISTINCT distinct_id) FROM pageviews) AS unique_visitors,
          (SELECT count() FROM pageviews) AS page_views,
          (SELECT avg(greatest(dateDiff('second', session_start, session_end), 0)) FROM session_rollup) AS avg_session_duration_seconds,
          (SELECT count() FROM session_rollup WHERE page_views = 1) AS bounce_sessions
      `, 'admin_traffic_posthog_totals'),
      runPostHogQuery(`
        SELECT
          coalesce(nullIf(properties.$geoip_country_name, ''), 'Unknown') AS label,
          ${distinctCountExpr(sessionIdExpr())} AS count
        FROM events
        WHERE ${pageviewWhere}
        GROUP BY label
        ORDER BY count DESC
        LIMIT 250
      `, 'admin_traffic_posthog_countries'),
      runPostHogQuery(`
        SELECT
          coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), 'Unknown page') AS label,
          count() AS count
        FROM events
        WHERE ${pageviewWhere}
        GROUP BY label
        ORDER BY count DESC
        LIMIT 250
      `, 'admin_traffic_posthog_pages'),
      runPostHogQuery(`
        SELECT
          lower(coalesce(nullIf(properties.$device_type, ''), 'unknown')) AS label,
          ${distinctCountExpr(sessionIdExpr())} AS count
        FROM events
        WHERE ${pageviewWhere}
        GROUP BY label
        ORDER BY count DESC
        LIMIT 250
      `, 'admin_traffic_posthog_devices'),
      runPostHogQuery(`
        SELECT
          coalesce(nullIf(properties.$referring_domain, ''), nullIf(properties.$referrer, ''), '(direct) / (none)') AS label,
          ${distinctCountExpr(sessionIdExpr())} AS count
        FROM events
        WHERE ${pageviewWhere}
        GROUP BY label
        ORDER BY count DESC
        LIMIT 250
      `, 'admin_traffic_posthog_referrers'),
      runPostHogQuery(`
        SELECT
          event AS label,
          count() AS count
        FROM events
        WHERE ${eventWhere}
          AND event NOT IN ('$pageview', '$pageleave')
        GROUP BY label
        ORDER BY count DESC
        LIMIT 250
      `, 'admin_traffic_posthog_events'),
      runPostHogQuery(`
        SELECT
          ${bucketExpr} AS bucket,
          ${distinctCountExpr(sessionIdExpr())} AS visits,
          count() AS page_views
        FROM events
        WHERE ${pageviewWhere}
        GROUP BY bucket
        ORDER BY bucket ASC
      `, 'admin_traffic_posthog_timeseries'),
    ]);

    const totals = totalsRows[0] ?? {};
    const totalVisits = asNumber(totals.visits);
    const uniqueVisitors = asNumber(totals.unique_visitors);
    const totalPageViews = asNumber(totals.page_views);
    const averageSessionDurationSeconds = asNumber(totals.avg_session_duration_seconds);
    const bounceSessions = asNumber(totals.bounce_sessions);
    const bounceRate = totalVisits > 0 ? (bounceSessions / totalVisits) * 100 : 0;
    const viewsPerVisit = totalVisits > 0 ? totalPageViews / totalVisits : 0;
    const estimatedEngagedVisits = Math.max(0, totalVisits - bounceSessions);
    const estimatedEngagedVisitRate = totalVisits > 0 ? (estimatedEngagedVisits / totalVisits) * 100 : 0;

    const mapRowsWithPercentage = (rows: QueryRow[], totalMetricValue: number, key: 'country' | 'page' | 'type' | 'referrer') =>
      rows.slice(0, 10).map((row) => ({
        [key]: asString(row.label, 'Unknown'),
        count: asNumber(row.count),
        percentage: totalMetricValue > 0 ? (asNumber(row.count) / totalMetricValue) * 100 : 0,
      }));

    const countryTotal = countriesRows.reduce((sum, row) => sum + asNumber(row.count), 0);
    const pageTotal = pagesRows.reduce((sum, row) => sum + asNumber(row.count), 0);
    const deviceTotal = devicesRows.reduce((sum, row) => sum + asNumber(row.count), 0);
    const referrerTotal = referrersRows.reduce((sum, row) => sum + asNumber(row.count), 0);
    const topCountries = mapRowsWithPercentage(countriesRows, countryTotal, 'country') as Array<{ country: string; count: number; percentage: number }>;
    const topPages = mapRowsWithPercentage(pagesRows, pageTotal, 'page') as Array<{ page: string; count: number; percentage: number }>;
    const deviceTypes = mapRowsWithPercentage(devicesRows, deviceTotal, 'type') as Array<{ type: string; count: number; percentage: number }>;
    const topReferrers = mapRowsWithPercentage(referrersRows, referrerTotal, 'referrer') as Array<{ referrer: string; count: number; percentage: number }>;
    const topEvents = eventsRows.slice(0, 10).map((row) => ({
      event: asString(row.label, 'unknown'),
      count: asNumber(row.count),
    }));

    const timeseriesMap = new Map<string, { visits: number; pageViews: number }>();
    for (const row of timeseriesRows) {
      const rawBucket = asString(row.bucket);
      if (!rawBucket) continue;
      timeseriesMap.set(normalizeBucket(rawBucket, granularity), {
        visits: asNumber(row.visits),
        pageViews: asNumber(row.page_views),
      });
    }
    const dailyVisits = buildTimeseriesBuckets(range.fillStart, range.fillEnd, granularity).map((bucket) => {
      const data = timeseriesMap.get(bucket) ?? { visits: 0, pageViews: 0 };
      return { date: bucket, visits: data.visits, pageViews: data.pageViews };
    });

    return {
      totalVisits,
      uniqueVisitors,
      newUsers: 0,
      engagedSessions: estimatedEngagedVisits,
      totalPageViews,
      averageSessionDurationSeconds,
      engagementRate: estimatedEngagedVisitRate,
      bounceRate,
      viewsPerVisit,
      estimatedEngagedVisits,
      estimatedEngagedVisitRate,
      topCountries,
      topPages,
      deviceTypes,
      dailyVisits,
      topReferrers,
      topEvents,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      daysInRange: range.daysInRange,
      timeseriesGranularity: granularity,
      provider: POSTHOG_PROVIDER,
    };
  } catch (error: unknown) {
    Logger.error('PostHog analytics error', {
      error: toError(error),
      period: filters.period,
      filters,
    });
    throw error;
  }
}

export async function fetchPostHogTrafficBreakdown(
  group: BreakdownGroup,
  filters: TrafficFilters,
  options: { page?: number; pageSize?: number } = {}
): Promise<TrafficBreakdownResult> {
  const config = getPostHogConfig();
  if (!config) {
    throw new Error('PostHog configuration missing');
  }

  const breakdownConfig = BREAKDOWN_CONFIG[group];
  if (!breakdownConfig) {
    throw new Error(`Unsupported breakdown group: ${group}`);
  }

  const range = resolveDateRange(filters);
  const page = Math.max(1, Number.isFinite(options.page ?? 0) ? Math.floor(options.page ?? 1) : 1);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(options.pageSize ?? 0) ? Math.floor(options.pageSize ?? 25) : 25));
  const offset = (page - 1) * pageSize;
  const where = buildWhereClauses(filters, range, { pageviewsOnly: breakdownConfig.pageviewsOnly }).join(' AND ');

  try {
    const [rowsResponse, totalResponse, totalRowsResponse] = await Promise.all([
      runPostHogQuery(`
        SELECT
          ${breakdownConfig.labelExpr} AS label,
          ${breakdownConfig.countExpr} AS count
        FROM events
        WHERE ${where}
        ${group === 'events' ? "AND event NOT IN ('$pageview', '$pageleave')" : ''}
        GROUP BY label
        ORDER BY count DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `, `admin_traffic_posthog_breakdown_${group}`),
      runPostHogQuery(`
        SELECT ${breakdownConfig.countExpr} AS total_metric_value
        FROM events
        WHERE ${where}
        ${group === 'events' ? "AND event NOT IN ('$pageview', '$pageleave')" : ''}
      `, `admin_traffic_posthog_breakdown_total_${group}`),
      runPostHogQuery(`
        SELECT count() AS total_rows
        FROM (
          SELECT ${breakdownConfig.labelExpr} AS label
          FROM events
          WHERE ${where}
          ${group === 'events' ? "AND event NOT IN ('$pageview', '$pageleave')" : ''}
          GROUP BY label
        )
      `, `admin_traffic_posthog_breakdown_rows_${group}`),
    ]);

    const totalMetricValue = asNumber(totalResponse[0]?.total_metric_value);
    const totalRows = asNumber(totalRowsResponse[0]?.total_rows);
    const rows = rowsResponse.map((row) => ({
      label: asString(row.label, breakdownConfig.fallback),
      count: asNumber(row.count),
      percentage: breakdownConfig.includePercentage && totalMetricValue > 0 ? (asNumber(row.count) / totalMetricValue) * 100 : undefined,
    }));

    return {
      rows,
      totalRows,
      totalMetricValue,
      page,
      pageSize,
      hasMore: offset + rows.length < totalRows,
    };
  } catch (error: unknown) {
    Logger.error('PostHog breakdown fetch error', {
      error: toError(error),
      group,
      filters,
      page,
      pageSize,
    });
    throw error;
  }
}