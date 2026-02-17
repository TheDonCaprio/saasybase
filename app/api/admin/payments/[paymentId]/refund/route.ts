import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { paymentService } from '../../../../../../lib/payment/service';
import { formatCurrency } from '../../../../../../lib/utils/currency';
import { Logger } from '../../../../../../lib/logger';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { validateInput, apiSchemas } from '../../../../../../lib/validation';
import { asRecord, toError } from '../../../../../../lib/runtime-guards';
import { sendBillingNotification, sendAdminNotificationEmail } from '../../../../../../lib/notifications';
import { recordAdminAction } from '../../../../../../lib/admin-actions';
import { shouldClearPaidTokensOnExpiry } from '../../../../../../lib/paidTokens';
import { syncOrganizationEligibilityForUser } from '../../../../../../lib/organization-access';
import { resetOrganizationSharedTokens } from '../../../../../../lib/teams';
import { mergeProviderIdMap } from '../../../../../../lib/utils/provider-ids';
import { PaymentProviderError } from '../../../../../../lib/payment/errors';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> }
) {
  const startTime = Date.now();
  let actorId: string | undefined;
  let actorRole: 'ADMIN' | 'MODERATOR' | undefined;

  try {
    const params = await context.params;
    const organizationSyncTargets = new Set<string>();
    // Allow admins or authorized moderators with transaction access to process refunds.
    const actorContext = await requireAdminOrModerator('transactions');
    actorId = actorContext.userId;
    actorRole = actorContext.role === 'ADMIN' || actorContext.role === 'MODERATOR'
      ? actorContext.role
      : undefined;

    // Rate limiting for admin actions with persistent storage
    const rateLimitResult = await adminRateLimit(actorId, request, 'admin-refund', {
      limit: 10,
      windowMs: 60_000
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Admin refund rate limiter unavailable', {
        actorId,
        error: rateLimitResult.error
      });
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Admin refund rate limit exceeded', {
        actorId,
        remaining: rateLimitResult.remaining
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    const body = await request.json();
    const validation = validateInput(apiSchemas.refund, body);
    if (!validation.success) {
      Logger.warn('Invalid refund request data', {
        actorId,
        error: validation.error
      });
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    // Narrow validation data safely
    const validatedRec = asRecord(validation.data) || {};
    const reason = typeof validatedRec['reason'] === 'string' ? String(validatedRec['reason']) : undefined;
    const notes = typeof validatedRec['notes'] === 'string' ? String(validatedRec['notes']) : undefined;
    const cancelSubscription = validatedRec['cancelSubscription'] === true;
    const cancelModeRaw = typeof validatedRec['cancelMode'] === 'string' ? validatedRec['cancelMode'] : undefined;
    const cancelMode: 'immediate' | 'period_end' = cancelModeRaw === 'period_end' ? 'period_end' : 'immediate';
    const localCancelModeRaw = typeof validatedRec['localCancelMode'] === 'string' ? validatedRec['localCancelMode'] : undefined;
    const localCancelMode: 'immediate' | 'period_end' = localCancelModeRaw === 'period_end' ? 'period_end' : 'immediate';
    const clearPaidTokens = validatedRec['clearPaidTokens'] === true;

    // Validate reason - must be one of Stripe's allowed values (or generic provider values)
    const validReasons = ['duplicate', 'fraudulent', 'requested_by_customer'] as const;
    const refundReason = (reason && (validReasons as readonly string[]).includes(reason) ? reason : 'requested_by_customer');

    Logger.info('Processing refund request', {
      actorId,
      paymentId: params.paymentId,
      reason: refundReason,
      hasNotes: !!notes
    });

    Logger.info('Refund requested with options', {
      actorId,
      paymentId: params.paymentId,
      cancelSubscription,
      cancelMode,
      localCancelMode
    });

    const payment = await prisma.payment.findUnique({
      where: { id: params.paymentId },
      include: { subscription: { include: { plan: true } } }
    });

    if (!payment) {
      Logger.warn('Payment not found for refund', {
        actorId,
        paymentId: params.paymentId
      });
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (payment.status === 'REFUNDED') {
      return NextResponse.json({ error: 'Payment already refunded' }, { status: 400 });
    }

    // Use the payment's originating provider for all provider operations
    const provider = paymentService.getProviderForRecord(payment.paymentProvider);

    // Create refund via Provider
    let refund: { id: string; amount: number; status: string } | null = null;
    let paymentIntentId = payment.externalPaymentId;

    // If we don't have a payment intent but have a checkout session, get it from Provider
    if (!paymentIntentId && payment.externalSessionId) {
      try {
        const session = await provider.getCheckoutSession(payment.externalSessionId);
        paymentIntentId = session.paymentIntentId || null;
        Logger.info('Retrieved payment intent from checkout session', {
          actorId,
          paymentId: params.paymentId,
          hasPaymentIntent: !!paymentIntentId
        });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('Could not retrieve payment intent from checkout session', {
          actorId,
          paymentId: params.paymentId,
          error: e.message
        });
      }
    }

    // Razorpay refund API requires a pay_ prefixed payment ID. Some payment records
    // may have stored a subscription (sub_) or session ID instead. Try to resolve
    // the actual Razorpay payment ID from sibling payment records.
    if (provider.name === 'razorpay' && paymentIntentId && !paymentIntentId.startsWith('pay_')) {
      Logger.info('Razorpay externalPaymentId is not a pay_ ID, attempting resolution', {
        actorId,
        paymentId: params.paymentId,
        storedId: paymentIntentId,
      });

      // Look for another payment record on the same subscription with a valid pay_ ID
      if (payment.subscriptionId) {
        try {
          const sibling = await prisma.payment.findFirst({
            where: {
              subscriptionId: payment.subscriptionId,
              NOT: { id: payment.id },
              externalPaymentId: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            select: { externalPaymentId: true },
          });
          if (sibling?.externalPaymentId?.startsWith('pay_')) {
            Logger.info('Resolved Razorpay pay_ ID from sibling payment record', {
              actorId,
              paymentId: params.paymentId,
              originalId: paymentIntentId,
              resolvedId: sibling.externalPaymentId,
            });
            paymentIntentId = sibling.externalPaymentId;
          }
        } catch (err: unknown) {
          Logger.warn('Failed to look up sibling payment for Razorpay pay_ ID resolution', {
            actorId,
            paymentId: params.paymentId,
            error: toError(err).message,
          });
        }
      }
    }

    if (paymentIntentId && !paymentIntentId.startsWith('pi_test_')) {
      try {
        refund = await provider.refundPayment(paymentIntentId, undefined, refundReason);
        Logger.info('Provider refund created successfully', {
          actorId,
          paymentId: params.paymentId,
          refundCreated: true
        });
      } catch (err: unknown) {
        const e = toError(err);
        const providerError = err instanceof PaymentProviderError ? err : null;
        const providerMeta = asRecord(providerError?.originalError);
        const providerStatus = typeof providerMeta?.status === 'number' ? providerMeta.status : undefined;
        const providerRequestId = typeof providerMeta?.requestId === 'string' ? providerMeta.requestId : undefined;
        const isTransientProviderFailure = typeof providerStatus === 'number' ? providerStatus >= 500 : false;

        Logger.error('Provider refund creation failed', {
          actorId,
          paymentId: params.paymentId,
          provider: provider.name,
          providerStatus,
          providerRequestId,
          error: e.message,
        });

        // Extract a clean, user-friendly error message.
        // Provider errors look like:
        //   "Razorpay API request failed (400): BAD_REQUEST_ERROR: Your account does not have enough balance..."
        //   "Stripe API request failed (402): card_declined: Your card was declined."
        // We strip the technical prefix and return only the actionable description.
        let userMessage: string;
        if (isTransientProviderFailure) {
          userMessage = 'Payment provider is temporarily unavailable. Please retry in a few minutes.';
        } else if (providerError) {
          const rpError = asRecord((providerMeta as Record<string, unknown>)?.razorpayError);
          const description = typeof rpError?.description === 'string' ? rpError.description : null;
          if (description) {
            userMessage = description;
          } else {
            // Strip common prefix patterns: "Provider API request failed (NNN): CODE: "
            const raw = e.message;
            const colonSplit = raw.split(': ');
            // If we have at least 3 segments (prefix, code, message), take everything after the code
            userMessage = colonSplit.length >= 3
              ? colonSplit.slice(2).join(': ')
              : colonSplit.length >= 2
                ? colonSplit.slice(1).join(': ')
                : raw;
          }
        } else {
          userMessage = 'An unexpected error occurred while processing the refund.';
        }

        return NextResponse.json(
          {
            error: userMessage,
            ...(providerRequestId ? { providerRequestId } : null),
          },
          { status: isTransientProviderFailure ? 502 : 400 },
        );
      }
    } else {
      // For test payments or payments without payment intent, simulate a refund
      refund = {
        id: 're_test_' + Date.now(),
        amount: payment.amountCents,
        status: 'succeeded'
      };
      Logger.info('Test payment refund simulated', {
        actorId,
        paymentId: params.paymentId,
        isTestRefund: true
      });
    }

    // For this admin flow we only issue full refunds; use the local payment amount as canonical.
    // (Providers may return ambiguous amounts depending on tax/items.)
    refund.amount = payment.amountCents;

    // Update payment status and persist refund id when available
    try {
      const mergedRefundIds = mergeProviderIdMap(payment.externalRefundIds, provider.name, String(refund.id));
      await prisma.payment.update({
        where: { id: params.paymentId },
        data: {
          status: 'REFUNDED',
          externalRefundId: String(refund.id),
          externalRefundIds: mergedRefundIds ?? payment.externalRefundIds,
          ...(provider.name === 'stripe' ? { stripeRefundId: String(refund.id) } : null),
        }
      });
    } catch (err: unknown) {
      Logger.warn('Failed to persist externalRefundId via Prisma update', { paymentId: params.paymentId, error: toError(err).message });
      // Try a best-effort fallback: update status only so the refund is recorded.
      try {
        await prisma.payment.update({ where: { id: params.paymentId }, data: { status: 'REFUNDED' } });
      } catch (innerErr: unknown) {
        Logger.error('Failed to update payment status after externalRefundId failure', { paymentId: params.paymentId, error: toError(innerErr).message });
      }
    }

    // Handle subscription refund with proper stacking logic
    let localModeForLog: 'immediate' | 'period_end' = localCancelMode;
    if (payment.subscription) {
      const subscription = payment.subscription;
      const now = new Date();
      const hasExternalId = typeof subscription.externalSubscriptionId === 'string' && subscription.externalSubscriptionId.length > 0;
      const shouldCallProvider = cancelSubscription && hasExternalId;
      const providerCancelImmediately = shouldCallProvider && cancelMode === 'immediate';
      // If period_end, we call cancelSubscription with immediately=false

      let scheduledCancellationDate: Date | null = null;

      if (shouldCallProvider) {
        try {
          // If cancelMode is 'period_end', immediately=false. If 'immediate', immediately=true.
          // Use the same provider that processed the original payment
          const updatedSub = await provider.cancelSubscription(subscription.externalSubscriptionId!, providerCancelImmediately);

          if (!providerCancelImmediately && updatedSub.currentPeriodEnd) {
            scheduledCancellationDate = updatedSub.currentPeriodEnd;
          }

          Logger.info('Cancelled/Scheduled Provider subscription during refund', {
            actorId,
            subscriptionId: subscription.id,
            externalSubscriptionId: subscription.externalSubscriptionId,
            mode: cancelMode
          });
        } catch (err: unknown) {
          const e = toError(err);
          Logger.warn('Failed to cancel Provider subscription during refund', {
            actorId,
            subscriptionId: subscription.id,
            error: e.message
          });
          // Continue with local refund even if Provider cancellation fails
        }
      } else if (cancelSubscription && !hasExternalId) {
        Logger.warn('Provider cancellation requested but subscription lacks externalSubscriptionId', {
          actorId,
          subscriptionId: subscription.id
        });
      }

      const localMode = localCancelMode;
      localModeForLog = localMode;

      if (subscription.status === 'PENDING') {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'EXPIRED', expiresAt: now, canceledAt: now }
        });
        Logger.info(`Refunded PENDING subscription ${subscription.id} - removed from stack queue`);
        organizationSyncTargets.add(subscription.userId);
      } else if (localMode === 'period_end') {
        const targetCancellationDate = scheduledCancellationDate
          ?? (subscription.expiresAt ? new Date(subscription.expiresAt) : now);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { canceledAt: targetCancellationDate }
        });
        Logger.info('Marked subscription for scheduled cancellation after refund', {
          actorId,
          subscriptionId: subscription.id,
          scheduledFor: targetCancellationDate.toISOString(),
          schedulingSource: shouldCallProvider && !providerCancelImmediately ? 'provider' : 'local'
        });
      } else {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'CANCELLED', expiresAt: now, canceledAt: now }
        });

        try {
          const shouldClear = await shouldClearPaidTokensOnExpiry({ userId: subscription.userId, subscription, requestFlag: clearPaidTokens });
          if (shouldClear) {
            await prisma.user.update({ where: { id: subscription.userId }, data: { tokenBalance: 0 } });

            if (subscription.organizationId && subscription.planId) {
              const plan = await prisma.plan.findUnique({ where: { id: subscription.planId }, select: { supportsOrganizations: true } });
              if (plan?.supportsOrganizations) {
                await resetOrganizationSharedTokens({ organizationId: subscription.organizationId });
              }
            }
          } else {
            Logger.info('Skipping paid token clear during refund because shouldClear=false', { actorId, subscriptionId: subscription.id, userId: subscription.userId });
          }
        } catch (err: unknown) {
          Logger.warn('Failed to reset token balance during refund cancellation', { userId: subscription.userId, subscriptionId: subscription.id, error: toError(err).message });
        }

        const nextPending = await prisma.subscription.findFirst({
          where: { userId: subscription.userId, status: 'PENDING' },
          orderBy: { createdAt: 'asc' }
        });

        if (nextPending) {
          const originalDurationMs = Math.max(0, nextPending.expiresAt.getTime() - nextPending.startedAt.getTime());
          await prisma.subscription.update({
            where: { id: nextPending.id },
            data: {
              status: 'ACTIVE',
              startedAt: now,
              expiresAt: new Date(now.getTime() + originalDurationMs)
            }
          });
          Logger.info(`Promoted PENDING subscription ${nextPending.id} to ACTIVE after refunding ${subscription.id}`);
          organizationSyncTargets.add(subscription.userId);
        }
      }

      Logger.info('Applied refund cancellation mode', {
        actorId,
        subscriptionId: subscription.id,
        cancelSubscription,
        cancelMode: cancelSubscription && shouldCallProvider ? cancelMode : 'none',
        localCancelMode: localMode,
        externalSubscriptionAvailable: hasExternalId
      });
    }

    // Audit log the refund action
    Logger.info('Payment refund processed successfully', {
      actorId,
      paymentId: params.paymentId,
      refundId: refund.id,
      amount: refund.amount,
      reason: refundReason,
      hasNotes: !!notes
    });

    // Recompute and persist the subscription's denormalized lastPaymentAmountCents
    // so subscription amount-sorts remain accurate after refunds.
    if (payment.subscriptionId) {
      try {
        const latestNonRefunded = await prisma.payment.findFirst({
          where: {
            subscriptionId: payment.subscriptionId,
            // Exclude refunded payments so the denormalized value reflects the last non-refunded amount
            status: { not: 'REFUNDED' }
          },
          orderBy: { createdAt: 'desc' },
          select: { amountCents: true }
        });

        await prisma.subscription.update({
          where: { id: payment.subscriptionId },
          data: { lastPaymentAmountCents: latestNonRefunded ? latestNonRefunded.amountCents : null }
        });
        Logger.info('Updated subscription.lastPaymentAmountCents after refund', {
          actorId,
          subscriptionId: payment.subscriptionId,
          newAmount: latestNonRefunded ? latestNonRefunded.amountCents : null
        });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('Failed to update subscription.lastPaymentAmountCents after refund', {
          actorId,
          subscriptionId: payment.subscriptionId,
          error: e.message
        });
      }
    }

    await recordAdminAction({
      actorId: actorId as string,
      actorRole: actorRole ?? 'ADMIN',
      action: 'payments.refund',
      targetUserId: payment.userId,
      targetType: payment.subscription ? 'subscription' : 'payment',
      details: {
        paymentId: payment.id,
        subscriptionId: payment.subscriptionId ?? null,
        amountCents: payment.amountCents,
        refundedAmountCents: refund.amount,
        currency: payment.currency,
        reason: refundReason,
        cancelSubscription,
        cancelMode: cancelSubscription ? cancelMode : 'none',
        localCancelMode: payment.subscription ? localModeForLog : 'none',
        clearPaidTokens,
        stripeCancellationAttempted: cancelSubscription && !!payment.subscription?.externalSubscriptionId,
        hasStripeSubscription: !!payment.subscription?.externalSubscriptionId,
        notes: notes ?? null,
        refundId: refund.id
      }
    });

    // Send refund notification (email + in-app)
    try {
      const plan = payment.subscription ? await prisma.plan.findUnique({
        where: { id: payment.subscription.planId },
        select: { name: true }
      }) : null;

      await sendBillingNotification({
        userId: payment.userId,
        title: 'Refund Processed',
        message: `A refund of ${formatCurrency(refund.amount, payment.currency)} has been processed for your payment.`,
        templateKey: 'refund_issued',
        variables: {
          amount: formatCurrency(refund.amount, payment.currency),
          planName: plan?.name || 'Unknown Plan',
          transactionId: payment.id,
          startedAt: new Date().toLocaleDateString(),
        }
      });
    } catch (notifErr: unknown) {
      const e = toError(notifErr);
      Logger.warn('Failed to send refund notification', {
        paymentId: params.paymentId,
        error: e.message
      });
      // Don't fail the refund if notification fails
    }

    // Send admin notification
    try {
      await sendAdminNotificationEmail({
        userId: payment.userId,
        title: 'Refund Processed',
        alertType: 'refund',
        message: `Refund of $${(refund.amount / 100).toFixed(2)} processed for user ${payment.userId}`,
        templateKey: 'admin_notification',
        actorId,
        actorRole,
        variables: {
          amount: `$${(refund.amount / 100).toFixed(2)}`,
          transactionId: payment.id,
          reason: refundReason,
          eventTitle: 'Refund Processed',
          eventSummary: `Refund of $${(refund.amount / 100).toFixed(2)} processed`,
        }
      });
    } catch (adminNotifErr: unknown) {
      Logger.warn('Failed to send admin refund notification', { error: toError(adminNotifErr).message });
    }

    // Log API performance
    Logger.apiRequest('POST', `/api/admin/payments/${params.paymentId}/refund`, actorId, Date.now() - startTime);

    for (const targetUserId of organizationSyncTargets) {
      try {
        await syncOrganizationEligibilityForUser(targetUserId, { ignoreGrace: true });
      } catch (err: unknown) {
        const syncError = toError(err);
        Logger.warn('Failed to sync organization eligibility after admin refund', {
          userId: targetUserId,
          error: syncError.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      refund: { id: refund.id, amount: refund.amount, status: refund.status }
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const e = toError(error);
    Logger.error('Payment refund error', { error: e.message, stack: e.stack, userId: actorId });
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 });
  }
}
