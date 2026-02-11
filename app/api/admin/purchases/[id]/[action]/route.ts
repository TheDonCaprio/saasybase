import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { shouldClearPaidTokensOnExpiry } from '../../../../../../lib/paidTokens';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { paymentService } from '../../../../../../lib/payment/service';
import { resetOrganizationSharedTokens } from '../../../../../../lib/teams';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; action: string }> }
) {
  let paymentId: string | undefined;
  try {
    const params = await context.params;
    paymentId = params.id;
    const { userId: actorId, role: actorRole } = await requireAdminOrModerator('purchases');
    const rateLimitResult = await adminRateLimit(actorId, req, 'admin-purchases:action', { limit: 60, windowMs: 120_000 });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Admin purchases action rate limiter unavailable', { actorId, error: rateLimitResult.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Admin purchases action rate limit exceeded', { actorId, remaining: rateLimitResult.remaining });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const { id, action } = params;

    if (action !== 'refund') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Get the payment
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.status !== 'SUCCEEDED') {
      return NextResponse.json(
        { error: 'Can only refund completed payments' },
        { status: 400 }
      );
    }

    // Parse optional flag for clearing paid tokens as part of this admin flow
    let clearPaidTokens = false;
    try {
      const body = await req.json().catch(() => ({}));
      clearPaidTokens = body?.clearPaidTokens === true;
    } catch {
      // ignore parse errors
    }

    // Issue refund via payment provider (fallback to manual record if we lack references)
    const paymentReference = payment.externalPaymentId || payment.stripePaymentIntentId || null;
    const providerReason = 'requested_by_customer';
    let refundId: string;

    const providerForRecord = paymentService.getProviderForRecord(payment.paymentProvider);

    if (paymentReference) {
      try {
        const refund = await providerForRecord.refundPayment(paymentReference, undefined, providerReason);
        refundId = refund.id;
      } catch (providerError: unknown) {
        const err = toError(providerError);
        Logger.error('Payment provider refund error', { paymentId: id, error: err.message });
        return NextResponse.json(
          { error: `Refund failed: ${err.message}` },
          { status: 400 }
        );
      }
    } else {
      refundId = `manual_refund_${Date.now()}`;
      Logger.warn('Refund recorded without external payment reference', { paymentId: id });
    }

    const isStripePayment = (payment.paymentProvider || providerForRecord.name) === 'stripe';
    const updateData: Prisma.PaymentUpdateInput = {
      status: 'REFUNDED',
      externalRefundId: refundId
    };
    if (isStripePayment) {
      updateData.stripeRefundId = refundId;
    }

    try {
      await prisma.payment.update({ where: { id }, data: updateData });
    } catch (err: unknown) {
      Logger.warn('Failed to persist refund identifiers for purchase refund', { paymentId: id, error: toError(err).message });
      await prisma.payment.update({ where: { id }, data: { status: 'REFUNDED' } });
    }

    // If there's an associated subscription, deactivate it
      if (payment.subscriptionId) {
      const updatedSub = await prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: 'CANCELLED' }
      });

      if (payment.user) {
        try {
          const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: payment.user.id, subscription: updatedSub, requestFlag: clearPaidTokens });
          if (shouldClear) {
            await prisma.user.update({ where: { id: payment.user.id }, data: { tokenBalance: 0 } });

            if (updatedSub.organizationId) {
              const plan = await prisma.plan.findUnique({ where: { id: updatedSub.planId }, select: { supportsOrganizations: true } });
              if (plan?.supportsOrganizations) {
                await resetOrganizationSharedTokens({ organizationId: updatedSub.organizationId });
              }
            }
          } else {
            Logger.info('Skipping paid token clear for purchase refund (shouldClear=false)', { paymentId: payment.id, userId: payment.user.id });
          }
        } catch (err: unknown) {
          Logger.warn('Failed to reset token balance after purchase refund cancellation', { userId: payment.user.id, subscriptionId: updatedSub.id, error: toError(err).message });
        }
      }
    }

    await recordAdminAction({
      actorId,
      actorRole,
      action: 'purchases.refund',
      targetUserId: payment.userId,
      targetType: 'payment',
      details: {
        paymentId: payment.id,
        amountCents: payment.amountCents,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        stripeCheckoutSessionId: payment.stripeCheckoutSessionId
        , clearPaidTokens,
          externalPaymentId: payment.externalPaymentId,
          refundId
      }
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Error processing refund', { paymentId, error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
