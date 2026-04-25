import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSettingMock = vi.fn();

vi.mock('../lib/settings', () => ({
  SETTING_KEYS: {
    TRAFFIC_ANALYTICS_PROVIDER: 'TRAFFIC_ANALYTICS_PROVIDER',
  },
  SETTING_DEFAULTS: {
    TRAFFIC_ANALYTICS_PROVIDER: 'google-analytics',
  },
  getSetting: getSettingMock,
}));

describe('traffic analytics config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    getSettingMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.TRAFFIC_ANALYTICS_PROVIDER;
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prefers the persisted provider setting over the env fallback', async () => {
    process.env.TRAFFIC_ANALYTICS_PROVIDER = 'google-analytics';
    getSettingMock.mockResolvedValue('posthog');

    const { resolveTrafficAnalyticsProvider } = await import('../lib/traffic-analytics-config');
    const result = await resolveTrafficAnalyticsProvider();

    expect(result).toEqual({
      provider: 'posthog',
      source: 'setting',
      rawValue: 'posthog',
    });
  });

  it('normalizes a stale plausible setting onto posthog', async () => {
    getSettingMock.mockResolvedValue('plausible');

    const { resolveTrafficAnalyticsProvider } = await import('../lib/traffic-analytics-config');
    const result = await resolveTrafficAnalyticsProvider();

    expect(result).toEqual({
      provider: 'posthog',
      source: 'setting',
      rawValue: 'plausible',
    });
  });

  it('uses the env-backed provider when the stored value matches the env fallback', async () => {
    process.env.TRAFFIC_ANALYTICS_PROVIDER = 'posthog';
    getSettingMock.mockResolvedValue('posthog');

    const { resolveTrafficAnalyticsProvider } = await import('../lib/traffic-analytics-config');
    const result = await resolveTrafficAnalyticsProvider();

    expect(result).toEqual({
      provider: 'posthog',
      source: 'env',
      rawValue: 'posthog',
    });
  });

  it('builds a posthog client config that injects the client snippet', async () => {
    process.env.TRAFFIC_ANALYTICS_PROVIDER = 'posthog';
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com/';
    getSettingMock.mockResolvedValue('posthog');

    const { getTrafficAnalyticsClientConfig } = await import('../lib/traffic-analytics-config');
    const config = await getTrafficAnalyticsClientConfig();

    expect(config.provider).toBe('posthog');
    expect(config.postHog).toEqual({
      projectApiKey: 'phc_test_key',
      apiHost: 'https://eu.i.posthog.com',
      shouldInject: true,
    });
    expect(config.googleAnalytics.shouldInject).toBe(false);
  });
});