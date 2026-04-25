import { getSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';

export type TrafficAnalyticsProviderKey = 'google-analytics' | 'posthog';

export interface TrafficAnalyticsProviderResolution {
  provider: TrafficAnalyticsProviderKey;
  source: 'setting' | 'env' | 'default';
  rawValue: string;
}

export interface TrafficAnalyticsClientConfig {
  provider: TrafficAnalyticsProviderKey;
  source: 'setting' | 'env' | 'default';
  googleAnalytics: {
    measurementId: string | null;
    shouldInject: boolean;
  };
  postHog: {
    projectApiKey: string | null;
    apiHost: string;
    shouldInject: boolean;
  };
}

export interface TrafficAnalyticsProviderHealth {
  activeProvider: TrafficAnalyticsProviderResolution;
  googleAnalytics: {
    available: boolean;
    measurementIdSet: boolean;
    propertyIdSet: boolean;
    credentialsSet: boolean;
  };
  postHog: {
    available: boolean;
    projectIdSet: boolean;
    personalApiKeySet: boolean;
    projectApiKeySet: boolean;
    appHost: string;
    apiHost: string;
  };
}

const DEFAULT_PROVIDER = SETTING_DEFAULTS[SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER] as TrafficAnalyticsProviderKey;

export function normalizeTrafficAnalyticsProvider(value: unknown): TrafficAnalyticsProviderKey {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'posthog' || normalized === 'plausible' ? 'posthog' : 'google-analytics';
}

export async function resolveTrafficAnalyticsProvider(): Promise<TrafficAnalyticsProviderResolution> {
  const defaultValue = DEFAULT_PROVIDER;
  const envValue = process.env.TRAFFIC_ANALYTICS_PROVIDER?.trim() || '';
  const storedValue = await getSetting(SETTING_KEYS.TRAFFIC_ANALYTICS_PROVIDER, envValue || defaultValue);
  const normalized = normalizeTrafficAnalyticsProvider(storedValue || envValue || defaultValue);

  if (storedValue && storedValue.trim().length > 0) {
    if (envValue && storedValue.trim().toLowerCase() === envValue.toLowerCase()) {
      return { provider: normalized, source: 'env', rawValue: storedValue };
    }
    if (!envValue && storedValue.trim().toLowerCase() === defaultValue.toLowerCase()) {
      return { provider: normalized, source: 'default', rawValue: storedValue };
    }
    return { provider: normalized, source: 'setting', rawValue: storedValue };
  }

  if (envValue) {
    return { provider: normalizeTrafficAnalyticsProvider(envValue), source: 'env', rawValue: envValue };
  }

  return { provider: defaultValue, source: 'default', rawValue: defaultValue };
}

export async function getTrafficAnalyticsClientConfig(): Promise<TrafficAnalyticsClientConfig> {
  const resolution = await resolveTrafficAnalyticsProvider();
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || null;
  const postHogApiHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(/\/$/, '');
  const postHogProjectApiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || null;

  return {
    provider: resolution.provider,
    source: resolution.source,
    googleAnalytics: {
      measurementId,
      shouldInject: resolution.provider === 'google-analytics' && Boolean(measurementId),
    },
    postHog: {
      projectApiKey: postHogProjectApiKey,
      apiHost: postHogApiHost,
      shouldInject: resolution.provider === 'posthog' && Boolean(postHogProjectApiKey),
    },
  };
}

export async function getTrafficAnalyticsProviderHealth(): Promise<TrafficAnalyticsProviderHealth> {
  const resolution = await resolveTrafficAnalyticsProvider();
  const measurementIdSet = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim());
  const propertyIdSet = Boolean(process.env.GA_PROPERTY_ID?.trim());
  const credentialsSet = Boolean(process.env.GA_SERVICE_ACCOUNT_CREDENTIALS_B64?.trim());
  const projectIdSet = Boolean(process.env.POSTHOG_PROJECT_ID?.trim());
  const personalApiKeySet = Boolean(process.env.POSTHOG_PERSONAL_API_KEY?.trim());
  const projectApiKeySet = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim());
  const appHost = (process.env.POSTHOG_APP_HOST?.trim() || 'https://us.posthog.com').replace(/\/$/, '');
  const apiHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(/\/$/, '');

  return {
    activeProvider: resolution,
    googleAnalytics: {
      available: measurementIdSet && propertyIdSet && credentialsSet,
      measurementIdSet,
      propertyIdSet,
      credentialsSet,
    },
    postHog: {
      available: projectIdSet && personalApiKeySet && projectApiKeySet,
      projectIdSet,
      personalApiKeySet,
      projectApiKeySet,
      appHost,
      apiHost,
    },
  };
}