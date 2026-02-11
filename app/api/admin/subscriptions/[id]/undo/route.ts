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
    Logger.error('Admin undo auth error', e);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
  const rateLimitResult = await adminRateLimit(actorId, req, 'admin-subscriptions:undo', {
    limit: 60,
    windowMs: 120_000
  });

  if (!rateLimitResult.success && !rateLimitResult.allowed) {
    Logger.error('Admin undo rate limiter unavailable', { actorId, error: rateLimitResult.error });
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
  }

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    Logger.warn('Admin undo rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
    return NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
  }
  const params = await context.params;
  const id = params.id;
  try {
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return NextResponse.json({ ok: false, error: 'Subscription not found' }, { status: 404 });

    if (sub.status === 'CANCELLED') {
      return NextResponse.json(
        { ok: false, error: 'This subscription is already cancelled and cannot be undone. Create a new subscription instead.' },
        { status: 409 }
      );
    }

    const subscriptionProviderName = sub.paymentProvider || paymentService.provider.name;
    // Use the subscription's originating provider for undo operation
    const provider = paymentService.getProviderForRecord(sub.paymentProvider);
    const providerSubscriptionId = sub.externalSubscriptionId || sub.stripeSubscriptionId;

    if (providerSubscriptionId) {
      try {
        // Paystack cannot reactivate a subscription once it reaches the terminal cancelled state.
        // Avoid throwing a 500 by pre-checking and returning a clear, actionable response.
        if (provider.name === 'paystack') {
          const providerSub = await provider.getSubscription(providerSubscriptionId);
          const providerStatus = (providerSub.status || '').toLowerCase();
          if (providerStatus === 'canceled' || providerStatus === 'cancelled') {
            // Keep local record aligned with provider reality.
            await prisma.subscription.update({
              where: { id },
              data: {
                status: 'CANCELLED',
                canceledAt: providerSub.canceledAt ?? sub.canceledAt ?? new Date(),
                expiresAt: providerSub.currentPeriodEnd ?? sub.expiresAt,
                cancelAtPeriodEnd: false,
              }
            });

            return NextResponse.json(
              {
                ok: false,
                error: 'Paystack subscriptions cannot be reactivated after cancellation. Create a new subscription instead.',
              },
              { status: 409 }
            );
          }
        }

        await provider.undoCancelSubscription(providerSubscriptionId);
      } catch (err: unknown) {
        const e = toError(err);

        // Paystack: once cancelled, /subscription/enable fails with a non-recoverable error.
        // Return a clear 409 instead of a generic 500.
        if (provider.name === 'paystack' && e.message.toLowerCase().includes('cannot be reactivated')) {
          Logger.warn('Provider undo-cancel not possible (paystack terminal cancel)', {
            actorId,
            subscriptionId: id,
            providerSubscriptionId,
            error: e.message,
          });

          // Best-effort: mark local as cancelled to avoid UI confusion.
          await prisma.subscription.update({
            where: { id },
            data: {
              status: 'CANCELLED',
              canceledAt: sub.canceledAt ?? new Date(),
              cancelAtPeriodEnd: false,
            }
          });

          return NextResponse.json(
            {
              ok: false,
              error: 'Paystack subscriptions cannot be reactivated after cancellation. Create a new subscription instead.',
            },
            { status: 409 }
          );
        }

        Logger.error('Provider undo-cancel failed', { actorId, subscriptionId: id, providerSubscriptionId, error: e.message });
        return NextResponse.json({ ok: false, error: 'Payment provider undo failed' }, { status: 502 });
      }
    } else {
      Logger.info('Undo cancel without provider subscription id; skipping provider call', { actorId, subscriptionId: id });
    }

    // If the subscription was only scheduled to cancel (not force-cancelled),
    // restore it to ACTIVE so the admin UI shows the live subscription state.
    const updateData: Record<string, unknown> = { canceledAt: null, cancelAtPeriodEnd: false };
    if (sub.status !== 'CANCELLED') {
      updateData.status = 'ACTIVE';
    }

    await prisma.subscription.update({ where: { id }, data: updateData });
    Logger.info('Admin undid subscription cancel', { actorId, subscriptionId: id, restoredToActive: sub.status !== 'CANCELLED' });

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'subscriptions.undoCancel',
      targetUserId: sub.userId,
      targetType: 'subscription',
      details: {
        subscriptionId: sub.id,
        providerSubscriptionId,
        providerName: subscriptionProviderName,
        stripeSubscriptionId: providerSubscriptionId && subscriptionProviderName === 'stripe' ? providerSubscriptionId : sub.stripeSubscriptionId ?? null,
        restoredStatus: updateData.status ?? sub.status
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Admin undo error', e);
    Logger.info('Admin undo context', { actorId, subscriptionId: id });
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
}
