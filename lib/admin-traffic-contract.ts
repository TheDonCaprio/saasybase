export type AdminTrafficPeriod =
	| '1d'
	| '2d'
	| '7d'
	| '30d'
	| '90d'
	| '6m'
	| '12m'
	| 'lifetime'
	| 'custom';

export interface AdminTrafficFilters {
	period: AdminTrafficPeriod;
	country?: string;
	page?: string;
	deviceType?: string;
	startDate?: string;
	endDate?: string;
}

export interface AdminTrafficPeriodOption {
	label: string;
	value: AdminTrafficPeriod;
	helper?: string;
}

export interface AdminTrafficBreakdownCountry {
	name: string;
	visits: number;
	share: number;
}

export interface AdminTrafficBreakdownPage {
	path: string;
	views: number;
	share: number;
}

export interface AdminTrafficBreakdownDevice {
	type: string;
	sessions: number;
	share: number;
}

export interface AdminTrafficBreakdownReferrer {
	label: string;
	sessions: number;
	share: number;
}

export interface AdminTrafficBreakdownEvent {
	name: string;
	count: number;
}

export type AdminTrafficProviderKey = 'google-analytics' | 'posthog';

export type AdminTrafficMetricKey =
	| 'visits'
	| 'uniqueVisitors'
	| 'pageViews'
	| 'newUsers'
	| 'engagedSessions'
	| 'engagementRate'
	| 'averageSessionDurationSeconds'
	| 'bounceRate'
	| 'viewsPerVisit'
	| 'estimatedEngagedVisits'
	| 'estimatedEngagedVisitRate';

export interface AdminTrafficProviderMetricDescriptor {
	key: AdminTrafficMetricKey;
	label: string;
	supported: boolean;
	derived?: boolean;
	description?: string;
	replaces?: AdminTrafficMetricKey;
}

export interface AdminTrafficProviderMeta {
	key: AdminTrafficProviderKey;
	label: string;
	externalDashboardUrl?: string;
	metrics: AdminTrafficProviderMetricDescriptor[];
}

export type AdminTrafficMetricValueMap = Partial<Record<AdminTrafficMetricKey, number>>;

export interface AdminTrafficResponse {
	period: AdminTrafficPeriod;
	filters: AdminTrafficFilters;
	provider: AdminTrafficProviderMeta;
	metricValues: AdminTrafficMetricValueMap;
	range: {
		start: string;
		end: string;
		days: number;
	};
	totals: {
		visits: number;
		uniqueVisitors: number;
		pageViews: number;
		newUsers: number;
		engagedSessions: number;
		engagementRate: number;
		averageSessionDurationSeconds: number;
	};
	derived: {
		dailyVisits: number;
		uniqueVisitorShare: number;
		newUserShare: number;
		engagedSessionShare: number;
	};
	charts: {
		visits: Array<{ date: string; value: number }>;
		pageViews: Array<{ date: string; value: number }>;
		granularity: 'daily' | 'monthly' | 'yearly';
	};
	breakdowns: {
		countries: AdminTrafficBreakdownCountry[];
		pages: AdminTrafficBreakdownPage[];
		devices: AdminTrafficBreakdownDevice[];
		referrers: AdminTrafficBreakdownReferrer[];
		events: AdminTrafficBreakdownEvent[];
	};
	filterOptions: {
		countries: string[];
		pages: string[];
		deviceTypes: string[];
	};
}

export type AdminTrafficBreakdownGroup = 'countries' | 'pages' | 'devices' | 'referrers' | 'events';

const PERIOD_LABELS: Record<AdminTrafficPeriod, string> = {
	'1d': 'Last 24 hours',
	'2d': 'Last 48 hours',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days',
	'90d': 'Last 90 days',
	'6m': 'Last 6 months',
	'12m': 'Last 12 months',
	lifetime: 'Lifetime',
	custom: 'Custom range'
};

export const ADMIN_TRAFFIC_PERIODS: AdminTrafficPeriodOption[] = [
	{ label: '24h', value: '1d', helper: PERIOD_LABELS['1d'] },
	{ label: '48h', value: '2d', helper: PERIOD_LABELS['2d'] },
	{ label: '7d', value: '7d', helper: PERIOD_LABELS['7d'] },
	{ label: '30d', value: '30d', helper: PERIOD_LABELS['30d'] },
	{ label: '90d', value: '90d', helper: PERIOD_LABELS['90d'] },
	{ label: '6m', value: '6m', helper: PERIOD_LABELS['6m'] },
	{ label: '12m', value: '12m', helper: PERIOD_LABELS['12m'] },
	{ label: 'Lifetime', value: 'lifetime', helper: PERIOD_LABELS.lifetime },
	{ label: 'Custom', value: 'custom', helper: PERIOD_LABELS.custom }
];

export const TRAFFIC_BREAKDOWN_GROUPS: AdminTrafficBreakdownGroup[] = [
	'countries',
	'pages',
	'devices',
	'referrers',
	'events'
];

export function getTrafficPeriodLabel(period: AdminTrafficPeriod): string {
	return PERIOD_LABELS[period] ?? 'Custom range';
}
