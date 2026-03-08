import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { paymentService } from '../../../../lib/payment/service';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function POST(req: Request) {
  const { userId } = await authService.getSession();
  if (!userId) return jsonError('Unauthorized', 401, 'UNAUTHORIZED');

  const subscription = await prisma.subscription.findFirst({ where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
  if (!subscription) return jsonError('No active subscription', 400, 'SUBSCRIPTION_NOT_ACTIVE');

  // Use externalSubscriptionId (preferred) or fallback to stripeSubscriptionId
  const subId = subscription.externalSubscriptionId || subscription.stripeSubscriptionId;

  // If no subscription id then nothing to undo
  if (!subId) {
    // just clear canceledAt and cancelAtPeriodEnd locally if present
    await prisma.subscription.update({ where: { id: subscription.id }, data: { canceledAt: null, cancelAtPeriodEnd: false } });
    return NextResponse.json({ ok: true, message: 'undone_local' });
  }

  try {
    // Use the subscription's originating provider for undo
    const provider = paymentService.getProviderForRecord(subscription.paymentProvider);
    // Remove cancel_at_period_end on subscription
    const result = await provider.undoCancelSubscription(subId);

    // Clear canceledAt and cancelAtPeriodEnd locally
    await prisma.subscription.update({ where: { id: subscription.id }, data: { canceledAt: null, cancelAtPeriodEnd: false } });

    // Audit log the undo action (include client IP if present)
    const ip = req?.headers?.get?.('x-forwarded-for') ?? req?.headers?.get?.('x-real-ip') ?? 'unknown';
    Logger.info('User undone subscription cancellation', { userId, subscriptionId: subscription.id, externalSubscriptionId: subId, ip });

    return NextResponse.json({ ok: true, message: 'undo_succeeded', subscription: result });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Error undoing cancellation', { error: e.message, stack: e.stack, userId, subscriptionId: subscription?.id });
    return jsonError(e.message || 'Failed to undo cancellation', 500, 'UNDO_CANCEL_FAILED');
  }
}
