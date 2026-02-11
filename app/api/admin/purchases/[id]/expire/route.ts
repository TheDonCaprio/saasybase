import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { shouldClearPaidTokensOnExpiry } from '../../../../../../lib/paidTokens';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { syncOrganizationEligibilityForUser } from '../../../../../../lib/organization-access';
import { resetOrganizationSharedTokens } from '../../../../../../lib/teams';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let purchaseId: string | undefined;
  try {
    const params = await context.params;
    purchaseId = params.id;
    const { userId: actorId, role: actorRole } = await requireAdminOrModerator('purchases');
    const rateLimitResult = await adminRateLimit(actorId, req, 'admin-purchases:expire', { limit: 60, windowMs: 120_000 });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Admin purchases expire rate limiter unavailable', { actorId, error: rateLimitResult.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Admin purchases expire rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }
    const { id } = params;
    // optional flag to control whether paid tokens should be cleared when expiring the subscription
    let clearPaidTokens = false;
    try {
      const body = await req.json().catch(() => ({}));
      clearPaidTokens = body?.clearPaidTokens === true;
    } catch {
      // ignore parse errors and default to false
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        subscription: true,
        user: true
      }
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (!payment.subscriptionId || !payment.subscription) {
      return NextResponse.json({ error: 'No subscription associated with this purchase' }, { status: 400 });
    }

    const subscription = payment.subscription;

    if (subscription.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 });
    }

    const now = new Date();

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED', expiresAt: now, canceledAt: now, clearPaidTokensOnExpiry: clearPaidTokens }
    });

    try {
      await syncOrganizationEligibilityForUser(subscription.userId, { ignoreGrace: true });
    } catch (err: unknown) {
      const syncError = toError(err);
      Logger.warn('Failed to sync organization eligibility after admin expired purchase subscription', {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        error: syncError.message
      });
    }

    if (payment.userId) {
      try {
        const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: payment.userId, requestFlag: clearPaidTokens });
        if (shouldClear) {
          await prisma.user.update({ where: { id: payment.userId }, data: { tokenBalance: 0 } });

          if (subscription.organizationId) {
            const plan = await prisma.plan.findUnique({ where: { id: subscription.planId }, select: { supportsOrganizations: true } });
            if (plan?.supportsOrganizations) {
              await resetOrganizationSharedTokens({ organizationId: subscription.organizationId });
            }
          }
        } else {
          Logger.info('Skipping paid token clear for purchase expire (shouldClear=false)', { paymentId: payment.id, userId: payment.userId });
        }
      } catch (err: unknown) {
        const inner = toError(err);
        Logger.warn('Failed to reset token balance after expiring subscription', {
          userId: payment.userId,
          paymentId: payment.id,
          error: inner.message
        });
      }
    }

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'purchases.expireSubscription',
      targetUserId: payment.userId,
      targetType: 'subscription',
        details: {
        paymentId: payment.id,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        previousStatus: subscription.status,
        clearPaidTokens
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Error expiring purchase subscription', {
      paymentId: purchaseId,
      error: err.message,
      stack: err.stack
    });
    return NextResponse.json({ error: 'Failed to expire plan' }, { status: 500 });
  }
}
