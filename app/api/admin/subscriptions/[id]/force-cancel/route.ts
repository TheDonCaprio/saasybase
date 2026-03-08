import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse, type UserRole } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { shouldClearPaidTokensOnExpiry } from '../../../../../../lib/paidTokens';
import { paymentService } from '../../../../../../lib/payment/service';
import { resetOrganizationSharedTokens } from '../../../../../../lib/teams';
import { syncOrganizationEligibilityForUser } from '../../../../../../lib/organization-access';
import { sendBillingNotification } from '../../../../../../lib/notifications';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let actorId: string;
  let actorRole: UserRole;
  try {
    const ctx = await requireAdminOrModerator('subscriptions');
    actorId = ctx.userId;
    actorRole = ctx.role;
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Admin force-cancel auth error', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
  const rateLimitResult = await adminRateLimit(actorId, req, 'admin-subscriptions:force-cancel', {
    limit: 60,
    windowMs: 120_000
  });

  if (!rateLimitResult.success && !rateLimitResult.allowed) {
    Logger.error('Admin force-cancel rate limiter unavailable', { actorId, error: rateLimitResult.error });
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
  }

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    Logger.warn('Admin force-cancel rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
    return NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
  }
  const params = await context.params;
  const id = params.id;
  let clearPaidTokens = false;
  try {
    const body = await req.json().catch(() => ({}));
    clearPaidTokens = body?.clearPaidTokens === true;
  } catch {
    // ignore parse errors and default to false
  }
  try {
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return NextResponse.json({ ok: false, error: 'Subscription not found' }, { status: 404 });
    const plan = await prisma.plan.findUnique({
      where: { id: sub.planId },
      select: { name: true, supportsOrganizations: true },
    });
    const subscriptionProviderName = sub.paymentProvider || paymentService.provider.name;
    // Use the subscription's originating provider for cancellation
    const provider = paymentService.getProviderForRecord(sub.paymentProvider);

    const providerSubscriptionId = sub.externalSubscriptionId || sub.stripeSubscriptionId;
    let providerCancelFailed = false;
    if (providerSubscriptionId) {
      try {
        await provider.cancelSubscription(providerSubscriptionId, true);
      } catch (err: unknown) {
        const e = toError(err);
        // Log the error but continue with local cancellation - this is a FORCE cancel
        Logger.warn('Provider immediate cancel failed, proceeding with local cancellation', { actorId, subscriptionId: id, providerSubscriptionId, error: e.message });
        providerCancelFailed = true;
      }
    } else {
      Logger.info('Force cancel without provider subscription id; skipping provider call', { actorId, subscriptionId: id });
    }

    // Always update local DB for force cancel, even if provider call failed
    await prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELLED', expiresAt: new Date(), canceledAt: new Date(), cancelAtPeriodEnd: false }
    });

    // Admin force-cancel must revoke team/org access immediately (no natural-expiry grace).
    // This prevents the org + memberships from lingering until a user visits a page that triggers a sync.
    try {
      await syncOrganizationEligibilityForUser(sub.userId, { ignoreGrace: true });
    } catch (err: unknown) {
      Logger.warn('Failed to sync organization eligibility after admin force-cancel', {
        actorId,
        subscriptionId: id,
        userId: sub.userId,
        error: toError(err).message,
      });
    }

    try {
      const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: sub.userId, subscription: sub, requestFlag: clearPaidTokens });
      if (shouldClear) {
        await prisma.user.update({ where: { id: sub.userId }, data: { tokenBalance: 0 } });

        if (sub.organizationId) {
          if (plan?.supportsOrganizations) {
            await resetOrganizationSharedTokens({ organizationId: sub.organizationId });
          }
        }
      } else {
        Logger.info('Skipping paid token clear after force cancel (shouldClear=false)', { actorId, subscriptionId: id, userId: sub.userId });
      }
    } catch (err: unknown) {
      Logger.warn('Failed to reset token balance after force cancel', { error: toError(err).message, userId: sub.userId, subscriptionId: id });
    }

    try {
      await sendBillingNotification({
        userId: sub.userId,
        title: 'Subscription Cancelled',
        message: `Your ${plan?.name || 'subscription'} was cancelled by an administrator and access ended immediately.`,
        templateKey: 'subscription_cancelled',
        variables: {
          planName: plan?.name || 'Subscription',
          expiresAt: new Date().toLocaleDateString(),
        },
      });
    } catch (err: unknown) {
      Logger.warn('Failed to send user notification after admin force-cancel', {
        actorId,
        subscriptionId: id,
        userId: sub.userId,
        error: toError(err).message,
      });
    }

    Logger.info('Admin force-cancelled subscription', { actorId, subscriptionId: id, providerCancelFailed });

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'subscriptions.forceCancel',
      targetUserId: sub.userId,
      targetType: 'subscription',
      details: {
        subscriptionId: sub.id,
        providerSubscriptionId,
        providerName: subscriptionProviderName,
        stripeSubscriptionId: providerSubscriptionId && subscriptionProviderName === 'stripe' ? providerSubscriptionId : sub.stripeSubscriptionId ?? null,
        clearPaidTokens,
        providerCancelFailed
      }
    });

    // Return success but warn if provider call failed
    return NextResponse.json({ 
      ok: true, 
      warning: providerCancelFailed ? 'Subscription cancelled locally but provider cancellation failed. Manual cleanup may be needed on the payment provider dashboard.' : undefined 
    });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Admin force-cancel error', e);
    Logger.info('Admin force-cancel context', { actorId, subscriptionId: id });
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
}
