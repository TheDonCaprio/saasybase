import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
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
    return jsonError('Only the workspace owner can undo this workspace cancellation', 403, 'WORKSPACE_BILLING_OWNER_REQUIRED');
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
  });
  if (!subscription) return jsonError('No active subscription', 400, 'SUBSCRIPTION_NOT_ACTIVE');

  const subId = subscription.externalSubscriptionId;

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
    Logger.info('User undone subscription cancellation', {
      userId,
      scopedUserId,
      activeOrganizationId: scopedOrganizationId,
      subscriptionId: subscription.id,
      externalSubscriptionId: subId,
      ip,
    });

    return NextResponse.json({ ok: true, message: 'undo_succeeded', subscription: result });
  } catch (err: unknown) {
    const e = toError(err);
    Logger.error('Error undoing cancellation', { error: e.message, stack: e.stack, userId, subscriptionId: subscription?.id });
    return jsonError(e.message || 'Failed to undo cancellation', 500, 'UNDO_CANCEL_FAILED');
  }
}
