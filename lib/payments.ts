import { prisma } from './prisma';
import { toError } from './runtime-guards';
import { Logger } from './logger';

/**
 * Recomputes and persists the denormalized lastPaymentAmountCents for a subscription.
 * Picks the most recent non-refunded payment for the subscription and stores its amountCents,
 * or null if none exist.
 */
export async function updateSubscriptionLastPaymentAmount(subscriptionId: string) {
  if (!subscriptionId) return;
  try {
    const latest = await prisma.payment.findFirst({
      where: { subscriptionId, status: { not: 'REFUNDED' } },
      orderBy: { createdAt: 'desc' },
      select: { amountCents: true }
    });

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { lastPaymentAmountCents: latest ? latest.amountCents : null }
    });

    Logger.info('updateSubscriptionLastPaymentAmount: updated', { subscriptionId, amount: latest ? latest.amountCents : null });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.warn('updateSubscriptionLastPaymentAmount failed', { subscriptionId, error: e.message });
  }
}

export default updateSubscriptionLastPaymentAmount;
