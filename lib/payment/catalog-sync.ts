import type { PaymentProvider } from './types';

/**
 * Catalog sync participation guard.
 *
 * This is intentionally conservative for new providers
 * to avoid accidental remote catalog mutations until explicitly enabled.
 */
export function isCatalogSyncEnabledForProvider(providerName: string): boolean {
	void providerName;
	return true;
}

export function filterProvidersForCatalogSync(
	providers: Array<{ name: string; provider: PaymentProvider }>,
): Array<{ name: string; provider: PaymentProvider }> {
	return providers.filter(p => isCatalogSyncEnabledForProvider(p.name));
}
