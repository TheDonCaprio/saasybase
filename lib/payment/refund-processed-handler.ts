import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendBillingNotification } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedRefund } from './types';

export async function handleRefundProcessedEvent(refund: StandardizedRefund): Promise<void> {
    const { id, paymentIntentId, chargeId, amount, currency, status, reason } = refund;

    Logger.info('Refund processed webhook received', {
        refundId: id,
        paymentIntentId,
        chargeId,
        amount,
        status
    });

    const paymentIdToSearch = paymentIntentId || chargeId;
    if (!paymentIdToSearch) {
        Logger.warn('Refund webhook missing payment identifier', { refundId: id });
        return;
    }

    try {
        const payment = await prisma.payment.findFirst({
            where: {
                OR: [
                    { externalPaymentId: paymentIdToSearch },
                    { stripePaymentIntentId: paymentIdToSearch }
                ]
            },
            include: { user: { select: { id: true, email: true } } }
        });

        if (!payment) {
            Logger.warn('Refund for unknown payment', { refundId: id, paymentId: paymentIdToSearch });
            return;
        }

        if (payment.status !== 'REFUNDED') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'REFUNDED',
                    externalRefundId: id
                }
            });
            Logger.info('Payment marked as REFUNDED via webhook', {
                paymentId: payment.id,
                refundId: id,
                amount
            });

            if (payment.userId) {
                try {
                    const formattedAmount = `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
                    await sendBillingNotification({
                        userId: payment.userId,
                        title: 'Refund Processed',
                        message: `A refund of ${formattedAmount} has been processed for your payment.`,
                        templateKey: 'refund_processed',
                        variables: {
                            amount: formattedAmount,
                            reason: reason || 'Requested'
                        }
                    });
                } catch (notifErr) {
                    Logger.warn('Failed to send refund notification', {
                        userId: payment.userId,
                        refundId: id,
                        error: toError(notifErr).message
                    });
                }
            }
        } else {
            Logger.info('Skipping already-refunded payment', { paymentId: payment.id, refundId: id });
        }
    } catch (err) {
        Logger.error('Error handling refund webhook', { refundId: id, error: toError(err).message });
    }
}