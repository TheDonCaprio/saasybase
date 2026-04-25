import type {
  AdminTrafficMetricKey,
  AdminTrafficProviderMetricDescriptor,
  AdminTrafficResponse,
} from './admin-traffic-contract';

export function getMetricDescriptor(
  data: AdminTrafficResponse,
  key: AdminTrafficMetricKey,
): AdminTrafficProviderMetricDescriptor & { key: AdminTrafficMetricKey } {
  const descriptor = data.provider.metrics.find((metric) => metric.key === key);
  if (descriptor?.supported) {
    return descriptor;
  }

  if (descriptor?.replaces) {
    const replacement = data.provider.metrics.find((metric) => metric.key === descriptor.replaces);
    if (replacement) {
      return replacement as AdminTrafficProviderMetricDescriptor & { key: AdminTrafficMetricKey };
    }
  }

  return (descriptor ?? {
    key,
    label: key,
    supported: true,
  }) as AdminTrafficProviderMetricDescriptor & { key: AdminTrafficMetricKey };
}