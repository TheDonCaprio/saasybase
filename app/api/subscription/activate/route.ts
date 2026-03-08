import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { toError } from '../../../../lib/runtime-guards';
import { syncOrganizationEligibilityForUser } from '../../../../lib/organization-access';
import { Logger } from '../../../../lib/logger';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function POST(request: Request) {
  try {
  const { userId } = await authService.getSession();
    if (!userId) return jsonError('Unauthorized', 401, 'UNAUTHORIZED');

  const bodyRaw: unknown = await request.json().catch(() => ({}));
  const body = typeof bodyRaw === 'object' && bodyRaw !== null ? (bodyRaw as Record<string, unknown>) : {} as Record<string, unknown>;
  const subscriptionId = body?.subscriptionId as string | undefined;
    if (!subscriptionId) return jsonError('Missing subscriptionId', 400, 'SUBSCRIPTION_ID_MISSING');

    // Find the pending subscription and its plan
    const pending = await prisma.subscription.findUnique({ where: { id: String(subscriptionId) }, include: { plan: true } });
    if (!pending || pending.userId !== userId || pending.status !== 'PENDING') {
      return jsonError('Subscription not found or not pending', 404, 'SUBSCRIPTION_NOT_PENDING');
    }

    const now = new Date();

    // Prevent forcing queued/future subscriptions early.
    if (pending.startedAt && pending.startedAt.getTime() > now.getTime() + 1000) {
      return jsonError('This subscription is queued and cannot be activated early.', 400, 'SUBSCRIPTION_NOT_STARTED');
    }

    // Prevent activating unpaid placeholder subscriptions created during abandoned checkouts.
    const hasSuccessfulPayment = await prisma.payment.findFirst({
      where: {
        subscriptionId: pending.id,
        status: 'SUCCEEDED',
      },
      select: { id: true },
    });

    if (!hasSuccessfulPayment) {
      return jsonError('This pending subscription has no successful payment and cannot be activated.', 400, 'SUBSCRIPTION_UNPAID');
    }
    const periodMs = (pending.plan?.durationHours || 0) * 3600 * 1000;
    const newExpires = new Date(now.getTime() + periodMs);

    // Expire any existing ACTIVE subscriptions for this user
    const expiredActives = await prisma.subscription.updateMany({ where: { userId, status: 'ACTIVE' }, data: { status: 'EXPIRED', canceledAt: now } });

    // Activate the pending subscription
    await prisma.subscription.update({ where: { id: pending.id }, data: { status: 'ACTIVE', startedAt: now, expiresAt: newExpires } });

    if (expiredActives.count > 0 || pending.plan?.supportsOrganizations) {
      try {
        await syncOrganizationEligibilityForUser(userId);
      } catch (err: unknown) {
        Logger.warn('Failed to sync organization eligibility after activating pending subscription', {
          userId,
          subscriptionId: pending.id,
          error: toError(err).message
        });
      }
    }

    return NextResponse.json({ ok: true, activated: true, subscriptionId: pending.id, startsAt: now.toISOString(), expiresAt: newExpires.toISOString() });
  } catch (e: unknown) {
    const err = toError(e);
    console.error('Activate pending subscription error', err);
    return jsonError(err.message || 'Error', 500, 'SUBSCRIPTION_ACTIVATE_FAILED');
  }
}
