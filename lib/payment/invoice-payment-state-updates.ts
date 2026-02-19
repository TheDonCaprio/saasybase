import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';

type InvoicePaymentStateSubscriptionShape = {
    id: string;
    status: string;
    prorationPendingSince: Date | null;
};

export async function applyInvoicePaymentStateUpdates<TSub extends InvoicePaymentStateSubscriptionShape>(params: {
    dbSub: TSub;
    paymentCreated: boolean;
    subscriptionId: string;
    paymentIntentId: string;
}): Promise<TSub> {
    let nextDbSub = params.dbSub;

    if (nextDbSub.prorationPendingSince) {
        try {
            await prisma.subscription.update({
                where: { id: nextDbSub.id },
                data: { prorationPendingSince: null },
            });
            Logger.info('Cleared prorationPendingSince after invoice payment', {
                subscriptionId: params.subscriptionId,
                dbSubscriptionId: nextDbSub.id,
            });
        } catch (err) {
            Logger.warn('Failed to clear prorationPendingSince', { error: toError(err).message });
        }
    }

    if (nextDbSub.status === 'PENDING' && params.paymentCreated) {
        await prisma.subscription.update({
            where: { id: nextDbSub.id },
            data: { status: 'ACTIVE' },
        });
        nextDbSub = {
            ...nextDbSub,
            status: 'ACTIVE',
        } as TSub;

        Logger.info('Activated pending subscription after successful invoice payment', {
            subscriptionId: params.subscriptionId,
            paymentIntentId: params.paymentIntentId,
            dbSubscriptionId: nextDbSub.id,
        });
    }

    return nextDbSub;
}