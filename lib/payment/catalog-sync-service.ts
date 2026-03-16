import { prisma } from '../prisma';
import { Logger } from '../logger';
import { PaymentProviderFactory } from './factory';
import { getProviderCurrency } from './registry';
import {
  parseProviderIdMap,
  removeIdByProvider,
  setIdByProvider,
  providerSupportsOneTimePrices,
  isProviderPriceIdCompatible,
  isProviderProductIdCompatible,
} from '../utils/provider-ids';
import { toError } from '../runtime-guards';

function isTruthyEnv(value: string | undefined) {
  return value === '1' || value === 'true';
}

function isCatalogSyncEnabledForConfiguredProviders(providerNames: string[]) {
  if (isTruthyEnv(process.env.PAYMENT_AUTO_CREATE)) {
    return true;
  }

  for (const providerName of providerNames) {
    const providerKey = providerName.toUpperCase();
    if (isTruthyEnv(process.env[`${providerKey}_AUTO_CREATE`])) {
      return true;
    }
  }

  // Backward compatibility for existing Stripe-based setups.
  return isTruthyEnv(process.env.STRIPE_AUTO_CREATE);
}

export async function syncPlansToProviders() {
  const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();
  const configuredProviderNames = configuredProviders.map(({ name }) => name);

  if (!isCatalogSyncEnabledForConfiguredProviders(configuredProviderNames)) {
    Logger.info('Catalog sync skipped: enable PAYMENT_AUTO_CREATE or a provider-specific *_AUTO_CREATE flag', {
      configuredProviders: configuredProviderNames,
    });
    return;
  }

  const plans = await prisma.plan.findMany({ where: { active: true } });

  if (configuredProviders.length === 0) {
    Logger.info('No payment providers configured for catalog sync.');
    return;
  }

  for (const plan of plans) {
    let externalPriceIds = plan.externalPriceIds;
    let externalProductIds = plan.externalProductIds;
    let updated = false;

    for (const { name: providerName, provider } of configuredProviders) {
      const existingPriceId = parseProviderIdMap(externalPriceIds)[providerName];
      const existingProductId = parseProviderIdMap(externalProductIds)[providerName];
      const recurring = plan.autoRenew === true;

      if (existingPriceId && isProviderPriceIdCompatible(providerName, existingPriceId, { recurring })) {
        continue;
      }

      if (existingPriceId || existingProductId) {
        Logger.warn('Removing stale provider catalog mapping before re-sync', {
          planName: plan.name,
          provider: providerName,
          existingPriceId,
          existingProductId,
          priceLooksCompatible: isProviderPriceIdCompatible(providerName, existingPriceId, { recurring }),
          productLooksCompatible: isProviderProductIdCompatible(providerName, existingProductId),
        });

        externalPriceIds = removeIdByProvider(externalPriceIds, providerName);
        externalProductIds = removeIdByProvider(externalProductIds, providerName);
      }

      try {
        // Skip one-time price creation for providers that don't support it
        const isOneTime = !plan.autoRenew;
        if (isOneTime && !providerSupportsOneTimePrices(providerName)) {
            continue;
        }

        Logger.info('Syncing plan to provider', { planName: plan.name, provider: providerName });

        // 1. Create Product
        let productId = '';
        if (providerName !== 'razorpay') {
            productId = await provider.createProduct({
                name: plan.name,
                description: plan.shortDescription || undefined
            });
        }

        // 2. Create Price
        const currency = getProviderCurrency(providerName);
        const price = await provider.createPrice({
            unitAmount: plan.priceCents,
            currency,
            productId,
            recurring: plan.autoRenew
                ? {
                    interval: plan.recurringInterval as 'day' | 'week' | 'month' | 'year',
                    intervalCount: plan.recurringIntervalCount,
                }
                : undefined,
            metadata: { name: plan.name }
        });

        // Update local maps
        externalPriceIds = setIdByProvider(externalPriceIds, providerName, price.id) || null;
        const productIdToSave = providerName === 'razorpay' ? (price.productId || null) : productId;
        if (productIdToSave) {
            externalProductIds = setIdByProvider(externalProductIds, providerName, productIdToSave) || null;
        }
        updated = true;

        Logger.info('Successfully synced plan to provider', { 
            planName: plan.name, 
            provider: providerName,
            priceId: price.id
        });

      } catch (err) {
        Logger.error('Failed to sync plan to provider', {
            planName: plan.name,
            provider: providerName,
            error: toError(err).message
        });
      }
    }

    if (updated) {
        const activeProvider = (process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase();
        const priceMap = JSON.parse(externalPriceIds || '{}');
        const activePriceId = priceMap[activeProvider];

        await prisma.plan.update({
            where: { id: plan.id },
            data: {
                externalPriceIds,
                externalProductIds,
                ...(activePriceId ? { externalPriceId: activePriceId } : {})
            }
        });
    }
  }
}
