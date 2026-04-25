import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchTrafficSnapshotFromProviderMock = vi.fn();
const getActiveTrafficProviderMetaMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('../lib/traffic-analytics-provider', () => ({
	fetchTrafficSnapshotFromProvider: fetchTrafficSnapshotFromProviderMock,
	getActiveTrafficProviderMeta: getActiveTrafficProviderMetaMock,
}));

vi.mock('../lib/logger', () => ({
	Logger: {
		warn: loggerWarnMock,
		error: loggerErrorMock,
	},
}));

describe('admin traffic fallback handling', () => {
	beforeEach(() => {
		vi.resetModules();
		fetchTrafficSnapshotFromProviderMock.mockReset();
		getActiveTrafficProviderMetaMock.mockReset();
		loggerWarnMock.mockReset();
		loggerErrorMock.mockReset();
		getActiveTrafficProviderMetaMock.mockResolvedValue({
			key: 'posthog',
			label: 'PostHog',
			externalDashboardUrl: 'https://us.posthog.com',
			metrics: [
				{ key: 'visits', label: 'Visits', supported: true },
				{ key: 'bounceRate', label: 'Bounce rate', supported: true },
			],
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns an empty snapshot when the selected provider is not configured', async () => {
		fetchTrafficSnapshotFromProviderMock.mockRejectedValue(new Error('PostHog configuration missing'));

		const { getAdminTrafficSnapshot } = await import('../lib/admin-traffic');
		const snapshot = await getAdminTrafficSnapshot({ period: '30d' });

		expect(snapshot.provider.key).toBe('posthog');
		expect(snapshot.notice).toEqual({
			level: 'warning',
			code: 'provider-configuration-missing',
			title: 'PostHog is not configured',
			message: 'The traffic dashboard is showing fallback empty data because PostHog is selected but its required credentials are missing.',
		});
		expect(snapshot.totals).toEqual({
			visits: 0,
			uniqueVisitors: 0,
			pageViews: 0,
			newUsers: 0,
			engagedSessions: 0,
			engagementRate: 0,
			averageSessionDurationSeconds: 0,
		});
		expect(snapshot.charts.visits).toEqual([]);
		expect(snapshot.filterOptions.deviceTypes).toEqual(['desktop', 'mobile', 'tablet']);
		expect(snapshot.range.days).toBe(30);
		expect(loggerWarnMock).toHaveBeenCalledWith(
			'getAdminTrafficSnapshot unavailable due to provider configuration; returning empty snapshot',
			expect.objectContaining({ provider: 'posthog' })
		);
		expect(loggerErrorMock).not.toHaveBeenCalled();
	});
});