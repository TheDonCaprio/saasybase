import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger', () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('posthog analytics adapter', () => {
  const originalEnv = process.env;

  const currentDate = new Date();
  const currentDay = currentDate.toISOString().slice(0, 10);
  const previousDay = new Date(currentDate);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const previousDayString = previousDay.toISOString().slice(0, 10);

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      POSTHOG_PROJECT_ID: '12345',
      POSTHOG_PERSONAL_API_KEY: 'phx_test_personal_key',
      POSTHOG_APP_HOST: 'https://us.posthog.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('maps PostHog metrics into the shared traffic snapshot contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ results: [{ visits: 100, unique_visitors: 80, page_views: 250, avg_session_duration_seconds: 75, bounce_sessions: 40 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ label: 'United States', count: 70 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ label: '/pricing', count: 120 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ label: 'desktop', count: 60 }, { label: 'mobile', count: 40 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ label: 'google.com', count: 55 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ label: 'Signup', count: 15 }] }))
      .mockResolvedValueOnce(createJsonResponse({ results: [{ bucket: `${previousDayString}T00:00:00Z`, visits: 30, page_views: 70 }, { bucket: `${currentDay}T00:00:00Z`, visits: 70, page_views: 180 }] }));

    vi.stubGlobal('fetch', fetchMock);

    const { fetchPostHogTrafficSnapshot } = await import('../lib/posthog-analytics');
    const snapshot = await fetchPostHogTrafficSnapshot({ period: '7d' } as Parameters<typeof fetchPostHogTrafficSnapshot>[0]);

    expect(snapshot.totalVisits).toBe(100);
    expect(snapshot.uniqueVisitors).toBe(80);
    expect(snapshot.totalPageViews).toBe(250);
    expect(snapshot.averageSessionDurationSeconds).toBe(75);
    expect(snapshot.bounceRate).toBe(40);
    expect(snapshot.viewsPerVisit).toBe(2.5);
    expect(snapshot.newUsers).toBe(0);
    expect(snapshot.estimatedEngagedVisitRate).toBe(60);
    expect(snapshot.estimatedEngagedVisits).toBe(60);
    expect(snapshot.engagedSessions).toBe(60);
    expect(snapshot.engagementRate).toBe(60);
    expect(snapshot.provider.key).toBe('posthog');
    expect(snapshot.provider.metrics.find((metric) => metric.key === 'newUsers')?.replaces).toBe('bounceRate');
    expect(snapshot.provider.metrics.find((metric) => metric.key === 'engagementRate')?.replaces).toBe('estimatedEngagedVisitRate');
    expect(snapshot.topCountries).toEqual([{ country: 'United States', count: 70, percentage: 100 }]);
    expect(snapshot.topPages).toEqual([{ page: '/pricing', count: 120, percentage: 100 }]);
    expect(snapshot.deviceTypes).toEqual([
      { type: 'desktop', count: 60, percentage: 60 },
      { type: 'mobile', count: 40, percentage: 40 },
    ]);
    expect(snapshot.dailyVisits).toContainEqual({ date: previousDayString, visits: 30, pageViews: 70 });
    expect(snapshot.dailyVisits).toContainEqual({ date: currentDay, visits: 70, pageViews: 180 });

    const executedQueries = fetchMock.mock.calls.map(([, init]) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return body?.query?.query as string | undefined;
    });

    for (const query of executedQueries) {
      expect(query).not.toContain('countDistinct(');
    }
  });
});