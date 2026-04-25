import type { AdminTrafficProviderMeta } from './admin-traffic-contract';
import { resolveTrafficAnalyticsProvider } from './traffic-analytics-config';
import {
  fetchTrafficBreakdown,
  fetchTrafficSnapshot,
  type BreakdownGroup,
  type TrafficBreakdownResult,
  type TrafficFilters,
} from './google-analytics';
import {
  fetchPostHogTrafficBreakdown,
  fetchPostHogTrafficSnapshot,
  POSTHOG_PROVIDER,
} from './posthog-analytics';
import type { TrafficAnalyticsProviderKey } from './traffic-analytics-config';

export interface ProviderTrafficSnapshot {
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
  dailyVisits: Array<{ date: string; visits: number; pageViews: number }>;
  topReferrers: Array<{ referrer: string; count: number; percentage: number }>;
  topEvents: Array<{ event: string; count: number }>;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
  timeseriesGranularity: 'daily' | 'monthly' | 'yearly';
  provider: AdminTrafficProviderMeta;
  bounceRate?: number;
  viewsPerVisit?: number;
  estimatedEngagedVisits?: number;
  estimatedEngagedVisitRate?: number;
}

export type { TrafficFilters };

export const GOOGLE_ANALYTICS_PROVIDER: AdminTrafficProviderMeta = {
  key: 'google-analytics',
  label: 'Google Analytics',
  externalDashboardUrl: 'https://analytics.google.com/',
  metrics: [
    { key: 'visits', label: 'Visits', supported: true },
    { key: 'uniqueVisitors', label: 'Unique visitors', supported: true },
    { key: 'pageViews', label: 'Page views', supported: true },
    { key: 'newUsers', label: 'New users', supported: true },
    { key: 'engagedSessions', label: 'Engaged sessions', supported: true },
    { key: 'engagementRate', label: 'Engagement rate', supported: true },
    { key: 'averageSessionDurationSeconds', label: 'Avg. session duration', supported: true },
    { key: 'bounceRate', label: 'Bounce rate', supported: false, description: 'Not currently returned by the GA-backed traffic adapter.' },
    { key: 'viewsPerVisit', label: 'Views per visit', supported: false, description: 'Not currently returned by the GA-backed traffic adapter.' },
    { key: 'estimatedEngagedVisits', label: 'Estimated engaged visits', supported: false, description: 'Google Analytics provides native engaged sessions instead.' },
    { key: 'estimatedEngagedVisitRate', label: 'Estimated engaged visit rate', supported: false, description: 'Google Analytics provides native engagement rate instead.' },
  ],
};

export function getTrafficProviderMeta(provider: TrafficAnalyticsProviderKey): AdminTrafficProviderMeta {
  return provider === 'posthog' ? POSTHOG_PROVIDER : GOOGLE_ANALYTICS_PROVIDER;
}

export async function getActiveTrafficProviderMeta(): Promise<AdminTrafficProviderMeta> {
  const resolution = await resolveTrafficAnalyticsProvider();
  return getTrafficProviderMeta(resolution.provider);
}

export async function fetchTrafficSnapshotFromProvider(filters: TrafficFilters): Promise<ProviderTrafficSnapshot> {
  const resolution = await resolveTrafficAnalyticsProvider();
  if (resolution.provider === 'posthog') {
    return fetchPostHogTrafficSnapshot(filters);
  }

  const snapshot = await fetchTrafficSnapshot(filters);
  return {
    ...snapshot,
    provider: GOOGLE_ANALYTICS_PROVIDER,
  };
}

export async function fetchTrafficBreakdownFromProvider(
  group: BreakdownGroup,
  filters: TrafficFilters,
  options: { page?: number; pageSize?: number } = {}
): Promise<TrafficBreakdownResult> {
  const resolution = await resolveTrafficAnalyticsProvider();
  if (resolution.provider === 'posthog') {
    return fetchPostHogTrafficBreakdown(group, filters, options);
  }

  return fetchTrafficBreakdown(group, filters, options);
}