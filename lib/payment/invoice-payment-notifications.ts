import { Logger } from '../logger';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import type { StandardizedInvoice } from './types';

type InvoicePaidNotificationSubscriptionShape = {
    id: string;
    userId: string;
    planId: string;
    expiresAt: Date;
    plan: {
        name: string;
        autoRenew: boolean;
    };
};

type InvoicePaymentResultShape = {
    created: boolean;
    payment: {
        id: string;
        externalPaymentId: string | null;
    };
};

export async function processInvoicePaidNotifications<TSub extends InvoicePaidNotificationSubscriptionShape>(params: {
    dbSub: TSub;
    invoice: StandardizedInvoice;
    paymentResult: InvoicePaymentResultShape;
    subscriptionId: string;
    paymentIntentId: string;
    refreshedExpiresAt: Date | null;
    findRecentNotificationByTitles: (
        userId: string,
        titles: string[],
        lookbackMs: number
    ) => Promise<{ id: string } | null>;
    findRecentNotificationByExactMessage: (
        userId: string,
        title: string,
        message: string,
        lookbackMs: number
    ) => Promise<{ id: string } | null>;
}): Promise<{ shouldReturnEarly: boolean }> {
    if (!params.paymentResult.created) {
        const recentRenewalNotification = await params.findRecentNotificationByTitles(
            params.dbSub.userId,
            ['Subscription Renewed'],
            12 * 60 * 60 * 1000
        );

        if (recentRenewalNotification) {
            Logger.info('Skipping renewal notification (already sent for payment)', {
                subscriptionId: params.subscriptionId,
                paymentIntentId: params.paymentIntentId,
                notificationId: recentRenewalNotification.id
            });
            return { shouldReturnEarly: true };
        }

        Logger.info('Recurring payment already recorded; sending renewal notification for retry event', {
            subscriptionId: params.subscriptionId,
            paymentIntentId: params.paymentIntentId
        });
    }

    const lineItemsTotal = params.invoice.lineItems?.reduce((sum, item) => sum + (item?.amount ?? 0), 0);
    const billingReason = params.invoice.billingReason;
    const isInitialInvoice = billingReason === 'subscription_create';

    if (isInitialInvoice) {
        Logger.info('Skipping renewal notification for initial subscription invoice', {
            subscriptionId: params.subscriptionId,
            paymentIntentId: params.paymentIntentId,
            invoiceId: params.invoice.id
        });
        return { shouldReturnEarly: true };
    }

    if (params.dbSub.plan?.autoRenew === false) {
        Logger.info('Skipping renewal notification for non-recurring plan', {
            subscriptionId: params.subscriptionId,
            planId: params.dbSub.planId,
            billingReason
        });
        return { shouldReturnEarly: true };
    }

    let changeType: 'upgrade' | 'downgrade' | null = null;

    if (billingReason === 'subscription_update') {
        if (typeof lineItemsTotal === 'number') {
            if (lineItemsTotal > 0) changeType = 'upgrade';
            else if (lineItemsTotal < 0) changeType = 'downgrade';
        } else {
            changeType = params.invoice.amountPaid > 0 ? 'upgrade' : 'downgrade';
        }
    }

    if (changeType) {
        const templateKey = changeType === 'upgrade' ? 'subscription_upgraded_recurring' : 'subscription_downgraded';
        const title = changeType === 'upgrade' ? 'Subscription Upgraded' : 'Subscription Changed';
        const message = changeType === 'upgrade'
            ? `Your subscription has been upgraded to ${params.dbSub.plan.name}.`
            : `Your subscription has been changed to ${params.dbSub.plan.name}.`;

        const existingRecent = await params.findRecentNotificationByExactMessage(
            params.dbSub.userId,
            title,
            message,
            60 * 60 * 1000
        );

        if (!existingRecent) {
            await sendBillingNotification({
                userId: params.dbSub.userId,
                title,
                message,
                templateKey,
                variables: {
                    planName: params.dbSub.plan.name,
                    amount: `$${(params.invoice.amountPaid / 100).toFixed(2)}`,
                    startedAt: new Date().toLocaleDateString(),
                    expiresAt: params.dbSub.expiresAt ? params.dbSub.expiresAt.toLocaleDateString() : undefined,
                }
            });

            await sendAdminNotificationEmail({
                userId: params.dbSub.userId,
                title: changeType === 'upgrade' ? 'Subscription upgraded' : 'Subscription downgraded',
                alertType: changeType === 'upgrade' ? 'upgrade' : 'downgrade',
                message: changeType === 'upgrade'
                    ? `User ${params.dbSub.userId} upgraded to ${params.dbSub.plan.name}. Subscription: ${params.dbSub.id}`
                    : `User ${params.dbSub.userId} downgraded to ${params.dbSub.plan.name}. Subscription: ${params.dbSub.id}`,
                templateKey: 'admin_notification',
                variables: {
                    planName: params.dbSub.plan.name,
                    amount: `$${(params.invoice.amountPaid / 100).toFixed(2)}`,
                    transactionId: params.paymentResult.payment.externalPaymentId || params.paymentIntentId || params.invoice.id,
                    startedAt: new Date().toLocaleString(),
                },
            });
        } else {
            Logger.info('Skipping duplicate change notification', {
                userId: params.dbSub.userId,
                subscriptionId: params.subscriptionId,
                templateKey,
                notificationId: existingRecent.id
            });
        }

        return { shouldReturnEarly: false };
    }

    const renewalTitle = 'Subscription Renewed';
    const renewalMessage = `Your subscription to ${params.dbSub.plan.name} has been renewed.`;

    const existingRecent = await params.findRecentNotificationByExactMessage(
        params.dbSub.userId,
        renewalTitle,
        renewalMessage,
        60 * 60 * 1000
    );

    if (existingRecent) {
        Logger.info('Skipping duplicate renewal notification', {
            userId: params.dbSub.userId,
            subscriptionId: params.subscriptionId,
            paymentIntentId: params.paymentIntentId,
            notificationId: existingRecent.id
        });
    } else {
        await sendBillingNotification({
            userId: params.dbSub.userId,
            title: renewalTitle,
            message: renewalMessage,
            templateKey: 'subscription_renewed',
            variables: {
                planName: params.dbSub.plan.name,
                amount: `$${(params.invoice.amountPaid / 100).toFixed(2)}`,
                date: new Date().toLocaleDateString(),
                transactionId: params.paymentResult.payment.id || params.paymentIntentId || params.invoice.id,
                expiresAt: params.refreshedExpiresAt ? params.refreshedExpiresAt.toLocaleDateString() : undefined
            }
        });

        await sendAdminNotificationEmail({
            userId: params.dbSub.userId,
            title: 'Subscription renewed',
            alertType: 'renewal',
            message: `User ${params.dbSub.userId} renewed ${params.dbSub.plan.name}. Subscription: ${params.dbSub.id}`,
            templateKey: 'admin_notification',
            variables: {
                planName: params.dbSub.plan.name,
                amount: `$${(params.invoice.amountPaid / 100).toFixed(2)}`,
                transactionId: params.paymentResult.payment.externalPaymentId || params.paymentIntentId || params.invoice.id,
                startedAt: new Date().toLocaleString(),
            },
        });
    }

    return { shouldReturnEarly: false };
}