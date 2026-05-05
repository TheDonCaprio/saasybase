import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse, type UserRole } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { paymentService } from '../../../../../../lib/payment/service';

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
    Logger.error('Admin schedule-cancel auth error', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
  const rateLimitResult = await adminRateLimit(actorId, req, 'admin-subscriptions:schedule-cancel', {
    limit: 60,
    windowMs: 120_000
  });

  if (!rateLimitResult.success && !rateLimitResult.allowed) {
    Logger.error('Admin schedule-cancel rate limiter unavailable', { actorId, error: rateLimitResult.error });
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
  }

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    Logger.warn('Admin schedule-cancel rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
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
    const subscriptionProviderName = sub.paymentProvider || paymentService.provider.name;
    // Use the subscription's originating provider for cancellation
    const provider = paymentService.getProviderForRecord(sub.paymentProvider);
    const providerSubscriptionId = sub.externalSubscriptionId;

    let providerCancelFailed = false;
    let scheduledDate = sub.expiresAt ? new Date(sub.expiresAt) : new Date();

    if (providerSubscriptionId) {
      try {
        const result = await provider.cancelSubscription(providerSubscriptionId, false);
        scheduledDate = result.expiresAt ?? sub.expiresAt ?? new Date();
      } catch (err: unknown) {
        const e = toError(err);
        // Log but continue with local cancellation
        Logger.warn('Provider schedule-cancel failed, proceeding with local cancellation', { actorId, subscriptionId: id, providerSubscriptionId, error: e.message });
        providerCancelFailed = true;
      }
    }

    // Always update local DB, even if provider call failed
    await prisma.subscription.update({
      where: { id },
      data: {
        canceledAt: scheduledDate,
        cancelAtPeriodEnd: true,
        clearPaidTokensOnExpiry: clearPaidTokens,
      }
    });

    // If admin requested clearing paid tokens when this subscription actually expires,
    // record that intention on the subscription instead of clearing the user's paid balance now.
    if (!clearPaidTokens) {
      Logger.info('Skipping paid token clear during schedule-cancel (clearPaidTokens=false)', { actorId, subscriptionId: id, userId: sub.userId });
    }
    Logger.info('Admin scheduled subscription cancel', { actorId, subscriptionId: id, providerCancelFailed });

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'subscriptions.scheduleCancel',
      targetUserId: sub.userId,
      targetType: 'subscription',
      details: {
        subscriptionId: sub.id,
        providerSubscriptionId,
        providerName: subscriptionProviderName,
        clearPaidTokens,
        providerCancelFailed
      }
    });

    // Return success but warn if provider call failed
    return NextResponse.json({ 
      ok: true,
      warning: providerCancelFailed ? 'Subscription scheduled for cancellation locally but provider cancellation failed. Manual cleanup may be needed on the payment provider dashboard.' : undefined
    });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Admin schedule-cancel error', e);
    Logger.info('Admin schedule-cancel context', { actorId, subscriptionId: id });
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
}
