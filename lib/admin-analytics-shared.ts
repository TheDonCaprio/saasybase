export type AdminAnalyticsPeriod =
  | 'today'
  | 'yesterday'
  | '1d'
  | '7d'
  | '30d'
  | '90d'
  | '3m'
  | '6m'
  | '1y'
  | 'all';

export interface AdminAnalyticsPeriodOption {
  label: string;
  value: AdminAnalyticsPeriod;
}

export interface AdminAnalyticsResponse {
  period: AdminAnalyticsPeriod;
  startDate: string;
  endDate: string;
  revenue: {
    total: number;
    currentPeriod: number;
    previousPeriod: number;
    daily: number;
    yesterday: number;
    growth: number;
    mrr: number;
    arr: number;
    chartData: Array<{ date: string; revenue: number }>;
  };
  users: {
    total: number;
    active: number;
    currentPeriod: number;
    previousPeriod: number;
    growth: number;
    growthData: Array<{ date: string; users: number }>;
    today: number;
    thisWeek: number;
  };
  subscriptions: {
    total: number;
    active: number;
    pending: number;
    canceled: number;
    currentPeriod: number;
    previousPeriod: number;
    growth: number;
    conversionRate: number;
    churnRate: number;
    chartData: Array<{ date: string; subscriptions: number }>;
  };
  plans: Array<{
    id: string;
    name: string;
    revenue: number;
    users: number;
    percentage: number;
  }>;
  features: Array<{
    name: string;
    usage: number;
    users: number;
    adoptionRate: number;
  }>;
  visits: {
    total: number;
    currentPeriod: number;
    previousPeriod: number;
    growth: number;
    uniqueVisitors: number;
    bounceRate: number;
    countries: Array<{ country: string; visits: number; percentage: number }>;
    pages: Array<{ path: string; views: number; percentage: number }>;
  };
  charts: {
    revenue: Array<{ date: string; revenue: number }>;
    subscriptions: Array<{ date: string; subscriptions: number }>;
    users: Array<{ date: string; users: number }>;
  };
}

export const ADMIN_ANALYTICS_PERIODS: AdminAnalyticsPeriodOption[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 24 hours', value: '1d' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Last 3 months', value: '3m' },
  { label: 'Last 6 months', value: '6m' },
  { label: 'Last 12 months', value: '1y' },
  { label: 'All time', value: 'all' }
];
