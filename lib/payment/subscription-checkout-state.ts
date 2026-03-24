import type { Plan, Prisma } from '@prisma/client';
import { Logger } from '../logger';
import { prisma } from '../prisma';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../organization-access';
import { notifyExpiredSubscriptions } from '../notifications';
import { toError } from '../runtime-guards';
import type { SubscriptionDetails } from './types';

export async function persistSubscriptionCheckoutState(params: {
    userId: string;
    subscription: SubscriptionDetails;
    planToUse: Plan;
    organizationId?: string | null;
    desiredStatus: 'ACTIVE' | 'PENDING';
    effectiveStartedAt: Date;
    effectiveExpiresAt: Date;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}) {
    if (params.subscription.customerId && params.userId) {
        try {
            const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { externalCustomerIds: true } });
            const mergedIds = params.mergeIdMap(user?.externalCustomerIds, params.providerKey, params.subscription.customerId);

            let canMergeCustomerIdMap = true;
            try {
                const usersWithMaps = await prisma.user.findMany({
                    where: { externalCustomerIds: { not: null } },
                    select: { id: true, externalCustomerIds: true },
                });
                for (const existingUser of usersWithMaps) {
                    if (existingUser.id === params.userId) continue;
                    const map = (existingUser.externalCustomerIds ?? {}) as Record<string, unknown>;
                    if (map[params.providerKey] === params.subscription.customerId) {
                        canMergeCustomerIdMap = false;
                        Logger.warn('customerId already associated to a different user; skipping externalCustomerIds merge during subscription checkout persistence', {
                            provider: params.providerKey,
                            customerId: params.subscription.customerId,
                            userId: params.userId,
                            existingOwnerUserId: existingUser.id,
                        });
                        break;
                    }
                }
            } catch {
            }

            let canSetLegacyExternalCustomerId = true;
            try {
                const owner = await prisma.user.findUnique({
                    where: { externalCustomerId: params.subscription.customerId },
                    select: { id: true },
                });
                if (owner?.id && owner.id !== params.userId) {
                    canSetLegacyExternalCustomerId = false;
                    Logger.warn('externalCustomerId already linked to a different user; skipping legacy field update', {
                        provider: params.providerKey,
                        customerId: params.subscription.customerId,
                        userId: params.userId,
                        existingOwnerUserId: owner.id,
                    });
                }
            } catch {
            }

            await prisma.user.update({
                where: { id: params.userId },
                data: {
                    ...(canSetLegacyExternalCustomerId ? { externalCustomerId: params.subscription.customerId } : null),
                    externalCustomerIds: canMergeCustomerIdMap ? (mergedIds ?? user?.externalCustomerIds) : user?.externalCustomerIds,
                    paymentProvider: params.providerKey
                },
            });
        } catch (err) {
            Logger.warn('Failed to update user customer ID', { error: toError(err).message });
        }
    }

    const existingSub = await prisma.subscription.findUnique({
        where: { externalSubscriptionId: params.subscription.id },
        select: { externalSubscriptionIds: true, organizationId: true }
    });
    const mergedSubIds = params.mergeIdMap(existingSub?.externalSubscriptionIds, params.providerKey, params.subscription.id);
    const nextOrganizationId = typeof params.organizationId === 'string' && params.organizationId.length > 0
        ? params.organizationId
        : null;

    return prisma.subscription.upsert({
        where: { externalSubscriptionId: params.subscription.id },
        update: {
            userId: params.userId,
            planId: params.planToUse.id,
            ...(nextOrganizationId ? { organizationId: nextOrganizationId } : {}),
            status: params.desiredStatus,
            startedAt: params.effectiveStartedAt,
            expiresAt: params.effectiveExpiresAt,
            canceledAt: params.subscription.canceledAt ?? null,
            externalSubscriptionIds: mergedSubIds ?? existingSub?.externalSubscriptionIds,
            paymentProvider: params.providerKey,
            scheduledPlanId: null,
            scheduledPlanDate: null,
        },
        create: {
            userId: params.userId,
            planId: params.planToUse.id,
            organizationId: nextOrganizationId,
            status: params.desiredStatus,
            startedAt: params.effectiveStartedAt,
            expiresAt: params.effectiveExpiresAt,
            canceledAt: params.subscription.canceledAt ?? null,
            externalSubscriptionId: params.subscription.id,
            externalSubscriptionIds: mergedSubIds ?? JSON.stringify({ [params.providerKey]: params.subscription.id }),
            paymentProvider: params.providerKey
        } satisfies Prisma.SubscriptionUncheckedCreateInput
    });
}

export async function expirePriorActiveSubscriptionsForCheckout(userId: string): Promise<void> {
    const expiredActiveSubs = await prisma.subscription.findMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
        select: {
            id: true,
            organizationId: true,
            plan: { select: { autoRenew: true, supportsOrganizations: true } },
        }
    });

    const expiredActiveCount = await prisma.subscription.updateMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
        data: { status: 'EXPIRED', canceledAt: new Date() }
    });

    if (expiredActiveCount.count > 0) {
        await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });
        try {
            await syncOrganizationEligibilityForUser(userId);
        } catch (err) {
            Logger.warn('Failed to sync organization eligibility after expiring prior active subscriptions', {
                userId,
                error: toError(err).message
            });
        }
    }

    if (expiredActiveSubs.length > 0) {
        notifyExpiredSubscriptions(expiredActiveSubs.map(s => s.id)).catch(err => {
            Logger.warn('Failed to notify expired subscriptions', { error: toError(err).message });
        });
    }
}