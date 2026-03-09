import { prisma } from '../prisma';
import { Logger } from '../logger';
import { sendAdminNotificationEmail } from '../notifications';
import { toError } from '../runtime-guards';
import type { StandardizedDispute } from './types';

export async function handleDisputeEvent(
    dispute: StandardizedDispute,
    eventType: 'dispute.created' | 'dispute.updated'
): Promise<void> {
    const { id, paymentIntentId, chargeId, amount, currency, status, reason, evidenceDueBy } = dispute;

    Logger.info('Dispute webhook received', {
        disputeId: id,
        paymentIntentId,
        chargeId,
        status,
        reason,
        eventType
    });

    const paymentIdToSearch = paymentIntentId || chargeId;
    if (!paymentIdToSearch) {
        Logger.warn('Dispute webhook missing payment identifier', { disputeId: id });
        return;
    }

    try {
        const payment = await prisma.payment.findFirst({
            where: {
                externalPaymentId: paymentIdToSearch,
            },
            include: { user: { select: { id: true, email: true } } }
        });

        if (!payment) {
            Logger.warn('Dispute for unknown payment', { disputeId: id, paymentId: paymentIdToSearch });
            try {
                await sendAdminNotificationEmail({
                    title: 'Dispute Filed - Unknown Payment',
                    alertType: 'dispute',
                    message: `A dispute has been filed for an unknown payment.\n\nDispute ID: ${id}\nPayment Intent: ${paymentIntentId || 'N/A'}\nCharge: ${chargeId || 'N/A'}\nAmount: ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}\nReason: ${reason}\nStatus: ${status}\nEvidence Due: ${evidenceDueBy ? evidenceDueBy.toISOString() : 'N/A'}`
                });
            } catch {
            }
            return;
        }

        if (eventType === 'dispute.created' && payment.status !== 'DISPUTED') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'DISPUTED'
                }
            });
            Logger.info('Payment marked as DISPUTED', {
                paymentId: payment.id,
                disputeId: id
            });
        }

        if (status === 'won') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'SUCCEEDED' }
            });
            Logger.info('Dispute won - payment restored to SUCCEEDED', {
                paymentId: payment.id,
                disputeId: id
            });
        } else if (status === 'lost') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'REFUNDED' }
            });
            Logger.info('Dispute lost - payment marked as REFUNDED', {
                paymentId: payment.id,
                disputeId: id
            });
        }

        const formattedAmount = `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
        const userInfo = payment.user?.email || payment.userId || 'Unknown';

        try {
            await sendAdminNotificationEmail({
                title: eventType === 'dispute.created' ? 'New Dispute Filed' : `Dispute Updated: ${status}`,
                alertType: 'dispute',
                message: `A ${eventType === 'dispute.created' ? 'new dispute has been filed' : 'dispute status has changed'}.\n\nDispute ID: ${id}\nAmount: ${formattedAmount}\nUser: ${userInfo}\nReason: ${reason}\nStatus: ${status}\nEvidence Due: ${evidenceDueBy ? evidenceDueBy.toISOString() : 'N/A'}\nPayment ID: ${payment.id}`
            });
        } catch {
        }
    } catch (err) {
        Logger.error('Error handling dispute webhook', { disputeId: id, error: toError(err).message });
    }
}