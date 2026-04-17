import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { sendBillingNotification } from '../../../../lib/notifications';
import { paymentService } from '../../../../lib/payment/service';
import { getOrganizationPlanContext, getPlanScope, getSubscriptionScopeFilter } from '../../../../lib/user-plan-context';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

function resolveExplicitActiveOrganizationId(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const candidates = [payload.activeOrganizationId, payload.organizationId, payload.localOrganizationId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

export async function POST(req: Request) {
  const { userId, orgId } = await authService.getSession();
  if (!userId) return jsonError('Unauthorized', 401, 'UNAUTHORIZED');

  const requestBody = await req.json().catch(() => null) as Record<string, unknown> | null;
  const requestedActiveOrganizationId = resolveExplicitActiveOrganizationId(requestBody) ?? orgId ?? null;
  const planScope = getPlanScope(requestedActiveOrganizationId);
  const organizationPlan = planScope === 'WORKSPACE'
    ? await getOrganizationPlanContext(userId, requestedActiveOrganizationId)
    : null;

  if (planScope === 'WORKSPACE' && organizationPlan?.role === 'MEMBER') {
    return jsonError('Only the workspace owner can cancel this workspace subscription', 403, 'WORKSPACE_BILLING_OWNER_REQUIRED');
  }

  const scopedUserId = planScope === 'WORKSPACE' && organizationPlan?.organization.ownerUserId
    ? organizationPlan.organization.ownerUserId
    : userId;
  const scopedOrganizationId = planScope === 'WORKSPACE'
    ? organizationPlan?.organization.id ?? null
    : null;

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId: scopedUserId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
      ...getSubscriptionScopeFilter(planScope),
      ...(scopedOrganizationId ? { organizationId: scopedOrganizationId } : {}),
    },
    include: { plan: true },
  });

  if (!subscription) {
    return jsonError('No active subscription found', 400, 'SUBSCRIPTION_NOT_ACTIVE');
  }

  // If there's no external subscription ID or plan is not autoRenew, inform client that plan will simply expire
  const planRec = (subscription.plan && typeof subscription.plan === 'object') ? subscription.plan as Record<string, unknown> : null;
  const planAutoRenew = planRec?.autoRenew === true;

  const subId = subscription.externalSubscriptionId;

  if (!subId || !planAutoRenew) {
    return NextResponse.json({ ok: true, message: 'non_recurring', expiresAt: subscription.expiresAt });
  }

  try {
    // Use the subscription's originating provider for cancellation
    const provider = paymentService.getProviderForRecord(subscription.paymentProvider);
    const providerName = subscription.paymentProvider || 'stripe';
    
    // Schedule cancellation at period end (pass immediately=false)
    const result = await provider.cancelSubscription(subId, false);

    // For providers without native cancel-at-period-end (like Paystack),
    // store the intent in DB - we'll cancel on next invoice.created webhook
    const needsDbCancelAtPeriodEnd = providerName === 'paystack';
    
    // Persist current_period_end as canceledAt if present
    const periodEnd = result.currentPeriodEnd;
    const updateData: { canceledAt?: Date; cancelAtPeriodEnd?: boolean } = {};
    
    if (periodEnd) {
      updateData.canceledAt = periodEnd;
    } else {
      updateData.canceledAt = subscription.expiresAt ? new Date(subscription.expiresAt) : new Date();
    }
    
    if (needsDbCancelAtPeriodEnd) {
      updateData.cancelAtPeriodEnd = true;
    }
    
    await prisma.subscription.update({ where: { id: subscription.id }, data: updateData });

    // Audit log the cancellation scheduling (include client IP when available)
    const ip = req?.headers?.get?.('x-forwarded-for') ?? req?.headers?.get?.('x-real-ip') ?? 'unknown';
    Logger.info('User scheduled subscription cancellation', {
      userId,
      scopedUserId,
      activeOrganizationId: scopedOrganizationId,
      subscriptionId: subscription.id,
      externalSubscriptionId: subId,
      ip,
    });

    // Send cancellation notification (email + in-app) - do this before returning
    const expiresDate = periodEnd || subscription.expiresAt;
    try {
      await sendBillingNotification({
        userId,
        title: 'Subscription Cancelled',
        message: `Your ${subscription.plan.name} subscription has been cancelled and will expire on ${expiresDate.toLocaleDateString()}.`,
        templateKey: 'subscription_cancelled',
        variables: {
          planName: subscription.plan.name,
          expiresAt: expiresDate.toLocaleDateString(),
        }
      });
    } catch (notifErr: unknown) {
      const e = toError(notifErr);
      Logger.warn('Failed to send cancellation notification', {
        userId,
        subscriptionId: subscription.id,
        error: e.message
      });
      // Don't fail the cancellation if notification fails
    }

    return NextResponse.json({ ok: true, message: 'cancellation_scheduled', subscription: result });
  } catch (err: unknown) {
    // Normalize and log error using the shared runtime helper
    const e = toError(err);
    Logger.error('Error cancelling subscription', { error: e.message, stack: e.stack, userId, subscriptionId: subscription?.id });
    return jsonError(e.message || 'Failed to cancel subscription', 500, 'SUBSCRIPTION_CANCEL_FAILED');
  }
}
