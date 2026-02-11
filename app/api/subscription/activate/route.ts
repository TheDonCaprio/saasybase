import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '../../../../lib/prisma';
import { toError } from '../../../../lib/runtime-guards';
import { syncOrganizationEligibilityForUser } from '../../../../lib/organization-access';
import { Logger } from '../../../../lib/logger';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function POST(request: Request) {
  try {
  const { userId } = await auth();
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
