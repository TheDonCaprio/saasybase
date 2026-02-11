import { Logger } from './logger';

export type MetricTags = Record<string, string | number | boolean | null | undefined>;

function normalizeTags(tags?: MetricTags): Record<string, string> | undefined {
  if (!tags) return undefined;
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(tags)) {
    if (rawValue === undefined) continue;
    if (rawValue === null) {
      result[key] = 'null';
      continue;
    }
    if (typeof rawValue === 'boolean') {
      result[key] = rawValue ? 'true' : 'false';
      continue;
    }
    result[key] = String(rawValue);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function incrementMetric(name: string, value = 1, tags?: MetricTags): void {
  if (!name) return;

  const payload = {
    name,
    value,
    tags: normalizeTags(tags)
  };

  if (process.env.NODE_ENV === 'development') {
    Logger.debug('Metric increment', payload);
  }

  // TODO: Integrate with real metrics backend (StatsD/OpenTelemetry/Datadog) when available.
}
