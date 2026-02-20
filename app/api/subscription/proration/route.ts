export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { paymentService } from '../../../../lib/payment/service';
import { prisma } from '../../../../lib/prisma';
import { formatCurrency } from '../../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
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
  canceledAt: Date | null;
  cancelAtPeriodEnd: boolean;
  externalSubscriptionId: string | null;
  externalSubscriptionIds: string | null;
  paymentProvider: string | null;
  prorationPendingSince: Date | null;
  organizationId: string | null;
  plan: { id: string; name: string; priceCents: number; autoRenew: boolean; recurringInterval: string | null; recurringIntervalCount: number };
};

type PlanRecord = {
  id: string;
  name: string;
  priceCents: number;
  autoRenew: boolean;
  recurringInterval: string | null;
  recurringIntervalCount: number;
  externalPriceId: string | null;
  stripePriceId: string | null;
  externalPriceIds: string | null;
};

/**
 * Convert a plan price to a daily rate for fair cross-interval comparison.
 * e.g. $300/month vs $100/day → $10/day vs $100/day → daily is an upgrade.
 */
function normalizePriceToDailyRate(priceCents: number, interval: string | null, intervalCount: number): number {
  const count = intervalCount || 1;
  const totalPerCycle = priceCents;
  switch (interval) {
    case 'day':   return totalPerCycle / (1 * count);
    case 'week':  return totalPerCycle / (7 * count);
    case 'month': return totalPerCycle / (30 * count);
    case 'year':  return totalPerCycle / (365 * count);
    default:      return totalPerCycle; // non-recurring or unknown
  }
}

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
      canceledAt: true,
      cancelAtPeriodEnd: true,
      externalSubscriptionId: true,
      externalSubscriptionIds: true,
      paymentProvider: true,
      prorationPendingSince: true,
      organizationId: true,
      plan: {
        select: { id: true, name: true, priceCents: true, autoRenew: true, recurringInterval: true, recurringIntervalCount: true },
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
      recurringInterval: true,
      recurringIntervalCount: true,
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

    // If a previous immediate proration switch is still being processed (invoice
    // not yet captured), tell the frontend so it can show a processing state.
    const PRORATION_PENDING_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
    if (ctx.currentSubscription.prorationPendingSince) {
      const elapsed = Date.now() - ctx.currentSubscription.prorationPendingSince.getTime();
      if (elapsed < PRORATION_PENDING_MAX_AGE_MS) {
        return NextResponse.json({
          prorationEnabled: false,
          prorationPending: true,
          reason: 'PRORATION_PENDING',
          code: 'PRORATION_PENDING',
          message: 'Your previous plan change is still being processed. Please wait a moment.',
        }, { status: 409 });
      }
      // Stale flag — clear it silently and continue.
      try {
        await prisma.subscription.update({
          where: { id: ctx.currentSubscription.id },
          data: { prorationPendingSince: null },
        });
      } catch { /* best-effort */ }
    }

    // Use the subscription's originating provider for proration preview
    const provider = paymentService.getProviderForRecord(ctx.providerKey);
    if (!provider.supportsFeature('proration')) {
      // Provider can't generate a proration preview, but may still support
      // inline subscription updates ("switch now" without preview).
      if (provider.supportsFeature('subscription_updates')) {
        // Paystack doesn't offer proration at all (cancel + recreate at full price).
        // Don't show an estimated proration breakdown — just allow the switch with
        // plan info and upgrade/downgrade detection.
        if (ctx.providerKey === 'paystack') {
          const { expiresAt } = ctx.currentSubscription;
          const currentPriceCents = ctx.currentSubscription.plan.priceCents;
          const targetPriceCents = ctx.targetPlan.priceCents;

          const currentDailyRate = normalizePriceToDailyRate(
            currentPriceCents,
            ctx.currentSubscription.plan.recurringInterval,
            ctx.currentSubscription.plan.recurringIntervalCount,
          );
          const targetDailyRate = normalizePriceToDailyRate(
            targetPriceCents,
            ctx.targetPlan.recurringInterval,
            ctx.targetPlan.recurringIntervalCount,
          );
          const isDowngrade = targetDailyRate < currentDailyRate;

          return NextResponse.json({
            prorationEnabled: false,
            supportsInlineSwitch: true,
            isDowngrade,
            downgradeScheduledAtCycleEnd: false,
            reason: 'PROVIDER_PRORATION_UNSUPPORTED',
            code: 'PROVIDER_PRORATION_UNSUPPORTED',
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
            currentPeriodEnd: expiresAt ? expiresAt.toISOString() : null,
          });
        }

        // Other providers (e.g. Razorpay): attempt a local time-proportional
        // proration estimate so the user sees an approximate breakdown.
        const now = new Date();
        const { startedAt, expiresAt } = ctx.currentSubscription;
        if (startedAt && expiresAt && expiresAt > now) {
          const totalCycleMs = expiresAt.getTime() - startedAt.getTime();
          const remainingMs = expiresAt.getTime() - now.getTime();
          const remainingFraction = totalCycleMs > 0 ? remainingMs / totalCycleMs : 0;

          const currentPriceCents = ctx.currentSubscription.plan.priceCents;
          const targetPriceCents = ctx.targetPlan.priceCents;

          const unusedCredit = Math.round(currentPriceCents * remainingFraction);
          const newPlanCharge = Math.round(targetPriceCents * remainingFraction);
          const amountDue = newPlanCharge - unusedCredit;

          const currency = await getActiveCurrencyAsync();

          // Detect downgrades using normalized daily rates so that cross-interval
          // switches are compared fairly (e.g. $300/month vs $100/day).
          const currentDailyRate = normalizePriceToDailyRate(
            currentPriceCents,
            ctx.currentSubscription.plan.recurringInterval,
            ctx.currentSubscription.plan.recurringIntervalCount,
          );
          const targetDailyRate = normalizePriceToDailyRate(
            targetPriceCents,
            ctx.targetPlan.recurringInterval,
            ctx.targetPlan.recurringIntervalCount,
          );
          const isDowngrade = targetDailyRate < currentDailyRate;

          return NextResponse.json({
            prorationEnabled: true,
            isEstimate: true,
            supportsInlineSwitch: true,
            isDowngrade,
            downgradeScheduledAtCycleEnd: false,
            amountDue,
            currency,
            credit: unusedCredit,
            lineItems: [
              { description: `Unused time on ${ctx.currentSubscription.plan.name}`, amount: -unusedCredit, proration: true },
              { description: `Remaining time on ${ctx.targetPlan.name}`, amount: newPlanCharge, proration: true },
            ],
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
            currentPeriodEnd: expiresAt.toISOString(),
          });
        }

        // Fallback when dates are unavailable — allow switch without preview.
        return NextResponse.json({
          prorationEnabled: false,
          supportsInlineSwitch: true,
          reason: 'PROVIDER_PRORATION_UNSUPPORTED',
          code: 'PROVIDER_PRORATION_UNSUPPORTED',
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
        });
      }
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
  let actorUserId: string | null = null;
  let planId: string | null = null;

  try {
    const { userId } = await auth();
    actorUserId = userId ?? null;

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
    planId = typeof planIdRaw === 'string' ? planIdRaw : null;
    if (!planId) return badRequest('Missing planId');

    const scheduleAtRaw = body['scheduleAt'];
    const scheduleAt = scheduleAtRaw === 'cycle_end' ? 'cycle_end' : null;

    // Frontend signals that this switch should be scheduled at cycle end
    // (e.g. user explicitly chose "Switch at end of cycle").
    const directDowngradeSchedule = body['downgradeScheduledAtCycleEnd'] === true;

    const ctx = await resolveContext(planId, actorUserId);

    // Use the subscription's originating provider to update subscription
    const provider = paymentService.getProviderForRecord(ctx.providerKey);

    // Schedule a cycle-end plan change when the provider supports it.
    // This is used by providers like Razorpay that can update plan_id at renewal.
    if (scheduleAt === 'cycle_end' || directDowngradeSchedule) {
      if (typeof provider.scheduleSubscriptionPlanChange !== 'function') {
        return prorationDisabledResponse('PROVIDER_SCHEDULED_PLAN_CHANGE_UNSUPPORTED');
      }

      // Paystack implements pay-at-renewal by disabling the current subscription.
      // Mark the local record BEFORE calling the provider so that a racing
      // subscription.disable webhook does not set conflicting state.
      let paystackPreMarkedLocalCancel = false;
      if (provider.name === 'paystack' && ctx.currentSubscription.cancelAtPeriodEnd !== true) {
        try {
          await prisma.subscription.update({
            where: { id: ctx.currentSubscription.id },
            data: { cancelAtPeriodEnd: true, canceledAt: ctx.currentSubscription.expiresAt },
          });
          paystackPreMarkedLocalCancel = true;
        } catch (err) {
          const e = toError(err);
          Logger.warn('Failed to mark subscription as non-renewing before Paystack schedule', {
            userId: ctx.userId,
            subscriptionId: ctx.currentSubscription.id,
            error: e.message,
          });
        }
      }

      let result;
      try {
        result = await provider.scheduleSubscriptionPlanChange(
          ctx.currentSubscription.externalSubscriptionId!,
          ctx.targetExternalPriceId,
          ctx.userId
        );
      } catch (err) {
        if (provider.name === 'paystack' && paystackPreMarkedLocalCancel) {
          try {
            await prisma.subscription.update({
              where: { id: ctx.currentSubscription.id },
              data: {
                cancelAtPeriodEnd: ctx.currentSubscription.cancelAtPeriodEnd,
                canceledAt: ctx.currentSubscription.canceledAt,
              },
            });
            Logger.info('Rolled back local non-renewing mark after Paystack schedule failure', {
              subscriptionId: ctx.currentSubscription.id,
              userId: ctx.userId,
            });
          } catch (rollbackErr) {
            const re = toError(rollbackErr);
            Logger.error('Failed to roll back local non-renewing mark after Paystack schedule failure', {
              subscriptionId: ctx.currentSubscription.id,
              userId: ctx.userId,
              error: re.message,
            });
          }
        }
        throw err;
      }

      const newPeriodEnd = result.newPeriodEnd || null;

      // Persist the scheduled plan switch so pages can show a notice.
      try {
        await prisma.subscription.update({
          where: { id: ctx.currentSubscription.id },
          data: {
            scheduledPlanId: ctx.targetPlan.id,
            scheduledPlanDate: newPeriodEnd ?? ctx.currentSubscription.expiresAt ?? null,
          },
        });
      } catch (dbErr) {
        const de = toError(dbErr);
        Logger.warn('Failed to persist scheduledPlanId', { error: de.message, subscriptionId: ctx.currentSubscription.id });
      }

      // Send notification emails for the scheduled plan switch (upgrade/downgrade).
      try {
        const priceDelta = ctx.targetPlan.priceCents - ctx.currentSubscription.plan.priceCents;
        const isUpgrade = priceDelta > 0;
        const isDowngrade = priceDelta < 0;

        if (isUpgrade || isDowngrade) {
          const scheduledDate = newPeriodEnd ?? ctx.currentSubscription.expiresAt;
          const scheduledDateStr = scheduledDate ? scheduledDate.toLocaleDateString() : 'the end of your current billing cycle';
          const templateKey = isUpgrade ? 'subscription_upgraded_recurring' : 'subscription_downgraded';
          const title = isUpgrade ? 'Plan Upgrade Scheduled' : 'Plan Change Scheduled';
          const message = isUpgrade
            ? `Your subscription will be upgraded to ${ctx.targetPlan.name} on ${scheduledDateStr}.`
            : `Your subscription will be changed to ${ctx.targetPlan.name} on ${scheduledDateStr}.`;

          const activeCurrency = await getActiveCurrencyAsync();

          await sendBillingNotification({
            userId: ctx.userId,
            title,
            message,
            templateKey,
            variables: {
              planName: ctx.targetPlan.name,
              amount: formatCurrency(ctx.targetPlan.priceCents, activeCurrency),
              startedAt: scheduledDateStr,
              expiresAt: scheduledDate ? scheduledDate.toLocaleDateString() : undefined,
              transactionId: ctx.currentSubscription.id,
            },
          });

          const adminTitle = isUpgrade ? 'Subscription upgrade scheduled' : 'Subscription downgrade scheduled';
          const adminMessage = isUpgrade
            ? `User ${ctx.userId} scheduled upgrade to ${ctx.targetPlan.name} on ${scheduledDateStr}. Subscription: ${ctx.currentSubscription.id}`
            : `User ${ctx.userId} scheduled downgrade to ${ctx.targetPlan.name} on ${scheduledDateStr}. Subscription: ${ctx.currentSubscription.id}`;

          await sendAdminNotificationEmail({
            userId: ctx.userId,
            title: adminTitle,
            alertType: isUpgrade ? 'upgrade' : 'downgrade',
            message: adminMessage,
            templateKey: 'admin_notification',
            variables: {
              planName: ctx.targetPlan.name,
              amount: formatCurrency(ctx.targetPlan.priceCents, activeCurrency),
              transactionId: ctx.currentSubscription.id,
              startedAt: new Date().toLocaleString(),
            },
          });
        }
      } catch (notifErr) {
        const ne = toError(notifErr);
        Logger.warn('Failed to send scheduled plan change notification', { error: ne.message, userId: ctx.userId });
      }

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

    // SCA / 3D Secure: payment requires customer authentication.
    // Return the clientSecret so the frontend can complete the flow.
    // The DB plan will be reconciled by the subscription.updated webhook once payment succeeds.
    if (result.requiresAction && result.clientSecret) {
      return NextResponse.json({
        ok: true,
        requiresAction: true,
        clientSecret: result.clientSecret,
        newPlan: {
          id: ctx.targetPlan.id,
          name: ctx.targetPlan.name,
          priceCents: ctx.targetPlan.priceCents,
        },
      });
    }

    const newPeriodEnd = result.newPeriodEnd || null;

    // Immediately replace the existing subscription with the new plan.
    // Set `startedAt` to now to indicate the change is effective immediately.
    const now = new Date();
    const expiresAtValue = newPeriodEnd ?? ctx.currentSubscription.expiresAt ?? undefined;

    const computePlanPeriodMs = () => {
      const count = ctx.targetPlan.recurringIntervalCount ?? 1;
      const interval = ctx.targetPlan.recurringInterval;
      if (ctx.targetPlan.autoRenew && interval) {
        switch (interval) {
          case 'day':   return count * 24 * 60 * 60 * 1000;
          case 'week':  return count * 7 * 24 * 60 * 60 * 1000;
          case 'month': return count * 30 * 24 * 60 * 60 * 1000;
          case 'year':  return count * 365 * 24 * 60 * 60 * 1000;
          default: break;
        }
      }
      return 0;
    };

    // Paystack cancel+recreate flow: force-cancel the OLD local subscription and
    // create a fresh ACTIVE record for the new plan.  This matches the established
    // Paystack force-cancel pattern (force locally, schedule-disable on provider).
    // The old externalSubscriptionId is preserved so the incoming
    // subscription.disable webhook can find it and harmlessly skip it.
    if (result.newExternalSubscriptionId) {
      // Force-cancel the old subscription locally
      await prisma.subscription.update({
        where: { id: ctx.currentSubscription.id },
        data: {
          status: 'CANCELLED',
          expiresAt: now,
          canceledAt: now,
          cancelAtPeriodEnd: false,
          scheduledPlanId: null,
          scheduledPlanDate: null,
        },
      });

      // Create a new local subscription for the new plan
      const newSubIdMap = JSON.stringify({ [ctx.providerKey]: result.newExternalSubscriptionId });

      // For Paystack cancel+recreate, the new subscription should start a fresh billing cycle.
      // Prefer the provider-reported period end; otherwise approximate from plan interval.
      const paystackPeriodMs = computePlanPeriodMs();
      const paystackExpiresAt =
        (newPeriodEnd && newPeriodEnd > now)
          ? newPeriodEnd
          : (paystackPeriodMs > 0 ? new Date(now.getTime() + paystackPeriodMs) : (expiresAtValue ?? now));

      await prisma.subscription.create({
        data: {
          userId: ctx.userId,
          planId: ctx.targetPlan.id,
          organizationId: ctx.currentSubscription.organizationId ?? undefined,
          status: 'ACTIVE',
          startedAt: now,
          expiresAt: paystackExpiresAt,
          externalSubscriptionId: result.newExternalSubscriptionId,
          externalSubscriptionIds: newSubIdMap,
          paymentProvider: ctx.providerKey,
          cancelAtPeriodEnd: false,
        } satisfies Prisma.SubscriptionUncheckedCreateInput,
      });
    } else {
      // Standard inline switch (Stripe, Razorpay, etc.) — reuse the same record.
      const updateData: Prisma.SubscriptionUncheckedUpdateInput = {
        planId: ctx.targetPlan.id,
        startedAt: now,
        ...(expiresAtValue ? { expiresAt: expiresAtValue } : {}),
        // Clear any previously scheduled plan switch since the immediate switch succeeded.
        scheduledPlanId: null,
        scheduledPlanDate: null,
        // For Razorpay, the proration invoice must be captured before another
        // switch is allowed.  Mark the subscription as having a pending proration
        // so the GET handler can show a "processing" state.
        prorationPendingSince: ctx.providerKey === 'razorpay' ? now : null,
        // Clear cancel-at-period-end since we are switching immediately.
        cancelAtPeriodEnd: false,
        canceledAt: null,
      };

      await prisma.subscription.update({
        where: { id: ctx.currentSubscription.id },
        data: updateData,
      });
    }

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
            amount: formatCurrency(amountCents, await getActiveCurrencyAsync()),
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
          alertType: isUpgrade ? 'upgrade' : 'downgrade',
          message: adminMessage,
          templateKey: 'admin_notification',
          variables: {
            planName: ctx.targetPlan.name,
            amount: formatCurrency(amountCents, await getActiveCurrencyAsync()),
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
    const razorpayNeedsRemainingCount =
      /razorpay api request failed/i.test(error.message)
      && /remaining_count/i.test(error.message)
      && /different\s+period/i.test(error.message);

    const razorpaySubscriptionNotUpdatableState =
      /razorpay api request failed/i.test(error.message)
      && /can't update subscription/i.test(error.message)
      && /not in authenticated or active state/i.test(error.message);

    const razorpayCycleNotStarted =
      /RAZORPAY_CYCLE_NOT_STARTED/i.test(error.message)
      || (/razorpay/i.test(error.message) && /cycle start is in future/i.test(error.message));

    if (razorpayCycleNotStarted) {
      return jsonError(
        'Your new billing cycle hasn\'t started yet after a recent plan change. Please wait a few minutes for it to take effect, then try again.',
        409,
        'RAZORPAY_CYCLE_NOT_STARTED'
      );
    }

    // Razorpay cannot issue a credit note for an immediate downgrade when
    // the current invoice has no captured payment.  Auto-fall back to
    // scheduling the change at the end of the current billing cycle.
    const razorpayNoCapturedPayments =
      /RAZORPAY_NO_CAPTURED_PAYMENTS/i.test(error.message)
      || (/razorpay/i.test(error.message) && /does not have any captured payments/i.test(error.message));

    if (razorpayNoCapturedPayments) {
      try {
        const ctx2 = await resolveContext(planId!, actorUserId!);
        const provider2 = paymentService.getProviderForRecord(ctx2.providerKey);

        if (typeof provider2.scheduleSubscriptionPlanChange !== 'function') {
          return jsonError(
            'Immediate plan change is not possible right now and this provider does not support scheduling.',
            409,
            'RAZORPAY_NO_CAPTURED_PAYMENTS'
          );
        }

        const schedResult = await provider2.scheduleSubscriptionPlanChange(
          ctx2.currentSubscription.externalSubscriptionId!,
          ctx2.targetExternalPriceId,
          ctx2.userId
        );

        const schedEnd = schedResult.newPeriodEnd || null;

        // Persist the scheduled plan switch.
        try {
          await prisma.subscription.update({
            where: { id: ctx2.currentSubscription.id },
            data: {
              scheduledPlanId: ctx2.targetPlan.id,
              scheduledPlanDate: schedEnd ?? ctx2.currentSubscription.expiresAt ?? null,
            },
          });
        } catch (dbErr) {
          const de = toError(dbErr);
          Logger.warn('Failed to persist scheduledPlanId (no-captured-payments fallback)', { error: de.message });
        }

        Logger.info('Razorpay immediate switch failed (no captured payments); scheduled at cycle end instead', {
          subscriptionId: ctx2.currentSubscription.id,
          targetPlan: ctx2.targetPlan.id,
        });

        return NextResponse.json({
          ok: true,
          scheduled: true,
          noCapturedPaymentsFallback: true,
          newPlan: {
            id: ctx2.targetPlan.id,
            name: ctx2.targetPlan.name,
            priceCents: ctx2.targetPlan.priceCents,
          },
          currentPeriodEnd: schedEnd ? schedEnd.toISOString() : null,
        });
      } catch (fallbackErr) {
        const fe = toError(fallbackErr);
        Logger.error('Razorpay cycle-end fallback also failed', { error: fe.message });
        return jsonError(
          'Unable to switch plans right now. The current invoice has no captured payment and scheduling at cycle end also failed.',
          409,
          'RAZORPAY_NO_CAPTURED_PAYMENTS'
        );
      }
    }

    if (razorpayNeedsRemainingCount) {
      return jsonError(
        'Razorpay requires remaining_count when switching between plans with different billing periods.',
        409,
        'RAZORPAY_REMAINING_COUNT_REQUIRED'
      );
    }

    if (razorpaySubscriptionNotUpdatableState) {
      return jsonError(
        'Razorpay cannot update this subscription because it is not in an updatable state (Authenticated or Active).',
        409,
        'RAZORPAY_SUBSCRIPTION_NOT_UPDATABLE_STATE'
      );
    }

    // Stripe-specific error classification.
    const originalErr = (error as { originalError?: unknown }).originalError;
    const stripeCode = typeof originalErr === 'object' && originalErr !== null
      ? (originalErr as Record<string, unknown>).code
      : undefined;
    const stripeDeclineCode = typeof originalErr === 'object' && originalErr !== null
      ? ((originalErr as Record<string, unknown>).decline_code ?? (originalErr as Record<string, unknown>).declineCode)
      : undefined;

    if (typeof stripeCode === 'string') {
      if (stripeCode === 'card_declined' || stripeCode === 'expired_card' || stripeCode === 'insufficient_funds'
        || stripeCode === 'processing_error' || typeof stripeDeclineCode === 'string') {
        const reason = typeof stripeDeclineCode === 'string'
          ? `Payment declined: ${stripeDeclineCode}`
          : `Payment failed: ${stripeCode}`;
        return jsonError(reason, 402, 'STRIPE_PAYMENT_FAILED');
      }
      if (stripeCode === 'authentication_required') {
        return jsonError(
          'This payment requires additional authentication. Please try again.',
          402,
          'STRIPE_AUTHENTICATION_REQUIRED'
        );
      }
      if (stripeCode === 'rate_limit') {
        return jsonError('Too many requests. Please try again in a moment.', 429, 'STRIPE_RATE_LIMIT');
      }
    }

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
      default: {
        // Detect network-level failures (DNS, connection reset, TLS, timeout)
        // and give users a friendlier message instead of a raw 500.
        const isNetworkError = /fetch failed|network error|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(error.message);
        if (isNetworkError) {
          Logger.error('Proration update failed due to network error', { error: error.message });
          return jsonError(
            'Unable to reach the payment provider right now. Please check your connection and try again in a moment.',
            502,
            'PAYMENT_PROVIDER_NETWORK_ERROR'
          );
        }
        Logger.error('Proration update failed', { error: error.message, stack: error.stack });
        return jsonError('Failed to update subscription with proration', 500, 'PRORATION_UPDATE_FAILED');
      }
    }
  }
}
