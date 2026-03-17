import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';
import { shouldClearPaidTokensOnRenewal } from '../paidTokens';
import { syncOrganizationBillingMetadata } from '../organization-billing-metadata';
import { creditOrganizationSharedTokens, resetOrganizationSharedTokens } from '../teams';
import { resolveSubscriptionWebhookMutationPlan } from './subscription-webhook-state';

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;

type SubscriptionUpdatePlanShape = {
    id: string;
    priceCents: number;
};

type SubscriptionUpdateDbSubShape = {
    id: string;
    userId: string;
    status: string;
    expiresAt: Date;
    prorationPendingSince?: Date | null;
    canceledAt: Date | null;
    cancelAtPeriodEnd: boolean;
    planId: string;
    plan: SubscriptionUpdatePlanShape;
    /** Used for Paddle cancel-artifact detection in deriveSubscriptionWebhookState */
    createdAt?: Date | null;
};

export function buildImmediateCancellationData(cancellationTime: Date) {
    return {
        status: 'CANCELLED' as const,
        canceledAt: cancellationTime,
        expiresAt: cancellationTime,
        cancelAtPeriodEnd: false,
    };
}

export async function markSubscriptionActive(dbSubscriptionId: string, expiresAt?: Date): Promise<void> {
    const updatedSub = await prisma.subscription.update({
        where: { id: dbSubscriptionId },
        data: {
            status: 'ACTIVE',
            prorationPendingSince: null,
            ...(expiresAt ? { expiresAt } : null),
        },
        include: {
            plan: {
                select: {
                    id: true,
                    supportsOrganizations: true,
                    organizationSeatLimit: true,
                    organizationTokenPoolStrategy: true,
                },
            },
        },
    });

    if (updatedSub.organizationId && updatedSub.plan?.supportsOrganizations) {
        await syncOrganizationBillingMetadata({
            organizationId: updatedSub.organizationId,
            planId: updatedSub.plan.id,
            seatLimit: updatedSub.plan.organizationSeatLimit,
            tokenPoolStrategy: updatedSub.plan.organizationTokenPoolStrategy,
        });
    }
}

export async function applySubscriptionWebhookUpdate(params: {
    dbSub: SubscriptionWithPlan;
    effectiveStatus: string;
    effectiveExpiresAt: Date;
    nextCancelAtPeriodEnd: boolean;
    nextCanceledAt: Date | null;
    nextPlanId: string | null;
    syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
}): Promise<SubscriptionWithPlan> {
    const updatedSub = await prisma.subscription.update({
        where: { id: params.dbSub.id },
        data: {
            expiresAt: params.effectiveExpiresAt,
            status: params.effectiveStatus,
            canceledAt: params.nextCanceledAt,
            cancelAtPeriodEnd: params.nextCancelAtPeriodEnd,
            ...(params.nextPlanId ? { planId: params.nextPlanId, scheduledPlanId: null, scheduledPlanDate: null } : null),
            prorationPendingSince: null,
        },
        include: { plan: true }
    });

    if (updatedSub.organizationId && updatedSub.plan?.supportsOrganizations && params.effectiveStatus === 'ACTIVE') {
        await syncOrganizationBillingMetadata({
            organizationId: updatedSub.organizationId,
            planId: updatedSub.plan.id,
            seatLimit: updatedSub.plan.organizationSeatLimit,
            tokenPoolStrategy: updatedSub.plan.organizationTokenPoolStrategy,
        });
    }

    if (!params.nextPlanId) return updatedSub;

    try {
        await params.syncOrganizationEligibilityForUser(updatedSub.userId);
    } catch (err) {
        Logger.warn('Failed to sync organization eligibility after subscription plan change', {
            userId: updatedSub.userId,
            error: toError(err).message,
        });
    }

    try {
        const shouldResetTokens = await shouldClearPaidTokensOnRenewal(Boolean(updatedSub.plan?.autoRenew));
        if (shouldResetTokens && params.effectiveStatus === 'ACTIVE') {
            const tokenLimit = typeof updatedSub.plan?.tokenLimit === 'number' ? updatedSub.plan.tokenLimit : null;
            if (tokenLimit !== null) {
                if (updatedSub.organizationId) {
                    await resetOrganizationSharedTokens({ organizationId: updatedSub.organizationId });
                    await creditOrganizationSharedTokens({ organizationId: updatedSub.organizationId, amount: tokenLimit });
                } else {
                    await prisma.user.update({ where: { id: updatedSub.userId }, data: { tokenBalance: tokenLimit } });
                }

                Logger.info('Reset token balance on subscription plan change per admin setting', {
                    userId: updatedSub.userId,
                    tokenLimit,
                    subscriptionId: updatedSub.id,
                });
            }
        }
    } catch (err) {
        Logger.warn('Failed to apply token operation after subscription plan change', {
            userId: updatedSub.userId,
            error: toError(err).message,
        });
    }

    return updatedSub;
}

export async function applySubscriptionCreatedExistingRecordUpdate(params: {
    dbSub: SubscriptionWithPlan;
    status: string;
    effectiveStatus: string;
    effectiveExpiresAt: Date;
    nextCancelAtPeriodEnd: boolean;
    nextCanceledAt: Date | null;
    isProviderSubscriptionActiveStatus: (status: string) => boolean;
}): Promise<{ dbSub: SubscriptionWithPlan; wasTransitioningToActive: boolean }> {
    const wasTransitioningToActive = params.dbSub.status === 'PENDING' && params.effectiveStatus === 'ACTIVE';

    const shouldUpdate =
        params.dbSub.status !== params.effectiveStatus
        || params.dbSub.expiresAt.getTime() !== params.effectiveExpiresAt.getTime()
        || params.dbSub.cancelAtPeriodEnd !== params.nextCancelAtPeriodEnd
        || (params.dbSub.canceledAt?.getTime() ?? 0) !== (params.nextCanceledAt?.getTime() ?? 0);

    if (!shouldUpdate) {
        return { dbSub: params.dbSub, wasTransitioningToActive };
    }

    const updatedSub = await prisma.subscription.update({
        where: { id: params.dbSub.id },
        data: {
            expiresAt: params.effectiveExpiresAt,
            status: params.effectiveStatus,
            canceledAt: params.nextCanceledAt,
            cancelAtPeriodEnd: params.nextCancelAtPeriodEnd,
        },
        include: { plan: true }
    });

    if (updatedSub.organizationId && updatedSub.plan?.supportsOrganizations && params.effectiveStatus === 'ACTIVE') {
        await syncOrganizationBillingMetadata({
            organizationId: updatedSub.organizationId,
            planId: updatedSub.plan.id,
            seatLimit: updatedSub.plan.organizationSeatLimit,
            tokenPoolStrategy: updatedSub.plan.organizationTokenPoolStrategy,
        });
    }

    return { dbSub: updatedSub, wasTransitioningToActive };
}

export async function resolveAndApplySubscriptionUpdatedState<TSub extends SubscriptionUpdateDbSubShape>(params: {
    subscriptionId: string;
    status: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
    priceId?: string | null;
    metadataPlanId?: string | null;
    providerKey: string;
}, deps: {
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<TSub | null>;
    ensureProviderBackedSubscription: (subscriptionId: string) => Promise<TSub | null>;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<{ id: string } | null>;
    syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
}): Promise<
    | {
        shouldSkip: true;
        dbSub: null;
      }
    | {
        shouldSkip: false;
        dbSub: TSub;
        isNewlyCreated: boolean;
        previousStatus: string;
        previousPlan: SubscriptionUpdatePlanShape;
        normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
        effectiveStatus: string;
      }
> {
    let dbSub = await deps.findSubscriptionByProviderId(params.subscriptionId);
    let isNewlyCreated = false;

    if (!dbSub) {
        // Stripe Elements subscription intents create subscriptions immediately with
        // `payment_behavior=default_incomplete`. Abandoned checkouts can emit webhook
        // updates for `incomplete`/`incomplete_expired`/`unpaid` subscriptions that
        // we intentionally do not hydrate into local Subscription rows.
        if (params.providerKey === 'stripe') {
            const st = params.status;
            const isStripeUnpaidSetup = st === 'incomplete' || st === 'incomplete_expired' || st === 'unpaid';
            if (isStripeUnpaidSetup) {
                Logger.info('Skipping Stripe subscription update for unpaid/incomplete subscription', {
                    subscriptionId: params.subscriptionId,
                    status: st,
                });
                return {
                    shouldSkip: true,
                    dbSub: null,
                };
            }
        }

        dbSub = await deps.ensureProviderBackedSubscription(params.subscriptionId);
        if (!dbSub) {
            Logger.warn('Received subscription update for unknown subscription', {
                subscriptionId: params.subscriptionId,
                providerKey: params.providerKey,
                status: params.status,
            });
            return {
                shouldSkip: true,
                dbSub: null,
            };
        }
        isNewlyCreated = true;
    }

    const previousStatus = dbSub.status;
    const previousPlan: SubscriptionUpdatePlanShape = {
        id: dbSub.plan.id,
        priceCents: dbSub.plan.priceCents,
    };

    const {
        normalizedStatus,
        effectiveStatus,
        effectiveExpiresAt,
        nextCancelAtPeriodEnd,
        nextCanceledAt,
        nextPlanId,
        shouldApply,
    } = await resolveSubscriptionWebhookMutationPlan({
        dbSub,
        status: params.status,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        canceledAt: params.canceledAt,
        priceId: params.priceId,
        metadataPlanId: params.metadataPlanId,
        providerKey: params.providerKey,
        findPlanByPriceIdentifier: deps.findPlanByPriceIdentifier,
        onUnknownPriceId: (priceId) => {
            Logger.warn('Received subscription update with unknown priceId', { subscriptionId: params.subscriptionId, priceId });
        },
    });

    // Log when the Paddle post-checkout cancel artifact is suppressed so it's
    // visible in the terminal without any DB write occurring.
    if (!shouldApply && normalizedStatus === 'CANCELLED' && params.providerKey === 'paddle') {
        Logger.info('Suppressed Paddle post-checkout cancel artifact on subscription.updated', {
            subscriptionId: params.subscriptionId,
            effectiveStatus,
        });
    }

    if (shouldApply) {
        Logger.info('Updating subscription from webhook', {
            subscriptionId: dbSub.id,
            oldStatus: dbSub.status,
            newStatus: effectiveStatus,
            oldExpiry: dbSub.expiresAt,
            newExpiry: effectiveExpiresAt,
            oldCancelAtPeriodEnd: dbSub.cancelAtPeriodEnd,
            newCancelAtPeriodEnd: nextCancelAtPeriodEnd,
        });

        dbSub = await applySubscriptionWebhookUpdate({
            dbSub: dbSub as unknown as SubscriptionWithPlan,
            effectiveStatus,
            effectiveExpiresAt,
            nextCancelAtPeriodEnd,
            nextCanceledAt,
            nextPlanId,
            syncOrganizationEligibilityForUser: deps.syncOrganizationEligibilityForUser,
        }) as unknown as TSub;
    }

    return {
        shouldSkip: false,
        dbSub,
        isNewlyCreated,
        previousStatus,
        previousPlan,
        normalizedStatus,
        effectiveStatus,
    };
}