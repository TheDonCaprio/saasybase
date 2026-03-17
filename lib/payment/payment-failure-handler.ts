import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedPaymentFailed } from './types';

export async function handlePaymentFailureEvent(params: {
    payload: StandardizedPaymentFailed;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<{
        id: string;
        status: string;
        prorationPendingSince?: Date | null;
    } | null>;
}): Promise<void> {
    const { id, subscriptionId, customerId, errorMessage, errorCode, metadata } = params.payload;

    Logger.warn('Payment failed webhook received', {
        paymentId: id,
        subscriptionId,
        customerId,
        errorMessage,
        errorCode
    });

    let userId = metadata?.userId;
    if (!userId && customerId) {
        userId = await params.resolveUserByCustomerId(customerId) || undefined;
    }

    if (!userId) {
        Logger.warn('Payment failed for unknown user', { paymentId: id, customerId });
        return;
    }

    if (subscriptionId) {
        try {
            const dbSub = await params.findSubscriptionByProviderId(subscriptionId);
            if (dbSub) {
                const isProvisionallyPendingSwitch = dbSub.status === 'PENDING' && dbSub.prorationPendingSince instanceof Date;
                await prisma.subscription.update({
                    where: { id: dbSub.id },
                    data: isProvisionallyPendingSwitch
                        ? {
                            status: 'EXPIRED',
                            expiresAt: new Date(),
                            canceledAt: new Date(),
                            cancelAtPeriodEnd: false,
                            prorationPendingSince: null,
                        }
                        : { status: 'PAST_DUE' }
                });
                Logger.info(isProvisionallyPendingSwitch
                    ? 'Provisionally pending subscription expired after payment failure'
                    : 'Subscription marked as PAST_DUE due to payment failure', {
                    subscriptionId: dbSub.id,
                    externalId: subscriptionId
                });
            }
        } catch (err) {
            Logger.error('Failed to update subscription status on payment failure', {
                subscriptionId,
                error: toError(err).message
            });
        }
    }

    try {
        await sendBillingNotification({
            userId,
            title: 'Payment Failed',
            message: 'Your recent payment could not be processed. Please update your payment method to avoid service interruption.',
            templateKey: 'payment_failed',
            variables: {
                errorMessage: errorMessage || 'Payment declined',
                billingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/dashboard/billing`
            }
        });
    } catch (notifErr) {
        Logger.warn('Failed to send payment failure notification', {
            userId,
            paymentId: id,
            error: toError(notifErr).message
        });
    }

    try {
        await sendAdminNotificationEmail({
            title: 'Payment Failed',
            alertType: 'payment_failed',
            message: `A payment has failed.\n\nPayment ID: ${id}\nUser: ${userId}\nError: ${errorMessage || 'Unknown'}\nError Code: ${errorCode || 'N/A'}`
        });
    } catch {
    }
}