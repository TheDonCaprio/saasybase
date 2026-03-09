import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendBillingNotification } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedInvoice, PaymentProvider } from './types';

export async function handleInvoiceCreatedCancellation(params: {
    invoice: StandardizedInvoice;
    getProviderForRecord: (paymentProvider: string | null | undefined) => PaymentProvider;
}): Promise<void> {
    const subscriptionId = params.invoice.subscriptionId;
    if (!subscriptionId) {
        Logger.info('Invoice created without subscription ID, skipping', { invoiceId: params.invoice.id });
        return;
    }

    try {
        const dbSub = await prisma.subscription.findFirst({
            where: {
                externalSubscriptionId: subscriptionId,
            },
            include: { plan: true, user: true }
        });

        if (!dbSub) {
            Logger.warn('Invoice created for unknown subscription', { subscriptionId, invoiceId: params.invoice.id });
            return;
        }

        if (!dbSub.cancelAtPeriodEnd) {
            Logger.info('Subscription not marked for cancel-at-period-end, allowing renewal', {
                subscriptionId,
                dbSubscriptionId: dbSub.id
            });
            return;
        }

        Logger.info('Subscription marked for cancel-at-period-end, disabling before charge', {
            subscriptionId,
            dbSubscriptionId: dbSub.id,
            invoiceId: params.invoice.id
        });

        const provider = params.getProviderForRecord(dbSub.paymentProvider);
        const externalSubId = dbSub.externalSubscriptionId;

        if (!externalSubId) {
            Logger.error('No external subscription ID found for cancel-at-period-end', { dbSubscriptionId: dbSub.id });
            return;
        }

        await provider.cancelSubscription(externalSubId, true);

        const now = new Date();
        const currentExpiresAt = dbSub.expiresAt;
        const shouldCancelImmediately = currentExpiresAt.getTime() <= now.getTime();
        const effectiveCancellationTime = shouldCancelImmediately ? now : currentExpiresAt;

        await prisma.subscription.update({
            where: { id: dbSub.id },
            data: {
                status: shouldCancelImmediately ? 'CANCELLED' : 'ACTIVE',
                canceledAt: effectiveCancellationTime,
                cancelAtPeriodEnd: false,
                scheduledPlanId: null,
                scheduledPlanDate: null,
            }
        });

        Logger.info('Successfully cancelled subscription at period end via invoice.created webhook', {
            subscriptionId: externalSubId,
            dbSubscriptionId: dbSub.id,
            userId: dbSub.userId
        });

        try {
            await sendBillingNotification({
                userId: dbSub.userId,
                title: 'Subscription Ended',
                message: `Your ${dbSub.plan.name} subscription has ended as scheduled.`,
                templateKey: 'subscription_ended',
                variables: {
                    planName: dbSub.plan.name
                }
            });
        } catch (notifErr) {
            Logger.warn('Failed to send subscription ended notification', {
                userId: dbSub.userId,
                error: toError(notifErr).message
            });
        }
    } catch (err) {
        Logger.error('Error handling invoice.created for cancel-at-period-end', {
            subscriptionId,
            invoiceId: params.invoice.id,
            error: toError(err).message
        });
    }
}