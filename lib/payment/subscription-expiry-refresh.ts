import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';
import type { PaymentProvider } from './types';

export async function refreshSubscriptionExpiryFromProvider(params: {
    dbSubscriptionId: string;
    providerSubscriptionId: string;
    wasLocallyExpired: boolean;
    resurrectOnlyIfFuture: boolean;
    warnMessage: string;
    provider: PaymentProvider;
    markSubscriptionActive: (dbSubscriptionId: string, expiresAt?: Date) => Promise<void>;
}): Promise<{ refreshedPeriodEnd: Date | null; resurrected: boolean }> {
    try {
        const providerSub = await params.provider.getSubscription(params.providerSubscriptionId);
        const refreshedPeriodEnd = providerSub?.currentPeriodEnd ?? null;

        if (!refreshedPeriodEnd) {
            return { refreshedPeriodEnd: null, resurrected: false };
        }

        const shouldResurrect = params.wasLocallyExpired
            && (!params.resurrectOnlyIfFuture || refreshedPeriodEnd.getTime() > Date.now());

        if (shouldResurrect) {
            await params.markSubscriptionActive(params.dbSubscriptionId, refreshedPeriodEnd);
        } else {
            await prisma.subscription.update({
                where: { id: params.dbSubscriptionId },
                data: { expiresAt: refreshedPeriodEnd }
            });
        }

        return { refreshedPeriodEnd, resurrected: shouldResurrect };
    } catch (err) {
        Logger.warn(params.warnMessage, {
            subscriptionId: params.providerSubscriptionId,
            error: toError(err).message
        });
        return { refreshedPeriodEnd: null, resurrected: false };
    }
}