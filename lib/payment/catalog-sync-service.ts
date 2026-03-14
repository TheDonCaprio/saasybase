import { prisma } from '../prisma';
import { Logger } from '../logger';
import { PaymentProviderFactory } from './factory';
import { getProviderCurrency } from './registry';
import { setIdByProvider, providerSupportsOneTimePrices } from '../utils/provider-ids';
import { toError } from '../runtime-guards';

export async function syncPlansToProviders() {
  const autoCreate = process.env.STRIPE_AUTO_CREATE === '1' || process.env.STRIPE_AUTO_CREATE === 'true';
  if (!autoCreate) {
    Logger.info('Catalog sync skipped: STRIPE_AUTO_CREATE is not enabled');
    return;
  }

  const plans = await prisma.plan.findMany({ where: { active: true } });
  const configuredProviders = PaymentProviderFactory.getAllConfiguredProviders();

  if (configuredProviders.length === 0) {
    Logger.info('No payment providers configured for catalog sync.');
    return;
  }

  for (const plan of plans) {
    let externalPriceIds = plan.externalPriceIds;
    let externalProductIds = plan.externalProductIds;
    let updated = false;

    for (const { name: providerName, provider } of configuredProviders) {
      // Check if already synced for this provider
      const existingPriceId = JSON.parse(externalPriceIds || '{}')[providerName];
      if (existingPriceId) continue;

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
