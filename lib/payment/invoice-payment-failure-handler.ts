import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedInvoice } from './types';

export async function handleInvoicePaymentFailureEvent(params: {
    invoice: StandardizedInvoice;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<{ id: string } | null>;
}): Promise<void> {
    const { id, subscriptionId, customerId, userEmail } = params.invoice;

    Logger.warn('Invoice payment failed webhook received', {
        invoiceId: id,
        subscriptionId,
        customerId
    });

    let userId: string | undefined;
    if (customerId) {
        userId = await params.resolveUserByCustomerId(customerId) || undefined;
    }
    if (!userId && userEmail) {
        const userByEmail = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
        userId = userByEmail?.id;
    }

    if (!userId) {
        Logger.warn('Invoice payment failed for unknown user', { invoiceId: id, customerId, userEmail });
        return;
    }

    if (subscriptionId) {
        try {
            const dbSub = await params.findSubscriptionByProviderId(subscriptionId);
            if (dbSub) {
                await prisma.subscription.update({
                    where: { id: dbSub.id },
                    data: { status: 'PAST_DUE' }
                });
                Logger.info('Subscription marked as PAST_DUE due to invoice payment failure', {
                    subscriptionId: dbSub.id,
                    externalId: subscriptionId,
                    invoiceId: id
                });
            }
        } catch (err) {
            Logger.error('Failed to update subscription status on invoice payment failure', {
                invoiceId: id,
                subscriptionId,
                error: toError(err).message
            });
        }
    }

    try {
        await sendBillingNotification({
            userId,
            title: 'Subscription Payment Failed',
            message: 'We were unable to process your subscription payment. Please update your payment method to continue your service.',
            templateKey: 'invoice_payment_failed',
            variables: {
                billingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/dashboard/billing`
            }
        });
    } catch (notifErr) {
        Logger.warn('Failed to send invoice payment failure notification', {
            userId,
            invoiceId: id,
            error: toError(notifErr).message
        });
    }

    try {
        await sendAdminNotificationEmail({
            title: 'Subscription Payment Failed',
            alertType: 'payment_failed',
            message: `A subscription payment has failed.\n\nInvoice ID: ${id}\nSubscription ID: ${subscriptionId || 'N/A'}\nUser: ${userId}\nEmail: ${userEmail || 'N/A'}`
        });
    } catch {
    }
}