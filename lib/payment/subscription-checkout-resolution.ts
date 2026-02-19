import type { Plan } from '@prisma/client';
import { Logger } from '../logger';
import { sendBillingNotification } from '../notifications';
import { shouldEmailUser } from '../email';
import { shouldClearPaidTokensOnRenewal } from '../paidTokens';
import { formatCurrency } from '../utils/currency';
import { getActiveCurrencyAsync } from './registry';
import { prisma } from '../prisma';
import { toError } from '../runtime-guards';
import type { PaymentProvider, SubscriptionDetails, StandardizedCheckoutSession } from './types';

type ExistingActiveSubscription = {
    id: string;
    expiresAt: Date;
    paymentProvider: string | null;
    externalSubscriptionId: string | null;
    externalSubscriptionIds: unknown;
    plan: {
        autoRenew: boolean;
        priceCents: number;
    };
};

type ResolveSubscriptionCheckoutStateDeps = {
    getProviderForRecord: (paymentProvider: string | null | undefined) => PaymentProvider;
    parseIdMap: (value: unknown) => Record<string, string>;
    buildImmediateCancellationData: (cancellationTime: Date) => {
        status: 'CANCELLED';
        canceledAt: Date;
        expiresAt: Date;
        cancelAtPeriodEnd: boolean;
    };
    computePlanPeriodMs: (plan: Plan) => number;
};

export async function resolveSubscriptionCheckoutState<TExisting extends ExistingActiveSubscription>(params: {
    existingActive: TExisting | null;
    planToUse: Plan;
    userId: string;
    startedAt: Date;
    expiresAt: Date;
    sub: SubscriptionDetails;
    session: StandardizedCheckoutSession;
    deps: ResolveSubscriptionCheckoutStateDeps;
}): Promise<{
    desiredStatus: 'ACTIVE' | 'PENDING';
    isUpgrade: boolean;
    isDowngrade: boolean;
    replacedRecurringSubscription: TExisting | null;
    resetTokensOnRenewal: boolean;
    effectiveStartedAt: Date;
    effectiveExpiresAt: Date;
}> {
    let desiredStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE';
    let isUpgrade = false;
    let isDowngrade = false;
    let replacedRecurringSubscription: TExisting | null = null;
    let resetTokensOnRenewal = false;
    let effectiveStartedAt = params.startedAt;
    let effectiveExpiresAt = params.expiresAt;

    const fallbackReason = (params.session.metadata?.prorationFallbackReason || params.sub.metadata?.prorationFallbackReason || '').trim();
    const switchAtPeriodEnd = fallbackReason === 'SWITCH_AT_PERIOD_END';

    const { existingActive, planToUse, userId, startedAt, expiresAt, sub, session } = params;

    if (existingActive) {
        if (existingActive.plan.autoRenew === false && planToUse.autoRenew === true) {
            const cancellationTime = new Date();
            await prisma.subscription.update({
                where: { id: existingActive.id },
                data: params.deps.buildImmediateCancellationData(cancellationTime)
            });

            try {
                const emailOk = await shouldEmailUser(userId);
                if (emailOk) {
                    await sendBillingNotification({
                        userId,
                        title: 'Subscription Upgraded',
                        message: `Your ${planToUse.name} subscription is now active.`,
                        templateKey: 'subscription_upgraded',
                        variables: {
                            planName: planToUse.name,
                            amount: formatCurrency(planToUse.priceCents, await getActiveCurrencyAsync()),
                            startedAt: startedAt.toLocaleDateString(),
                            expiresAt: expiresAt.toLocaleDateString(),
                            transactionId: sub.latestInvoice?.paymentIntentId || session.paymentIntentId || session.id
                        }
                    });
                }
            } catch (err) {
                Logger.warn('Failed to send upgrade email', { error: toError(err).message });
            }

            desiredStatus = 'ACTIVE';
        } else if (existingActive.plan.autoRenew === true && planToUse.autoRenew === true) {
            replacedRecurringSubscription = existingActive;
            resetTokensOnRenewal = await shouldClearPaidTokensOnRenewal(Boolean(planToUse.autoRenew));

            isUpgrade = planToUse.priceCents > existingActive.plan.priceCents;
            isDowngrade = planToUse.priceCents < existingActive.plan.priceCents;

            if (switchAtPeriodEnd) {
                desiredStatus = 'PENDING';
                effectiveStartedAt = existingActive.expiresAt;
                const periodMs = params.deps.computePlanPeriodMs(planToUse);
                effectiveExpiresAt = new Date(effectiveStartedAt.getTime() + periodMs);

                try {
                    const existingProvider = params.deps.getProviderForRecord(existingActive.paymentProvider);
                    const existingProviderKey = existingActive.paymentProvider || existingProvider.name;
                    const idMap = params.deps.parseIdMap(existingActive.externalSubscriptionIds);
                    const existingProviderSubId = idMap[existingProviderKey] || existingActive.externalSubscriptionId;

                    if (existingProviderSubId) {
                        await existingProvider.cancelSubscription(existingProviderSubId, false);
                    } else {
                        Logger.warn('Missing provider subscription id when scheduling cancel-at-period-end', {
                            userId,
                            dbSubscriptionId: existingActive.id,
                            paymentProvider: existingActive.paymentProvider,
                        });
                    }

                    await prisma.subscription.update({
                        where: { id: existingActive.id },
                        data: { cancelAtPeriodEnd: true, canceledAt: existingActive.expiresAt },
                    });
                } catch (err) {
                    Logger.warn('Failed to schedule cancel-at-period-end for existing subscription', {
                        userId,
                        dbSubscriptionId: existingActive.id,
                        error: toError(err).message,
                    });
                }
            } else {
                desiredStatus = 'ACTIVE';

                try {
                    const existingProvider = params.deps.getProviderForRecord(existingActive.paymentProvider);
                    const existingProviderKey = existingActive.paymentProvider || existingProvider.name;
                    const idMap = params.deps.parseIdMap(existingActive.externalSubscriptionIds);
                    const existingProviderSubId = idMap[existingProviderKey] || existingActive.externalSubscriptionId;

                    if (existingProviderSubId) {
                        await existingProvider.cancelSubscription(existingProviderSubId, true);
                    } else {
                        Logger.warn('Missing provider subscription id when performing immediate switch cancellation', {
                            userId,
                            dbSubscriptionId: existingActive.id,
                            paymentProvider: existingActive.paymentProvider,
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed to cancel existing provider subscription during immediate switch', {
                        userId,
                        dbSubscriptionId: existingActive.id,
                        error: toError(err).message,
                    });
                }

                const cancellationTime = new Date();
                await prisma.subscription.update({
                    where: { id: existingActive.id },
                    data: params.deps.buildImmediateCancellationData(cancellationTime)
                });
            }
        } else {
            desiredStatus = 'PENDING';
            if (planToUse.autoRenew === true && existingActive.plan.autoRenew === true) {
                isUpgrade = planToUse.priceCents > existingActive.plan.priceCents;
                isDowngrade = planToUse.priceCents < existingActive.plan.priceCents;
            }
        }
    }

    return {
        desiredStatus,
        isUpgrade,
        isDowngrade,
        replacedRecurringSubscription,
        resetTokensOnRenewal,
        effectiveStartedAt,
        effectiveExpiresAt,
    };
}