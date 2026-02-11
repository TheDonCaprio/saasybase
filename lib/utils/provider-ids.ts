/**
 * Provider ID Map Utilities
 *
 * Helper functions for managing provider-keyed ID maps stored as JSON strings.
 * Used for multi-provider support where each payment provider (Stripe, Paystack, etc.)
 * may have its own customer ID, subscription ID, price ID, etc.
 */

export type ProviderIdMap = Record<string, string>;

/**
 * Parse a provider ID map from a stored value (string JSON or object).
 * Returns an empty object if the value is null, undefined, or invalid.
 */
export function parseProviderIdMap(value: unknown): ProviderIdMap {
  if (!value) return {};

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
        ) as ProviderIdMap;
      }
    } catch {
      return {};
    }
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
    ) as ProviderIdMap;
  }

  return {};
}

/**
 * Get an ID from the provider map for a specific provider key.
 * Falls back to checking against a legacy single-value field.
 */
export function getIdByProvider(
  map: unknown,
  providerKey: string,
  legacyValue?: string | null
): string | undefined {
  const parsed = parseProviderIdMap(map);
  const fromMap = parsed[providerKey];
  if (fromMap) return fromMap;
  if (legacyValue) return legacyValue;
  return undefined;
}

/**
 * Set an ID in the provider map for a specific provider key.
 * Returns the JSON string to store in the database.
 */
export function setIdByProvider(
  existingMap: unknown,
  providerKey: string,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const merged = parseProviderIdMap(existingMap);
  merged[providerKey] = value;
  return JSON.stringify(merged);
}

/**
 * Merge a new provider ID into an existing map.
 * Returns the JSON string to store in the database, or null if no value provided.
 */
export function mergeProviderIdMap(
  existing: unknown,
  providerKey: string,
  value?: string | null
): string | null {
  if (!value) return null;
  const merged = parseProviderIdMap(existing);
  merged[providerKey] = value;
  return JSON.stringify(merged);
}

/**
 * Check if a map contains a specific value (regardless of which provider key).
 * Useful for finding records by an external ID without knowing the provider.
 */
export function mapContainsValue(map: unknown, targetValue: string): boolean {
  return Object.values(parseProviderIdMap(map)).includes(targetValue);
}

/**
 * Find which provider key has a specific value in the map.
 * Returns the provider key or undefined if not found.
 */
export function findProviderByValue(map: unknown, targetValue: string): string | undefined {
  const parsed = parseProviderIdMap(map);
  for (const [key, val] of Object.entries(parsed)) {
    if (val === targetValue) return key;
  }
  return undefined;
}

/**
 * Get the current payment provider key from environment.
 */
export function getCurrentProviderKey(): string {
  return (process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();
}

/**
 * Check if a provider supports one-time price creation.
 * Some providers don't use catalog price objects for one-time payments.
 * - Paystack: one-time payments pass amount directly (no price object)
 * - Razorpay: one-time payments use Payment Links (amount-based), not catalog prices/plans
 */
export function providerSupportsOneTimePrices(providerName: string): boolean {
	const key = (providerName || '').toLowerCase();
	return key !== 'paystack' && key !== 'razorpay';
}
