import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendBillingNotification } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedInvoice } from './types';

type InvoiceUpcomingSubscriptionShape = {
    id: string;
    userId: string;
    planId: string;
    status: string;
    expiresAt: Date;
    plan: {
        name: string;
        autoRenew: boolean;
    };
};

export async function handleInvoiceUpcomingReminder(params: {
    invoice: StandardizedInvoice;
    ensureProviderBackedSubscription: (
        subscriptionId: string,
        context: { invoice?: StandardizedInvoice }
    ) => Promise<InvoiceUpcomingSubscriptionShape | null>;
}): Promise<void> {
    const subscriptionId = params.invoice.subscriptionId;
    if (!subscriptionId) return;

    try {
        let dbSub = await prisma.subscription.findUnique({
            where: { externalSubscriptionId: subscriptionId },
            include: { plan: true }
        }) as InvoiceUpcomingSubscriptionShape | null;

        if (!dbSub) {
            dbSub = await params.ensureProviderBackedSubscription(subscriptionId, { invoice: params.invoice });
            if (!dbSub) {
                Logger.warn('Upcoming invoice for unknown subscription', { subscriptionId, invoiceId: params.invoice.id });
                return;
            }
        }

        if (dbSub.status !== 'ACTIVE') {
            Logger.info('Skipping renewal reminder for non-active subscription', { subscriptionId, status: dbSub.status });
            return;
        }

        if (dbSub.plan?.autoRenew === false) {
            Logger.info('Skipping renewal reminder for non-recurring plan', { subscriptionId, planId: dbSub.planId });
            return;
        }

        const renewAt = params.invoice.nextPaymentAttempt || dbSub.expiresAt || null;

        const reminderTitle = 'Renewal Reminder';
        const reminderMessage = `Your subscription to ${dbSub.plan.name} renews soon.`;

        const existingRecent = await prisma.notification.findFirst({
            where: {
                userId: dbSub.userId,
                title: reminderTitle,
                message: reminderMessage,
                createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
            }
        });

        if (existingRecent) {
            Logger.info('Skipping duplicate renewal reminder', { subscriptionId, invoiceId: params.invoice.id, notificationId: existingRecent.id });
            return;
        }

        const amountSource = typeof params.invoice.amountDue === 'number' ? params.invoice.amountDue : params.invoice.amountPaid;
        const amount = typeof amountSource === 'number' ? `$${(amountSource / 100).toFixed(2)}` : undefined;

        await sendBillingNotification({
            userId: dbSub.userId,
            title: reminderTitle,
            message: reminderMessage,
            templateKey: 'subscription_renewal_reminder',
            variables: {
                planName: dbSub.plan.name,
                amount,
                expiresAt: renewAt ? renewAt.toLocaleDateString() : undefined,
                billingUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/pricing`
            }
        });
    } catch (err) {
        Logger.error('Error handling upcoming invoice', { invoiceId: params.invoice.id, error: toError(err).message });
    }
}