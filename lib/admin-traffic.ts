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
import { fetchTrafficSnapshotFromProvider, type TrafficFilters } from './traffic-analytics-provider';
import { toError } from './runtime-guards';
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
		Logger.error('getAdminTrafficSnapshot failed', { error: toError(error), filters: normalizedFilters });
		throw error;
	}
}
