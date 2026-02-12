export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { paymentService } from '../../../../lib/payment/service';
import { prisma } from '../../../../lib/prisma';
import { formatCurrency } from '../../../../lib/utils/currency';
import { getActiveCurrency } from '../../../../lib/payment/registry';
import { Logger } from '../../../../lib/logger';
import { PLAN_DEFINITIONS, resolvePlanPriceEnv, syncPlanExternalPriceIds } from '../../../../lib/plans';
import { isRecurringProrationEnabled, shouldResetPaidTokensOnRenewalForPlanAutoRenew } from '../../../../lib/settings';
import { sendBillingNotification, sendAdminNotificationEmail } from '../../../../lib/notifications';
import type { Prisma } from '@prisma/client';
import { toError, asRecord } from '../../../../lib/runtime-guards';
import { findProviderByValue, getCurrentProviderKey, getIdByProvider } from '../../../../lib/utils/provider-ids';

function jsonError(message: string, status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra || {}) }, { status });
}

interface ProrationContext {
  userId: string;
  externalCustomerId: string;
  providerKey: string;
  currentSubscription: SubscriptionWithPlan;
  targetPlan: PlanRecord;
  targetExternalPriceId: string;
}

type SubscriptionWithPlan = {
  id: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  externalSubscriptionId: string | null;
  externalSubscriptionIds: string | null;
  paymentProvider: string | null;
  plan: { id: string; name: string; priceCents: number; autoRenew: boolean };
};

type PlanRecord = {
  id: string;
  name: string;
  priceCents: number;
  autoRenew: boolean;
  externalPriceId: string | null;
  stripePriceId: string | null;
  externalPriceIds: string | null;
};

async function fetchCurrentSubscription(userId: string): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      startedAt: { lte: new Date() },
      expiresAt: { gt: new Date() },
      plan: { autoRenew: true },
    },
    select: {
      id: true,
      planId: true,
      startedAt: true,
      expiresAt: true,
      status: true,
      cancelAtPeriodEnd: true,
      externalSubscriptionId: true,
      externalSubscriptionIds: true,
      paymentProvider: true,
      plan: {
        select: { id: true, name: true, priceCents: true, autoRenew: true },
      },
    },
    orderBy: { expiresAt: 'desc' },
  }) as unknown as Promise<SubscriptionWithPlan | null>;
}

async function fetchPlan(planId: string): Promise<PlanRecord | null> {
  return prisma.plan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      name: true,
      priceCents: true,
      autoRenew: true,
      externalPriceId: true,
      stripePriceId: true,
      externalPriceIds: true,
    },
  }) as unknown as Promise<PlanRecord | null>;
}

async function resolveExternalPriceId(plan: PlanRecord, providerKey: string): Promise<string | null> {
  // First try provider-aware lookup from the externalPriceIds map
  const priceFromMap = getIdByProvider(plan.externalPriceIds, providerKey);
  if (priceFromMap) return priceFromMap;

  // Fall back to legacy single fields when they clearly correspond to the provider.
  if (providerKey === 'stripe' && plan.stripePriceId) return plan.stripePriceId;

  // `externalPriceId` is legacy single-provider; only trust it when it matches the active provider.
  const activeProviderKey = getCurrentProviderKey();
  if (providerKey === activeProviderKey && plan.externalPriceId) return plan.externalPriceId;

  // Fall back to environment variables for seeded plans ONLY when the subscription provider is the active provider.
  // (We don't have provider-keyed env resolution here, so using env when providers differ risks choosing the wrong price.)
  if (providerKey !== activeProviderKey) return null;

  const seed = PLAN_DEFINITIONS.find((entry) => entry.name === plan.name);
  if (!seed) return null;
  const resolved = resolvePlanPriceEnv(seed);
  if (!resolved.priceId) return null;
  try {
    await syncPlanExternalPriceIds();
  } catch (err) {
    const e = toError(err);
    Logger.warn('Failed to sync plan external price ids during proration resolution', { error: e.message });
  }
  return resolved.priceId;
}

function resolveProviderKeyForSubscription(sub: SubscriptionWithPlan): string {
  const explicit = typeof sub.paymentProvider === 'string' ? sub.paymentProvider.toLowerCase() : null;
  if (explicit) return explicit;

  const externalId = typeof sub.externalSubscriptionId === 'string' ? sub.externalSubscriptionId : null;
  if (externalId) {
    const fromMap = findProviderByValue(sub.externalSubscriptionIds, externalId);
    if (fromMap) return fromMap.toLowerCase();
  }

  return getCurrentProviderKey();
}

async function resolveContext(planId: string, userId: string): Promise<ProrationContext> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, externalCustomerId: true, externalCustomerIds: true },
  });
  if (!dbUser) {
    throw new Error('USER_NOT_FOUND');
  }

  const currentSubscription = await fetchCurrentSubscription(userId);
  if (!currentSubscription) {
    throw new Error('NO_ACTIVE_RECURRING_SUBSCRIPTION');
  }

  const providerKey = resolveProviderKeyForSubscription(currentSubscription);

  const targetPlan = await fetchPlan(planId);
  if (!targetPlan) {
    throw new Error('TARGET_PLAN_NOT_FOUND');
  }

  if (!targetPlan.autoRenew) {
    throw new Error('TARGET_PLAN_NOT_RECURRING');
  }

  if (currentSubscription.planId === targetPlan.id) {
    throw new Error('TARGET_PLAN_SAME_AS_CURRENT');
  }

  if (!currentSubscription.externalSubscriptionId) {
    throw new Error('CURRENT_SUBSCRIPTION_MISSING_EXTERNAL_ID');
  }

  const externalCustomerId = getIdByProvider(
    dbUser.externalCustomerIds,
    providerKey,
    dbUser.externalCustomerId,
  );
  if (!externalCustomerId) throw new Error('USER_MISSING_EXTERNAL_CUSTOMER');

  const targetExternalPriceId = await resolveExternalPriceId(targetPlan, providerKey);
  if (!targetExternalPriceId) {
    throw new Error('TARGET_PLAN_PRICE_MISSING');
  }

  return {
    userId,
    externalCustomerId,
    providerKey,
    currentSubscription,
    targetPlan,
    targetExternalPriceId,
  };
}

function unauthorizedResponse() {
  return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
}

function prorationDisabledResponse(reason?: string) {
  return NextResponse.json(
    { prorationEnabled: false, reason: reason || 'PRORATION_DISABLED', code: reason || 'PRORATION_DISABLED' },
    { status: 409 },
  );
}

function badRequest(message: string) {
  return jsonError(message, 400, 'BAD_REQUEST');
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    let actorUserId = userId ?? null;

    if (!actorUserId && process.env.NODE_ENV !== 'production') {
      const fallback = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
      actorUserId = fallback?.id ?? null;
    }

    if (!actorUserId) return unauthorizedResponse();

    const enabled = await isRecurringProrationEnabled();
    if (!enabled) return prorationDisabledResponse();

    const planId = req.nextUrl.searchParams.get('planId');
    if (!planId) return badRequest('Missing planId');

    const ctx = await resolveContext(planId, actorUserId);

    // Use the subscription's originating provider for proration preview
    const provider = paymentService.getProviderForRecord(ctx.providerKey);
    if (!provider.supportsFeature('proration')) {
      return prorationDisabledResponse('PROVIDER_PRORATION_UNSUPPORTED');
    }
    const preview = await provider.getProrationPreview(
      ctx.currentSubscription.externalSubscriptionId!,
      ctx.targetExternalPriceId,
      ctx.userId
    );

    return NextResponse.json({
      ...preview,
      currentPlan: {
        id: ctx.currentSubscription.plan.id,
        name: ctx.currentSubscription.plan.name,
        priceCents: ctx.currentSubscription.plan.priceCents,
      },
      targetPlan: {
        id: ctx.targetPlan.id,
        name: ctx.targetPlan.name,
        priceCents: ctx.targetPlan.priceCents,
      },
      currentPeriodEnd: null // Provider preview might not return this easily without extra call, or we can add it to result
    });
  } catch (err) {
    const error = toError(err);
    const fallbackableErrors = new Set([
      'NO_ACTIVE_RECURRING_SUBSCRIPTION',
      'TARGET_PLAN_NOT_RECURRING',
      'TARGET_PLAN_SAME_AS_CURRENT',
      'CURRENT_SUBSCRIPTION_MISSING_EXTERNAL_ID',
      'USER_MISSING_EXTERNAL_CUSTOMER',
      'CUSTOMER_MISMATCH',
      'SUBSCRIPTION_ITEMS_NOT_FOUND',
      'PRIMARY_SUBSCRIPTION_ITEM_NOT_FOUND',
      'TARGET_PLAN_PRICE_MISSING',
    ]);

    if (fallbackableErrors.has(error.message)) {
      Logger.info('Proration preview falling back to checkout', { reason: error.message });
      return NextResponse.json(
        { prorationEnabled: false, reason: error.message, code: error.message },
        { status: 409 },
      );
    }

    switch (error.message) {
      case 'USER_NOT_FOUND':
      case 'TARGET_PLAN_NOT_FOUND':
        return jsonError(error.message, 409, error.message);
      default:
        Logger.warn('Proration preview failed', { error: error.message, stack: error.stack });
        return NextResponse.json(
          { prorationEnabled: false, reason: 'PREVIEW_ERROR', code: 'PREVIEW_ERROR' },
          { status: 409 },
        );
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    let actorUserId = userId ?? null;

    if (!actorUserId && process.env.NODE_ENV !== 'production') {
      const fallback = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
      actorUserId = fallback?.id ?? null;
    }

    if (!actorUserId) return unauthorizedResponse();

    const enabled = await isRecurringProrationEnabled();
    if (!enabled) return prorationDisabledResponse();

    const payload = await req.json().catch(() => ({}));
    const body = asRecord(payload) || {};
    const planIdRaw = body['planId'];
    const planId = typeof planIdRaw === 'string' ? planIdRaw : null;
    if (!planId) return badRequest('Missing planId');

    const scheduleAtRaw = body['scheduleAt'];
    const scheduleAt = scheduleAtRaw === 'cycle_end' ? 'cycle_end' : null;

    const ctx = await resolveContext(planId, actorUserId);

    // Use the subscription's originating provider to update subscription
    const provider = paymentService.getProviderForRecord(ctx.providerKey);

    // Schedule a cycle-end plan change when the provider supports it.
    // This is used by providers like Razorpay that can update plan_id at renewal.
    if (scheduleAt === 'cycle_end') {
      if (typeof provider.scheduleSubscriptionPlanChange !== 'function') {
        return prorationDisabledResponse('PROVIDER_SCHEDULED_PLAN_CHANGE_UNSUPPORTED');
      }

      const result = await provider.scheduleSubscriptionPlanChange(
        ctx.currentSubscription.externalSubscriptionId!,
        ctx.targetExternalPriceId,
        ctx.userId
      );

      // Paystack implements pay-at-renewal by disabling the current subscription.
      // Reflect that provider state locally so we can avoid repeated scheduling.
      if (provider.name === 'paystack' && ctx.currentSubscription.cancelAtPeriodEnd !== true) {
        try {
          await prisma.subscription.update({
            where: { id: ctx.currentSubscription.id },
            data: { cancelAtPeriodEnd: true, canceledAt: ctx.currentSubscription.expiresAt },
          });
        } catch (err) {
          const e = toError(err);
          Logger.warn('Failed to mark subscription as non-renewing after Paystack schedule', {
            userId: ctx.userId,
            subscriptionId: ctx.currentSubscription.id,
            error: e.message,
          });
        }
      }

      const newPeriodEnd = result.newPeriodEnd || null;

      return NextResponse.json({
        ok: true,
        scheduled: true,
        newPlan: {
          id: ctx.targetPlan.id,
          name: ctx.targetPlan.name,
          priceCents: ctx.targetPlan.priceCents,
        },
        currentPeriodEnd: newPeriodEnd ? newPeriodEnd.toISOString() : null,
      });
    }

    if (!provider.supportsFeature('subscription_updates')) {
      return prorationDisabledResponse('PROVIDER_SUBSCRIPTION_UPDATES_UNSUPPORTED');
    }

    const result = await provider.updateSubscriptionPlan(
      ctx.currentSubscription.externalSubscriptionId!,
      ctx.targetExternalPriceId,
      ctx.userId
    );

    const newPeriodEnd = result.newPeriodEnd || null;

    // Immediately replace the existing subscription with the new plan.
    // Set `startedAt` to now to indicate the change is effective immediately.
    const now = new Date();
    const expiresAtValue = newPeriodEnd ?? ctx.currentSubscription.expiresAt ?? undefined;

    const updateData: Prisma.SubscriptionUpdateInput = {
      plan: { connect: { id: ctx.targetPlan.id } },
      startedAt: now,
      ...(expiresAtValue ? { expiresAt: expiresAtValue } : {}),
    };

    await prisma.subscription.update({
      where: { id: ctx.currentSubscription.id },
      data: updateData,
    });

    // Adjust token balance according to admin "Paid token operations" setting.
    // If the admin has configured tokens to be reset on renewal for recurring plans,
    // reset the user's paid token balance to the new plan's allotment. Otherwise,
    // preserve the user's existing token balance.
    try {
      const shouldReset = await shouldResetPaidTokensOnRenewalForPlanAutoRenew(ctx.targetPlan.autoRenew);
      if (shouldReset) {
        const planRec = await prisma.plan.findUnique({ where: { id: ctx.targetPlan.id }, select: { tokenLimit: true } });
        const tokenLimit = planRec && typeof planRec.tokenLimit === 'number' ? planRec.tokenLimit : null;
        if (tokenLimit !== null) {
          await prisma.user.update({ where: { id: ctx.userId }, data: { tokenBalance: tokenLimit } });
          Logger.info('Reset user token balance to new recurring plan allotment per admin setting', { userId: ctx.userId, tokenLimit });
        }
      } else {
        Logger.info('Preserving user token balance on recurring->recurring plan change per admin setting', { userId: ctx.userId });
      }
    } catch (err) {
      const e = toError(err);
      Logger.warn('Failed to apply paid-token operation after proration', { error: e.message, userId: ctx.userId });
    }

    // Notify user about the plan change (upgrade/downgrade) on recurring swaps.
    try {
      const priceDelta = ctx.targetPlan.priceCents - ctx.currentSubscription.plan.priceCents;
      const isUpgrade = priceDelta > 0;
      const isDowngrade = priceDelta < 0;

      if (isUpgrade || isDowngrade) {
        const templateKey = isUpgrade ? 'subscription_upgraded_recurring' : 'subscription_downgraded';
        const title = isUpgrade ? 'Subscription Upgraded' : 'Subscription Changed';
        const message = isUpgrade
          ? `Your subscription has been upgraded to ${ctx.targetPlan.name}.`
          : `Your subscription has been changed to ${ctx.targetPlan.name}.`;

        const amountCents = typeof result.amountPaid === 'number' && !Number.isNaN(result.amountPaid)
          ? result.amountPaid
          : ctx.targetPlan.priceCents;

        await sendBillingNotification({
          userId: ctx.userId,
          title,
          message,
          templateKey,
          variables: {
            planName: ctx.targetPlan.name,
            amount: formatCurrency(amountCents, getActiveCurrency()),
            startedAt: now.toLocaleDateString(),
            expiresAt: expiresAtValue ? expiresAtValue.toLocaleDateString() : undefined,
            transactionId: (result.invoiceId || ctx.currentSubscription.id)
          },
        });

        const adminTitle = isUpgrade ? 'Subscription upgraded' : 'Subscription downgraded';
        const adminMessage = isUpgrade
          ? `User ${ctx.userId} upgraded to ${ctx.targetPlan.name}. Subscription: ${ctx.currentSubscription.id}`
          : `User ${ctx.userId} downgraded to ${ctx.targetPlan.name}. Subscription: ${ctx.currentSubscription.id}`;

        await sendAdminNotificationEmail({
          userId: ctx.userId,
          title: adminTitle,
          message: adminMessage,
          templateKey: 'admin_notification',
          variables: {
            planName: ctx.targetPlan.name,
            amount: formatCurrency(amountCents, getActiveCurrency()),
            transactionId: result.invoiceId || ctx.currentSubscription.id,
            startedAt: now.toLocaleString(),
          },
        });
      }
    } catch (err) {
      const e = toError(err);
      Logger.warn('Failed to send proration change notification', { error: e.message, userId: ctx.userId });
    }

    return NextResponse.json({
      ok: true,
      newPlan: {
        id: ctx.targetPlan.id,
        name: ctx.targetPlan.name,
        priceCents: ctx.targetPlan.priceCents,
      },
      currentPeriodEnd: newPeriodEnd ? newPeriodEnd.toISOString() : null,
      invoiceId: result.invoiceId || null,
      actualAmountCharged: typeof result.amountPaid === 'number' && !Number.isNaN(result.amountPaid)
        ? result.amountPaid
        : null,
    });
  } catch (err) {
    const error = toError(err);
    switch (error.message) {
      case 'USER_NOT_FOUND':
      case 'NO_ACTIVE_RECURRING_SUBSCRIPTION':
      case 'TARGET_PLAN_NOT_FOUND':
      case 'TARGET_PLAN_NOT_RECURRING':
      case 'TARGET_PLAN_SAME_AS_CURRENT':
      case 'CURRENT_SUBSCRIPTION_MISSING_EXTERNAL_ID':
      case 'USER_MISSING_EXTERNAL_CUSTOMER':
      case 'CUSTOMER_MISMATCH':
      case 'SUBSCRIPTION_ITEMS_NOT_FOUND':
      case 'PRIMARY_SUBSCRIPTION_ITEM_NOT_FOUND':
      case 'TARGET_PLAN_PRICE_MISSING':
      case 'PAYSTACK_CUSTOMER_MISSING':
      case 'PAYSTACK_AUTHORIZATION_REQUIRED':
      case 'PAYSTACK_SCHEDULE_FAILED':
        return jsonError(error.message, 409, error.message);
      default:
        Logger.error('Proration update failed', { error: error.message, stack: error.stack });
        return jsonError('Failed to update subscription with proration', 500, 'PRORATION_UPDATE_FAILED');
    }
  }
}
