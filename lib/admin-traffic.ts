export {
	ADMIN_TRAFFIC_PERIODS,
	TRAFFIC_BREAKDOWN_GROUPS,
	getTrafficPeriodLabel,
	type AdminTrafficMetricKey,
	type AdminTrafficMetricValueMap,
	type AdminTrafficBreakdownCountry,
	type AdminTrafficBreakdownDevice,
	type AdminTrafficBreakdownEvent,
	type AdminTrafficBreakdownPage,
	type AdminTrafficBreakdownReferrer,
	type AdminTrafficBreakdownGroup,
	type AdminTrafficFilters,
	type AdminTrafficPeriod,
	type AdminTrafficPeriodOption,
	type AdminTrafficProviderMeta,
	type AdminTrafficResponse
} from './admin-traffic-contract';

import {
	type AdminTrafficFilters,
	type AdminTrafficMetricValueMap,
	type AdminTrafficPeriod,
	type AdminTrafficProviderMeta,
	type AdminTrafficResponse
} from './admin-traffic-contract';
import {
	fetchTrafficSnapshotFromProvider,
	getActiveTrafficProviderMeta,
	type TrafficFilters
} from './traffic-analytics-provider';
import { errorToLogDetails, toError } from './runtime-guards';
import { Logger } from './logger';

const ALLOWED_PERIODS: AdminTrafficPeriod[] = ['1d', '2d', '7d', '30d', '90d', '6m', '12m', 'lifetime', 'custom'];
const DEFAULT_PERIOD: AdminTrafficPeriod = '30d';

const DEVICE_FALLBACK_OPTIONS: string[] = ['desktop', 'mobile', 'tablet'];

function buildMetricValues(input: {
	visits: number;
	uniqueVisitors: number;
	pageViews: number;
	newUsers: number;
	engagedSessions: number;
	engagementRate: number;
	averageSessionDurationSeconds: number;
	bounceRate?: number;
	viewsPerVisit?: number;
	estimatedEngagedVisits?: number;
	estimatedEngagedVisitRate?: number;
}): AdminTrafficMetricValueMap {
	return {
		visits: input.visits,
		uniqueVisitors: input.uniqueVisitors,
		pageViews: input.pageViews,
		newUsers: input.newUsers,
		engagedSessions: input.engagedSessions,
		engagementRate: input.engagementRate,
		averageSessionDurationSeconds: input.averageSessionDurationSeconds,
		bounceRate: input.bounceRate,
		viewsPerVisit: input.viewsPerVisit,
		estimatedEngagedVisits: input.estimatedEngagedVisits,
		estimatedEngagedVisitRate: input.estimatedEngagedVisitRate,
	};
}

const sanitiseString = (value?: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const sanitiseDeviceType = (value?: string | null): string | undefined => {
	const base = sanitiseString(value)?.toLowerCase();
	if (!base) {
		return undefined;
	}
	return base;
};

export function normalizeTrafficFilters(input: Partial<AdminTrafficFilters> = {}): AdminTrafficFilters {
	const requestedPeriod = input.period && ALLOWED_PERIODS.includes(input.period) ? input.period : DEFAULT_PERIOD;
	const normalized: AdminTrafficFilters = {
		period: requestedPeriod,
		country: sanitiseString(input.country),
		page: sanitiseString(input.page),
		deviceType: sanitiseDeviceType(input.deviceType)
	};

	if (requestedPeriod === 'custom') {
		const startDate = sanitiseString(input.startDate);
		const endDate = sanitiseString(input.endDate);
		if (!startDate || !endDate) {
			throw new Error('Custom period requires start and end dates');
		}
		normalized.startDate = startDate;
		normalized.endDate = endDate;
	}

	return normalized;
}

const toShare = (total: number, part: number): number => {
	if (!Number.isFinite(total) || total <= 0) {
		return 0;
	}
	return (part / total) * 100;
};

const uniqueList = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

function buildFallbackRange(filters: AdminTrafficFilters): AdminTrafficResponse['range'] {
	const now = new Date();
	const end = new Date(now);
	end.setHours(23, 59, 59, 999);

	if (filters.period === 'custom' && filters.startDate && filters.endDate) {
		const start = new Date(`${filters.startDate}T00:00:00`);
		const customEnd = new Date(`${filters.endDate}T23:59:59.999`);
		const validStart = Number.isNaN(start.getTime()) ? end : start;
		const validEnd = Number.isNaN(customEnd.getTime()) ? end : customEnd;
		const days = Math.max(1, Math.floor((validEnd.getTime() - validStart.getTime()) / 86_400_000) + 1);
		return {
			start: validStart.toISOString(),
			end: validEnd.toISOString(),
			days,
		};
	}

	const daysByPeriod: Record<Exclude<AdminTrafficPeriod, 'custom'>, number> = {
		'1d': 1,
		'2d': 2,
		'7d': 7,
		'30d': 30,
		'90d': 90,
		'6m': 180,
		'12m': 365,
		lifetime: 365,
	};
	const days = daysByPeriod[filters.period as Exclude<AdminTrafficPeriod, 'custom'>] ?? 30;
	const start = new Date(end);
	start.setDate(start.getDate() - (days - 1));
	start.setHours(0, 0, 0, 0);

	return {
		start: start.toISOString(),
		end: end.toISOString(),
		days,
	};
}

function buildEmptyTrafficResponse(
	filters: AdminTrafficFilters,
	provider: AdminTrafficProviderMeta,
	notice?: AdminTrafficResponse['notice']
): AdminTrafficResponse {
	const range = buildFallbackRange(filters);

	return {
		period: filters.period,
		filters,
		provider,
		notice,
		metricValues: buildMetricValues({
			visits: 0,
			uniqueVisitors: 0,
			pageViews: 0,
			newUsers: 0,
			engagedSessions: 0,
			engagementRate: 0,
			averageSessionDurationSeconds: 0,
			bounceRate: 0,
			viewsPerVisit: 0,
			estimatedEngagedVisits: 0,
			estimatedEngagedVisitRate: 0,
		}),
		range,
		totals: {
			visits: 0,
			uniqueVisitors: 0,
			pageViews: 0,
			newUsers: 0,
			engagedSessions: 0,
			engagementRate: 0,
			averageSessionDurationSeconds: 0,
		},
		derived: {
			dailyVisits: 0,
			uniqueVisitorShare: 0,
			newUserShare: 0,
			engagedSessionShare: 0,
		},
		charts: {
			visits: [],
			pageViews: [],
			granularity: 'daily',
		},
		breakdowns: {
			countries: [],
			pages: [],
			devices: [],
			referrers: [],
			events: [],
		},
		filterOptions: {
			countries: [],
			pages: [],
			deviceTypes: uniqueList([...DEVICE_FALLBACK_OPTIONS]),
		},
	};
}

function isProviderConfigurationError(message: string): boolean {
	return message === 'PostHog configuration missing' || message === 'GA configuration missing';
}

function buildUnavailableNotice(
	provider: AdminTrafficProviderMeta,
	errorMessage: string
): AdminTrafficResponse['notice'] {
	if (isProviderConfigurationError(errorMessage)) {
		return {
			level: 'warning',
			code: 'provider-configuration-missing',
			title: `${provider.label} is not configured`,
			message: `The traffic dashboard is showing fallback empty data because ${provider.label} is selected but its required credentials are missing.`,
		};
	}

	return {
		level: 'warning',
		code: 'provider-request-failed',
		title: `${provider.label} data is temporarily unavailable`,
		message: `The traffic dashboard is showing fallback empty data because the latest ${provider.label} request failed.`,
	};
}

export async function getAdminTrafficSnapshot(
	filters: Partial<AdminTrafficFilters> = {}
): Promise<AdminTrafficResponse> {
	const normalizedFilters = normalizeTrafficFilters(filters);

	try {
		const snapshot = await fetchTrafficSnapshotFromProvider(normalizedFilters as TrafficFilters);

		const visits = snapshot.totalVisits;
		const uniqueVisitors = snapshot.uniqueVisitors;
		const pageViews = snapshot.totalPageViews;
		const newUsers = snapshot.newUsers;
		const engagedSessions = snapshot.engagedSessions;
		const engagementRate = snapshot.engagementRate;
		const avgSessionDuration = snapshot.averageSessionDurationSeconds;
		const daysInRange = snapshot.daysInRange > 0 ? snapshot.daysInRange : 1;

		const countries = snapshot.topCountries.map((country) => ({
			name: country.country || 'Unknown',
			visits: country.count,
			share: Number.isFinite(country.percentage) ? country.percentage : 0
		}));

		const pages = snapshot.topPages.map((page) => ({
			path: page.page || 'Unknown page',
			views: page.count,
			share: Number.isFinite(page.percentage) ? page.percentage : 0
		}));

		const devices = snapshot.deviceTypes.map((device) => ({
			type: device.type || 'Unknown',
			sessions: device.count,
			share: Number.isFinite(device.percentage) ? device.percentage : 0
		}));

		const referrers = snapshot.topReferrers.map((referrer) => ({
			label: referrer.referrer || '(direct)',
			sessions: referrer.count,
			share: Number.isFinite(referrer.percentage) ? referrer.percentage : 0
		}));

		const events = snapshot.topEvents.map((event) => ({
			name: event.event || 'unknown',
			count: event.count
		}));

		const visitsSeries = snapshot.dailyVisits.map((entry) => ({
			date: entry.date,
			value: entry.visits
		}));

		const pageViewsSeries = snapshot.dailyVisits.map((entry) => ({
			date: entry.date,
			value: entry.pageViews ?? entry.visits
		}));

		const filterCountries = uniqueList(countries.map((country) => country.name));
		const filterPages = uniqueList(pages.map((page) => page.path));
		const filterDeviceTypes = uniqueList([
			...devices.map((device) => device.type.toLowerCase()),
			...DEVICE_FALLBACK_OPTIONS
		]);

		return {
			period: normalizedFilters.period,
			filters: normalizedFilters,
			provider: snapshot.provider as AdminTrafficProviderMeta,
			metricValues: buildMetricValues({
				visits,
				uniqueVisitors,
				pageViews,
				newUsers,
				engagedSessions,
				engagementRate,
				averageSessionDurationSeconds: avgSessionDuration,
				bounceRate: snapshot.bounceRate,
				viewsPerVisit: snapshot.viewsPerVisit,
				estimatedEngagedVisits: snapshot.estimatedEngagedVisits,
				estimatedEngagedVisitRate: snapshot.estimatedEngagedVisitRate
			}),
			range: {
				start: snapshot.rangeStart,
				end: snapshot.rangeEnd,
				days: daysInRange
			},
			totals: {
				visits,
				uniqueVisitors,
				pageViews,
				newUsers,
				engagedSessions,
				engagementRate,
				averageSessionDurationSeconds: avgSessionDuration
			},
			derived: {
				dailyVisits: daysInRange > 0 ? visits / daysInRange : 0,
				uniqueVisitorShare: toShare(visits, uniqueVisitors),
				newUserShare: toShare(visits, newUsers),
				engagedSessionShare: toShare(visits, engagedSessions)
			},
			charts: {
				visits: visitsSeries,
				pageViews: pageViewsSeries,
				granularity: snapshot.timeseriesGranularity
			},
			breakdowns: {
				countries,
				pages,
				devices,
				referrers,
				events
			},
			filterOptions: {
				countries: filterCountries,
				pages: filterPages,
				deviceTypes: uniqueList(filterDeviceTypes)
			}
		};
	} catch (error: unknown) {
		const resolvedError = toError(error);
		const provider = await getActiveTrafficProviderMeta().catch(() => ({
			key: 'google-analytics',
			label: 'Google Analytics',
			metrics: [],
		} as AdminTrafficProviderMeta));
		const notice = buildUnavailableNotice(provider, resolvedError.message);

		if (isProviderConfigurationError(resolvedError.message)) {
			Logger.warn('getAdminTrafficSnapshot unavailable due to provider configuration; returning empty snapshot', {
				error: errorToLogDetails(resolvedError),
				filters: normalizedFilters,
				provider: provider.key,
			});
		} else {
			Logger.error('getAdminTrafficSnapshot failed; returning empty snapshot', {
				error: errorToLogDetails(resolvedError),
				filters: normalizedFilters,
				provider: provider.key,
			});
		}

		return buildEmptyTrafficResponse(normalizedFilters, provider, notice);
	}
}
