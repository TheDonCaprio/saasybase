import { BetaAnalyticsDataClient, protos } from '@google-analytics/data';
import { GoogleAuth, JWT, JWTInput } from 'google-auth-library';
import { Logger } from './logger';
import { toError } from './runtime-guards';

export type PeriodKey = '1d' | '2d' | '7d' | '30d' | '90d' | '6m' | '12m' | 'lifetime' | 'custom';

export type BreakdownGroup = 'countries' | 'pages' | 'devices' | 'referrers' | 'events';

export interface TrafficFilters {
  period: PeriodKey;
  country?: string;
  page?: string;
  deviceType?: string;
  startDate?: string;
  endDate?: string;
}

type TrafficTimeseriesPoint = {
  date: string;
  visits: number;
  pageViews: number;
};

export interface NormalizedTrafficSnapshot {
  totalVisits: number;
  uniqueVisitors: number;
  newUsers: number;
  engagedSessions: number;
  totalPageViews: number;
  averageSessionDurationSeconds: number;
  engagementRate: number;
  topCountries: Array<{ country: string; count: number; percentage: number }>;
  topPages: Array<{ page: string; count: number; percentage: number }>;
  deviceTypes: Array<{ type: string; count: number; percentage: number }>;
  dailyVisits: TrafficTimeseriesPoint[];
  topReferrers: Array<{ referrer: string; count: number; percentage: number }>;
  topEvents: Array<{ event: string; count: number }>;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
  timeseriesGranularity: TimeseriesGranularity;
}

export interface TrafficBreakdownRow {
  label: string;
  count: number;
  percentage?: number;
}

export interface TrafficBreakdownResult {
  rows: TrafficBreakdownRow[];
  totalRows: number;
  totalMetricValue: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type TimeseriesGranularity = 'daily' | 'monthly' | 'yearly';

interface GoogleAnalyticsConfig {
  propertyId: string;
  client: BetaAnalyticsDataClient;
  cacheSeconds: number;
}

interface BreakdownConfig {
  dimension: string;
  metric: string;
  fallback: string;
  includePercentage: boolean;
  mapLabel?: (label: string) => string;
}

const BREAKDOWN_CONFIG: Record<BreakdownGroup, BreakdownConfig> = {
  countries: {
    dimension: 'country',
    metric: 'sessions',
    fallback: 'Unknown',
    includePercentage: true
  },
  pages: {
    dimension: 'pagePath',
    metric: 'screenPageViews',
    fallback: 'Unknown page',
    includePercentage: true
  },
  devices: {
    dimension: 'deviceCategory',
    metric: 'sessions',
    fallback: 'unknown',
    includePercentage: true,
    mapLabel: mapDeviceLabel
  },
  referrers: {
    dimension: 'sessionSourceMedium',
    metric: 'sessions',
    fallback: '(direct) / (none)',
    includePercentage: true
  },
  events: {
    dimension: 'eventName',
    metric: 'eventCount',
    fallback: 'unknown',
    includePercentage: false
  }
};

const PERIOD_TO_DAYS: Record<Exclude<PeriodKey, 'custom'>, number> = {
  '1d': 1,
  '2d': 2,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '6m': 180,
  '12m': 365,
  lifetime: 365
};

const DEFAULT_CACHE_SECONDS = Number(process.env.GA_DATA_API_CACHE_SECONDS ?? '30');
const cacheSecondsFallback = Number.isFinite(DEFAULT_CACHE_SECONDS) ? Math.max(0, DEFAULT_CACHE_SECONDS) : 30;
const DEFAULT_GA_MAX_CONCURRENT_REPORTS = Number(process.env.GA_DATA_API_MAX_CONCURRENT_REPORTS ?? '2');
const gaMaxConcurrentReports = Number.isFinite(DEFAULT_GA_MAX_CONCURRENT_REPORTS)
  ? Math.max(1, Math.floor(DEFAULT_GA_MAX_CONCURRENT_REPORTS))
  : 2;
const DEFAULT_GA_CONCURRENT_QUOTA_RETRIES = Number(process.env.GA_DATA_API_CONCURRENT_QUOTA_RETRIES ?? '2');
const gaConcurrentQuotaRetries = Number.isFinite(DEFAULT_GA_CONCURRENT_QUOTA_RETRIES)
  ? Math.max(0, Math.floor(DEFAULT_GA_CONCURRENT_QUOTA_RETRIES))
  : 2;
const DEFAULT_GA_RETRY_BASE_DELAY_MS = Number(process.env.GA_DATA_API_RETRY_BASE_DELAY_MS ?? '250');
const gaRetryBaseDelayMs = Number.isFinite(DEFAULT_GA_RETRY_BASE_DELAY_MS)
  ? Math.max(50, Math.floor(DEFAULT_GA_RETRY_BASE_DELAY_MS))
  : 250;
const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GA_MIN_LIFETIME_START_DATE = '2015-08-14';
const GA_MAX_LIFETIME_START_DATE = '2999-12-31';
const LIFETIME_START_DATE = resolveLifetimeStartDate();
const MS_PER_DAY = 86_400_000;
const MONTHLY_AGGREGATION_THRESHOLD_DAYS = 90;
const YEARLY_AGGREGATION_THRESHOLD_DAYS = 365 * 3;

const snapshotCache = new Map<
  string,
  {
    expiresAt: number;
    payload: NormalizedTrafficSnapshot;
  }
>();

const breakdownCache = new Map<
  string,
  {
    expiresAt: number;
    payload: TrafficBreakdownResult;
  }
>();

let cachedCredentialsHash: string | null = null;
let cachedClient: BetaAnalyticsDataClient | null = null;
let cachedAuth: GoogleAuth | null = null;
let activeGaReportRequests = 0;
const pendingGaReportResolvers: Array<() => void> = [];

type FilterExpressionType = protos.google.analytics.data.v1beta.IFilterExpression;
type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type Row = protos.google.analytics.data.v1beta.IRow;

type DateRangeResult = {
  startDate: string;
  endDate: string;
  fillStart: Date;
  fillEnd: Date;
  rangeStart: Date;
  rangeEnd: Date;
};

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

function getDateRange(filters: TrafficFilters): DateRangeResult {
  const period = filters.period;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (period === 'custom') {
    const { startDate, endDate } = filters;
    if (!startDate || !endDate) {
      throw new Error('GA custom range requires both startDate and endDate');
    }
    const start = startOfDay(new Date(`${startDate}T00:00:00`));
    const end = endOfDay(new Date(`${endDate}T00:00:00`));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('GA custom range is invalid');
    }
    return {
      startDate,
      endDate,
      fillStart: start,
      fillEnd: end,
      rangeStart: start,
      rangeEnd: end
    };
  }

  if (period === 'lifetime') {
    const start = startOfDay(new Date(`${LIFETIME_START_DATE}T00:00:00Z`));
    return {
      startDate: LIFETIME_START_DATE,
      endDate: 'today',
      fillStart: start,
      fillEnd: todayEnd,
      rangeStart: start,
      rangeEnd: todayEnd
    };
  }

  if (period === '1d') {
    return {
      startDate: 'today',
      endDate: 'today',
      fillStart: todayStart,
      fillEnd: todayEnd,
      rangeStart: todayStart,
      rangeEnd: todayEnd
    };
  }

  const days = PERIOD_TO_DAYS[period];
  const start = new Date(todayStart);
  start.setDate(start.getDate() - (days - 1));

  const dateOffset = Math.max(0, days - 1);
  const startDate = `${dateOffset}daysAgo`;

  const fillStart = startOfDay(start);
  const fillEnd = todayEnd;

  return {
    startDate,
    endDate: 'today',
    fillStart,
    fillEnd,
    rangeStart: fillStart,
    rangeEnd: fillEnd
  };
}

function buildFilterExpression(filters: Omit<TrafficFilters, 'period'>): FilterExpressionType | undefined {
  const expressions: FilterExpressionType[] = [];

  if (filters.country) {
    expressions.push({
      filter: {
        fieldName: 'country',
        stringFilter: {
          value: filters.country,
          matchType: protos.google.analytics.data.v1beta.Filter.StringFilter.MatchType.EXACT
        }
      }
    });
  }

  if (filters.page) {
    expressions.push({
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          value: filters.page,
          matchType: protos.google.analytics.data.v1beta.Filter.StringFilter.MatchType.EXACT
        }
      }
    });
  }

  if (filters.deviceType) {
    expressions.push({
      filter: {
        fieldName: 'deviceCategory',
        stringFilter: {
          value: filters.deviceType.toLowerCase(),
          matchType: protos.google.analytics.data.v1beta.Filter.StringFilter.MatchType.EXACT
        }
      }
    });
  }

  if (expressions.length === 0) {
    return undefined;
  }

  if (expressions.length === 1) {
    return expressions[0];
  }

  return {
    andGroup: {
      expressions
    }
  };
}

function parseCredentials(credentialsB64: string): JWTInput {
  try {
    const decoded = Buffer.from(credentialsB64, 'base64').toString('utf-8');
    return JSON.parse(decoded) as JWTInput;
  } catch (error: unknown) {
    Logger.error('Failed to parse Google Analytics credentials', { error: toError(error) });
    throw new Error('GA configuration missing');
  }
}

async function getAnalyticsConfig(): Promise<GoogleAnalyticsConfig | null> {
  const propertyId = process.env.GA_PROPERTY_ID;
  const credentialsB64 = process.env.GA_SERVICE_ACCOUNT_CREDENTIALS_B64;

  if (!propertyId || !credentialsB64) {
    Logger.warn('Google Analytics is disabled due to missing configuration', {
      hasPropertyId: Boolean(propertyId),
      hasCredentials: Boolean(credentialsB64)
    });
    return null;
  }

  if (!cachedClient || cachedCredentialsHash !== credentialsB64) {
    const credentials = parseCredentials(credentialsB64);
    const clientEmail = credentials.client_email;
    const privateKey = credentials.private_key;

    if (!clientEmail || !privateKey) {
      Logger.error('Google Analytics credentials missing client_email or private_key');
      throw new Error('GA configuration missing');
    }

    const jwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [ANALYTICS_SCOPE]
    });

    cachedAuth = new GoogleAuth({
      authClient: jwtClient,
      projectId: credentials.project_id ?? undefined,
      scopes: [ANALYTICS_SCOPE]
    });

    cachedClient = new BetaAnalyticsDataClient({
      auth: cachedAuth
    });
    cachedCredentialsHash = credentialsB64;
  }

  const client = cachedClient;
  if (!client) {
    Logger.error('Google Analytics client unavailable after initialization attempt');
    throw new Error('GA configuration missing');
  }

  return {
    propertyId,
    client,
    cacheSeconds: cacheSecondsFallback
  };
}

function cacheGet(key: string): NormalizedTrafficSnapshot | undefined {
  const entry = snapshotCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() >= entry.expiresAt) {
    return undefined;
  }
  return entry.payload;
}

function cacheGetStale(key: string): { payload: NormalizedTrafficSnapshot; staleSeconds: number } | undefined {
  const entry = snapshotCache.get(key);
  if (!entry) {
    return undefined;
  }
  return {
    payload: entry.payload,
    staleSeconds: Math.max(0, Math.floor((Date.now() - entry.expiresAt) / 1000))
  };
}

function cacheSet(key: string, value: NormalizedTrafficSnapshot, ttlSeconds: number) {
  if (ttlSeconds <= 0) {
    return;
  }
  snapshotCache.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload: value
  });
}

function resolveLifetimeStartDate(): string {
  const rawValue = process.env.GA_LIFETIME_START_DATE?.trim();
  if (!rawValue) {
    return GA_MIN_LIFETIME_START_DATE;
  }

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(rawValue)) {
    Logger.warn('GA_LIFETIME_START_DATE is not in YYYY-MM-DD format; falling back to GA minimum', {
      value: rawValue
    });
    return GA_MIN_LIFETIME_START_DATE;
  }

  if (rawValue < GA_MIN_LIFETIME_START_DATE) {
    Logger.warn('GA_LIFETIME_START_DATE precedes the GA-supported minimum; clamping to minimum', {
      value: rawValue,
      minimum: GA_MIN_LIFETIME_START_DATE
    });
    return GA_MIN_LIFETIME_START_DATE;
  }

  if (rawValue > GA_MAX_LIFETIME_START_DATE) {
    Logger.warn('GA_LIFETIME_START_DATE exceeds the GA-supported maximum; clamping to maximum', {
      value: rawValue,
      maximum: GA_MAX_LIFETIME_START_DATE
    });
    return GA_MAX_LIFETIME_START_DATE;
  }

  return rawValue;
}

function breakdownCacheGet(key: string): TrafficBreakdownResult | undefined {
  const entry = breakdownCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() >= entry.expiresAt) {
    return undefined;
  }
  return entry.payload;
}

function breakdownCacheGetStale(key: string): { payload: TrafficBreakdownResult; staleSeconds: number } | undefined {
  const entry = breakdownCache.get(key);
  if (!entry) {
    return undefined;
  }
  return {
    payload: entry.payload,
    staleSeconds: Math.max(0, Math.floor((Date.now() - entry.expiresAt) / 1000))
  };
}

function breakdownCacheSet(key: string, value: TrafficBreakdownResult, ttlSeconds: number) {
  if (ttlSeconds <= 0) {
    return;
  }
  breakdownCache.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload: value
  });
}

function buildCacheKey(filters: TrafficFilters): string {
  return JSON.stringify(filters);
}

function buildBreakdownCacheKey(group: BreakdownGroup, filters: TrafficFilters, page: number, pageSize: number): string {
  return JSON.stringify({ group, filters, page, pageSize });
}

function toNumber(value: string | undefined | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseList(rows: Row[] | null | undefined, fallbackLabel: string): Array<{ label: string; count: number }> {
  if (!rows || rows.length === 0) {
    return [];
  }
  return rows
    .map((row) => {
      const rawLabel = row?.dimensionValues?.[0]?.value ?? '';
      const label = rawLabel || fallbackLabel;
      const count = toNumber(row?.metricValues?.[0]?.value ?? '0');
      return {
        label,
        count
      };
    })
    .filter((row) => row.count > 0);
}

function sumCounts(items: Array<{ count: number }>): number {
  return items.reduce((acc, item) => acc + item.count, 0);
}

function calculatePercentages<T extends { count: number }>(items: Array<T>, total: number): Array<T & { percentage: number }> {
  if (total <= 0) {
    return items.map((item) => ({ ...item, percentage: 0 }));
  }
  return items.map((item) => ({
    ...item,
    percentage: (item.count / total) * 100
  }));
}

function mapDeviceLabel(label: string): string {
  const normalised = label.toLowerCase();
  if (normalised === 'other' || normalised === 'unknown') {
    return 'unknown';
  }
  if (normalised.includes('mobile')) {
    return 'mobile';
  }
  if (normalised.includes('tablet')) {
    return 'tablet';
  }
  if (normalised.includes('desktop') || normalised.includes('laptop')) {
    return 'desktop';
  }
  return normalised;
}

function normaliseTimeseries(rows: Row[] | undefined, fillStart: Date, fillEnd: Date): TrafficTimeseriesPoint[] {
  const series: Map<string, { visits: number; pageViews: number }> = new Map();

  rows?.forEach((row) => {
    if (!row) {
      return;
    }
    const rawDate = row.dimensionValues?.[0]?.value ?? '';
    if (!rawDate) {
      return;
    }
    const dateKey = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const visits = toNumber(row.metricValues?.[0]?.value ?? '0');
    const pageViews = toNumber(row.metricValues?.[1]?.value ?? '0');
    series.set(dateKey, { visits, pageViews });
  });

  const cursor = startOfDay(fillStart);
  const end = endOfDay(fillEnd);
  const result: TrafficTimeseriesPoint[] = [];

  while (cursor <= end) {
    const dateKey = cursor.toISOString().split('T')[0];
    const entry = series.get(dateKey);
    result.push({
      date: dateKey,
      visits: entry?.visits ?? 0,
      pageViews: entry?.pageViews ?? 0
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function determineTimeseriesGranularity(daysInRange: number): TimeseriesGranularity {
  if (daysInRange > YEARLY_AGGREGATION_THRESHOLD_DAYS) {
    return 'yearly';
  }
  if (daysInRange > MONTHLY_AGGREGATION_THRESHOLD_DAYS) {
    return 'monthly';
  }
  return 'daily';
}

function aggregateTimeseries(
  series: TrafficTimeseriesPoint[],
  granularity: TimeseriesGranularity
): TrafficTimeseriesPoint[] {
  if (series.length === 0 || granularity === 'daily') {
    return series;
  }

  const first = series[0]?.date;
  const last = series[series.length - 1]?.date;
  if (!first || !last) {
    return series;
  }

  const toYearMonthDay = (value: string) => {
    const [yearStr, monthStr, dayStr] = value.split('-');
    return {
      year: Number(yearStr),
      month: Number(monthStr),
      day: Number(dayStr)
    };
  };

  const buckets = new Map<string, { visits: number; pageViews: number }>();
  if (granularity === 'monthly') {
    series.forEach(({ date, visits, pageViews }) => {
      const { year, month } = toYearMonthDay(date);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return;
      }
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const current = buckets.get(key) ?? { visits: 0, pageViews: 0 };
      buckets.set(key, {
        visits: current.visits + visits,
        pageViews: current.pageViews + pageViews
      });
    });

    const start = toYearMonthDay(first);
    const end = toYearMonthDay(last);
    if (!Number.isFinite(start.year) || !Number.isFinite(start.month) || !Number.isFinite(end.year) || !Number.isFinite(end.month)) {
      return series;
    }

    const result: TrafficTimeseriesPoint[] = [];
    let year = start.year;
    let month = start.month;

    while (year < end.year || (year === end.year && month <= end.month)) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const iso = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0];
      const bucket = buckets.get(key);
      result.push({
        date: iso,
        visits: bucket?.visits ?? 0,
        pageViews: bucket?.pageViews ?? 0
      });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return result;
  }

  // yearly aggregation
  series.forEach(({ date, visits, pageViews }) => {
    const { year } = toYearMonthDay(date);
    if (!Number.isFinite(year)) {
      return;
    }
    const key = `${year}`;
    const current = buckets.get(key) ?? { visits: 0, pageViews: 0 };
    buckets.set(key, {
      visits: current.visits + visits,
      pageViews: current.pageViews + pageViews
    });
  });

  const startYear = toYearMonthDay(first).year;
  const endYear = toYearMonthDay(last).year;
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return series;
  }

  const result: TrafficTimeseriesPoint[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const iso = new Date(Date.UTC(year, 0, 1)).toISOString().split('T')[0];
    const bucket = buckets.get(String(year));
    result.push({
      date: iso,
      visits: bucket?.visits ?? 0,
      pageViews: bucket?.pageViews ?? 0
    });
  }

  return result;
}

async function runReport(client: BetaAnalyticsDataClient, request: RunReportRequest) {
  return withGaReportSlot(async () => {
    let attempt = 0;

    while (true) {
      try {
        const [response] = await client.runReport(request);
        return response;
      } catch (error: unknown) {
        if (!isConcurrentQuotaExceeded(error) || attempt >= gaConcurrentQuotaRetries) {
          throw error;
        }

        const retryDelayMs = computeQuotaRetryDelayMs(attempt);
        Logger.warn('Google Analytics concurrent quota exhausted; retrying report', {
          attempt: attempt + 1,
          retryDelayMs
        });
        attempt += 1;
        await wait(retryDelayMs);
      }
    }
  });
}

async function withGaReportSlot<T>(operation: () => Promise<T>): Promise<T> {
  await acquireGaReportSlot();
  try {
    return await operation();
  } finally {
    releaseGaReportSlot();
  }
}

async function acquireGaReportSlot(): Promise<void> {
  if (activeGaReportRequests < gaMaxConcurrentReports) {
    activeGaReportRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    pendingGaReportResolvers.push(resolve);
  });
}

function releaseGaReportSlot() {
  activeGaReportRequests = Math.max(0, activeGaReportRequests - 1);
  if (activeGaReportRequests >= gaMaxConcurrentReports) {
    return;
  }

  const next = pendingGaReportResolvers.shift();
  if (!next) {
    return;
  }

  activeGaReportRequests += 1;
  next();
}

function computeQuotaRetryDelayMs(attempt: number): number {
  const baseDelayMs = gaRetryBaseDelayMs * 2 ** attempt;
  const jitterMs = Math.floor(Math.random() * gaRetryBaseDelayMs);
  return baseDelayMs + jitterMs;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isPermissionDenied(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const candidate = error as { code?: number; status?: number; message?: string };
  if (typeof candidate.code === 'number' && (candidate.code === 7 || candidate.code === 403)) {
    return true;
  }
  if (typeof candidate.status === 'number' && candidate.status === 403) {
    return true;
  }
  const message = candidate?.message || (error instanceof Error ? error.message : '');
  if (!message) {
    return false;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes('permission denied') ||
    lower.includes('insufficient permissions') ||
    lower.includes('"code":7') ||
    lower.includes('user does not have sufficient permissions')
  );
}

function isConcurrentQuotaExceeded(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const candidate = error as { code?: number; status?: number; message?: string; details?: string };
  if (typeof candidate.code === 'number' && candidate.code === 8) {
    return true;
  }
  if (typeof candidate.status === 'number' && candidate.status === 8) {
    return true;
  }
  const message = candidate.details || candidate.message || (error instanceof Error ? error.message : '');
  if (!message) {
    return false;
  }
  const lower = message.toLowerCase();
  return lower.includes('exhausted concurrent requests quota') || lower.includes('send fewer requests concurrently');
}

function createPermissionDeniedError(): Error {
  const friendly = new Error(
    'Google Analytics service account is missing viewer access to this property. Add the service-account email under GA4 → Admin → Property Access Management.'
  );
  (friendly as { status?: number }).status = 403;
  return friendly;
}

export async function fetchTrafficSnapshot(filters: TrafficFilters): Promise<NormalizedTrafficSnapshot> {
  const config = await getAnalyticsConfig();
  if (!config) {
    throw new Error('GA configuration missing');
  }

  const cacheKey = buildCacheKey(filters);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const { startDate, endDate, fillStart, fillEnd, rangeStart, rangeEnd } = getDateRange(filters);
  const filterExpression = buildFilterExpression({
    country: filters.country,
    page: filters.page,
    deviceType: filters.deviceType
  });

  const propertyPath = `properties/${config.propertyId}`;

  try {
    const [totals, countries, pages, devices, timeseries, referrers, events] = await Promise.all([
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'engagementRate' },
          { name: 'newUsers' },
          { name: 'engagedSessions' }
        ],
        dimensionFilter: filterExpression
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: filterExpression,
        limit: 250,
        orderBys: [
          {
            metric: { metricName: 'sessions' },
            desc: true
          }
        ]
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        dimensionFilter: filterExpression,
        limit: 250,
        orderBys: [
          {
            metric: { metricName: 'screenPageViews' },
            desc: true
          }
        ]
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: filterExpression
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
        dimensionFilter: filterExpression,
        orderBys: [
          {
            dimension: { dimensionName: 'date' }
          }
        ],
        limit: 1000
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }],
        dimensionFilter: filterExpression,
        orderBys: [
          {
            metric: { metricName: 'sessions' },
            desc: true
          }
        ],
        limit: 250
      }),
      runReport(config.client, {
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: filterExpression,
        orderBys: [
          {
            metric: { metricName: 'eventCount' },
            desc: true
          }
        ],
        limit: 250
      })
    ]);

    const totalVisits = toNumber(totals.rows?.[0]?.metricValues?.[0]?.value);
    const uniqueVisitors = toNumber(totals.rows?.[0]?.metricValues?.[1]?.value);
  const totalPageViews = toNumber(totals.rows?.[0]?.metricValues?.[2]?.value);
  const averageSessionDurationSeconds = toNumber(totals.rows?.[0]?.metricValues?.[3]?.value);
  const engagementRateRaw = toNumber(totals.rows?.[0]?.metricValues?.[4]?.value);
  const engagementRate = Math.min(100, Math.max(0, engagementRateRaw * 100));
    const newUsers = toNumber(totals.rows?.[0]?.metricValues?.[5]?.value);
    const engagedSessions = toNumber(totals.rows?.[0]?.metricValues?.[6]?.value);

    const topCountriesRaw = normaliseList(countries.rows, 'Unknown');
    const countryTotal = sumCounts(topCountriesRaw);
    const topCountries = calculatePercentages(
      topCountriesRaw.map((item) => ({ country: item.label, count: item.count })),
      countryTotal
    );

    const topPagesRaw = normaliseList(pages.rows, 'Unknown page');
    const pageTotal = sumCounts(topPagesRaw);
    const topPages = calculatePercentages(
      topPagesRaw.map((item) => ({ page: item.label, count: item.count })),
      pageTotal
    );

    const deviceRows = normaliseList(devices.rows, 'unknown');
    const deviceTotal = sumCounts(deviceRows);
    const deviceTypes = calculatePercentages(
      deviceRows.map((item) => ({ type: mapDeviceLabel(item.label), count: item.count })),
      deviceTotal
    );

    const dailyVisits = normaliseTimeseries(timeseries.rows ?? [], fillStart, fillEnd);
    const topReferrersRaw = normaliseList(referrers.rows, '(direct) / (none)');
    const referrerTotal = sumCounts(topReferrersRaw);
    const topReferrers = calculatePercentages(
      topReferrersRaw.map((item) => ({ referrer: item.label, count: item.count })),
      referrerTotal
    ).slice(0, 10);

    const topEvents = (events.rows ?? [])
      .map((row) => {
        const eventName = row?.dimensionValues?.[0]?.value ?? '';
        const count = toNumber(row?.metricValues?.[0]?.value ?? '0');
        return {
          event: eventName || 'unknown',
          count
        };
      })
      .filter((row) => row.count > 0)
      .slice(0, 10);

  const rangeStartIso = rangeStart.toISOString();
  const rangeEndIso = rangeEnd.toISOString();
  const daySpan = Math.floor((fillEnd.getTime() - fillStart.getTime()) / MS_PER_DAY) + 1;
  const daysInRange = Math.max(1, daySpan);
  const timeseriesGranularity = determineTimeseriesGranularity(daysInRange);
  const aggregatedVisits = aggregateTimeseries(dailyVisits, timeseriesGranularity);

    const snapshot: NormalizedTrafficSnapshot = {
      totalVisits,
      uniqueVisitors,
      newUsers,
      engagedSessions,
      totalPageViews,
      averageSessionDurationSeconds,
      engagementRate,
      topCountries,
      topPages,
      deviceTypes,
      dailyVisits: aggregatedVisits,
      topReferrers,
      topEvents,
      rangeStart: rangeStartIso,
      rangeEnd: rangeEndIso,
      daysInRange,
      timeseriesGranularity
    };

    cacheSet(cacheKey, snapshot, config.cacheSeconds);

    try {
      Logger.debug('[traffic] fetched from Google Analytics', {
        period: filters.period,
        totalVisits,
        uniqueVisitors
      });
    } catch (logError: unknown) {
      Logger.warn('Traffic debug logging failed (GA)', { error: toError(logError) });
    }

    return snapshot;
  } catch (error: unknown) {
    Logger.error('Google Analytics Data API error', {
      error: toError(error),
      period: filters.period,
      filters: {
        country: filters.country,
        page: filters.page,
        deviceType: filters.deviceType
      }
    });
    if (isPermissionDenied(error)) {
      throw createPermissionDeniedError();
    }
    if (isConcurrentQuotaExceeded(error)) {
      const stale = cacheGetStale(cacheKey);
      if (stale) {
        Logger.warn('Google Analytics concurrent quota exhausted; serving stale traffic snapshot', {
          period: filters.period,
          staleSeconds: stale.staleSeconds,
          filters: {
            country: filters.country,
            page: filters.page,
            deviceType: filters.deviceType
          }
        });
        return stale.payload;
      }
    }
    throw error;
  }
}

export async function fetchTrafficBreakdown(
  group: BreakdownGroup,
  filters: TrafficFilters,
  options: { page?: number; pageSize?: number } = {}
): Promise<TrafficBreakdownResult> {
  const config = await getAnalyticsConfig();
  if (!config) {
    throw new Error('GA configuration missing');
  }

  const breakdownConfig = BREAKDOWN_CONFIG[group];
  if (!breakdownConfig) {
    throw new Error(`Unsupported breakdown group: ${group}`);
  }

  const page = Math.max(1, Number.isFinite(options.page ?? 0) ? Math.floor(options.page ?? 1) : 1);
  const normalizedPageSize = Number.isFinite(options.pageSize ?? 0) ? Math.floor(options.pageSize ?? 25) : 25;
  const pageSize = Math.min(100, Math.max(1, normalizedPageSize));
  const cacheKey = buildBreakdownCacheKey(group, filters, page, pageSize);
  const cached = breakdownCacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const { startDate, endDate } = getDateRange(filters);
  const filterExpression = buildFilterExpression({
    country: filters.country,
    page: filters.page,
    deviceType: filters.deviceType
  });

  const propertyPath = `properties/${config.propertyId}`;
  const offset = (page - 1) * pageSize;

  try {
    const response = await runReport(config.client, {
      property: propertyPath,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: breakdownConfig.dimension }],
      metrics: [{ name: breakdownConfig.metric }],
      dimensionFilter: filterExpression,
      metricAggregations: [protos.google.analytics.data.v1beta.MetricAggregation.TOTAL],
      orderBys: [
        {
          metric: { metricName: breakdownConfig.metric },
          desc: true
        }
      ],
      limit: pageSize,
      offset
    });

    const rows = (response.rows ?? [])
      .map((row) => {
        const rawLabel = row?.dimensionValues?.[0]?.value ?? '';
        const baseLabel = rawLabel || breakdownConfig.fallback;
        const transformedLabel = breakdownConfig.mapLabel ? breakdownConfig.mapLabel(baseLabel) : baseLabel;
        const finalLabel = transformedLabel || breakdownConfig.fallback;
        const count = toNumber(row?.metricValues?.[0]?.value ?? '0');
        return {
          label: finalLabel,
          count
        };
      })
      .filter((row) => row.count > 0);

    const totalMetricFromResponse = toNumber(response.totals?.[0]?.metricValues?.[0]?.value);
    const totalMetricValue = totalMetricFromResponse > 0 ? totalMetricFromResponse : rows.reduce((acc, row) => acc + row.count, 0);
    const totalRowsFromResponse = response.rowCount != null ? Number(response.rowCount) : offset + rows.length;
    const totalRows = Number.isFinite(totalRowsFromResponse) ? totalRowsFromResponse : offset + rows.length;

    const enhancedRows: TrafficBreakdownRow[] = breakdownConfig.includePercentage && totalMetricValue > 0
      ? rows.map((row) => ({
          ...row,
          percentage: (row.count / totalMetricValue) * 100
        }))
      : rows;

    const payload: TrafficBreakdownResult = {
      rows: enhancedRows,
      totalRows,
      totalMetricValue,
      page,
      pageSize,
      hasMore: offset + rows.length < totalRows
    };

    breakdownCacheSet(cacheKey, payload, config.cacheSeconds);

    return payload;
  } catch (error: unknown) {
    Logger.error('Google Analytics breakdown fetch error', {
      error: toError(error),
      group,
      filters,
      page,
      pageSize
    });
    if (isPermissionDenied(error)) {
      throw createPermissionDeniedError();
    }
    if (isConcurrentQuotaExceeded(error)) {
      const stale = breakdownCacheGetStale(cacheKey);
      if (stale) {
        Logger.warn('Google Analytics concurrent quota exhausted; serving stale traffic breakdown', {
          group,
          staleSeconds: stale.staleSeconds,
          page,
          pageSize,
          filters
        });
        return stale.payload;
      }
    }
    throw error;
  }
}
