import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';
import type { Plan, Prisma } from '@/lib/prisma-client';
import type { StandardizedInvoice, StandardizedSubscription, SubscriptionDetails } from './types';

export async function resolveSubscriptionCreatedRecordWithRetry<TSubscription>(params: {
    subscriptionId: string;
    providerKey: string;
    subscription: StandardizedSubscription;
    ensureProviderBackedSubscription: (
        subscriptionId: string,
        context: { subscription: StandardizedSubscription }
    ) => Promise<TSubscription | null>;
}): Promise<TSubscription | null> {
    let dbSub = await params.ensureProviderBackedSubscription(params.subscriptionId, { subscription: params.subscription });
    if (dbSub) return dbSub;

    if (params.providerKey !== 'paystack') {
        return null;
    }

    const retryDelays = [2000, 4000, 6000];
    for (const delay of retryDelays) {
        Logger.info('subscription.created: plan not found, retrying after delay (Paystack race)', {
            subscriptionId: params.subscriptionId,
            delayMs: delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        dbSub = await params.ensureProviderBackedSubscription(params.subscriptionId, { subscription: params.subscription });
        if (dbSub) break;
    }

    return dbSub;
}

export function buildProviderSubscriptionFromContext(
    subscription?: StandardizedSubscription
): SubscriptionDetails | null {
    if (!subscription) {
        return null;
    }

    return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt ?? undefined,
        metadata: subscription.metadata,
        priceId: subscription.priceId,
        customerId: subscription.customerId,
        latestInvoice: subscription.latestInvoice ? {
            id: subscription.latestInvoice.id,
            amountPaid: subscription.latestInvoice.amountPaid,
            amountDue: subscription.latestInvoice.amountDue,
            status: subscription.latestInvoice.status,
            paymentIntentId: subscription.latestInvoice.paymentIntentId,
            subtotal: subscription.latestInvoice.subtotal,
            total: subscription.latestInvoice.total,
            amountDiscount: subscription.latestInvoice.amountDiscount
        } : null
    };
}

export async function resolveProviderSubscriptionIdentity(params: {
    providerSubscription: SubscriptionDetails;
    invoice?: StandardizedInvoice;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
}): Promise<{ userId: string | null; organizationId: string | null }> {
    const metadataUserId = params.providerSubscription.metadata?.['userId']
        || params.providerSubscription.metadata?.['user_id'];
    const invoiceMetadataUserId = params.invoice?.metadata?.['userId']
        || params.invoice?.metadata?.['user_id'];

    let userId = metadataUserId || invoiceMetadataUserId || null;

    if (!userId) {
        const customerId = params.providerSubscription.customerId || params.invoice?.customerId;
        if (customerId) {
            userId = await params.resolveUserByCustomerId(customerId);
        }
    }

    if (!userId && params.invoice?.userEmail) {
        const userByEmail = await prisma.user.findUnique({
            where: { email: params.invoice.userEmail },
            select: { id: true }
        });
        userId = userByEmail?.id ?? null;
    }

    const organizationMetadataId = params.providerSubscription.metadata?.['organizationId']
        || params.providerSubscription.metadata?.['organization_id']
        || params.invoice?.metadata?.['organizationId']
        || params.invoice?.metadata?.['organization_id'];

    let organizationId: string | null = null;
    if (organizationMetadataId) {
        const org = await prisma.organization.findUnique({ where: { id: organizationMetadataId }, select: { id: true } });
        organizationId = org?.id ?? null;
    }

    return { userId, organizationId };
}

export async function resolveProviderSubscriptionPlan(params: {
    providerSubscription: SubscriptionDetails;
    invoice?: StandardizedInvoice;
    subscriptionId: string;
    providerKey: string;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<Plan | null>;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    getPendingSubscriptionLookbackDate: () => Date;
}): Promise<{ priceId: string | null; plan: Plan | null }> {
    const priceId = params.providerSubscription.priceId;
    if (!priceId) {
        return { priceId: null, plan: null };
    }

    let plan = await params.findPlanByPriceIdentifier(
        priceId,
        params.providerSubscription.metadata?.planId ?? params.invoice?.metadata?.planId
    );

    if (!plan) {
        let fallbackUserId: string | null = params.providerSubscription.metadata?.['userId']
            || params.providerSubscription.metadata?.['user_id']
            || params.invoice?.metadata?.['userId']
            || params.invoice?.metadata?.['user_id']
            || null;

        if (!fallbackUserId) {
            const customerId = params.providerSubscription.customerId || params.invoice?.customerId;
            if (customerId) {
                fallbackUserId = await params.resolveUserByCustomerId(customerId);
            }
        }

        if (fallbackUserId) {
            const pendingPaymentLookback = params.getPendingSubscriptionLookbackDate();
            const pendingPaymentReference = params.invoice?.paymentIntentId ?? null;

            const pendingPayment = pendingPaymentReference
                ? await prisma.payment.findFirst({
                    where: {
                        userId: fallbackUserId,
                        paymentProvider: params.providerKey,
                        status: 'PENDING_SUBSCRIPTION',
                        createdAt: { gte: pendingPaymentLookback },
                        OR: [
                            { externalPaymentId: pendingPaymentReference },
                            { externalSessionId: pendingPaymentReference },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { planId: true, id: true },
                })
                : null;

            const fallbackPendingPayment = pendingPayment ?? await prisma.payment.findFirst({
                where: {
                    userId: fallbackUserId,
                    paymentProvider: params.providerKey,
                    status: 'PENDING_SUBSCRIPTION',
                    createdAt: { gte: pendingPaymentLookback },
                },
                orderBy: { createdAt: 'desc' },
                select: { planId: true, id: true },
            });

            if (fallbackPendingPayment?.planId) {
                plan = await prisma.plan.findUnique({ where: { id: fallbackPendingPayment.planId } });
                if (plan) {
                    Logger.info('Resolved plan via pending payment fallback (discounted subscription price)', {
                        subscriptionId: params.subscriptionId,
                        priceId,
                        planId: plan.id,
                        paymentId: fallbackPendingPayment.id,
                        matchMode: pendingPayment ? 'exact-provider-reference' : 'latest-provider-pending',
                    });
                }
            }
        }
    }

    return { priceId, plan };
}

export async function upsertHydratedProviderSubscription(params: {
    subscriptionId: string;
    providerKey: string;
    userId: string;
    organizationId: string | null;
    plan: Plan;
    providerSubscription: SubscriptionDetails;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<Prisma.SubscriptionGetPayload<{ include: { plan: true } }>> {
    const startedAt = params.providerSubscription.currentPeriodStart ?? new Date();
    const expiresAt = params.providerSubscription.currentPeriodEnd ?? startedAt;
    const nowTs = Date.now();
    const futureStartGraceMs = 30 * 1000;
    const startsInFuture = startedAt.getTime() > nowTs + futureStartGraceMs;
    const normalizedStatus = params.providerSubscription.status === 'active' || params.providerSubscription.status === 'trialing'
        ? (startsInFuture ? 'PENDING' : 'ACTIVE')
        : params.providerSubscription.status === 'canceled'
            ? 'CANCELLED'
            : 'PENDING';

    const mergedSubIds = params.mergeIdMap(null, params.providerKey, params.subscriptionId);

    const ensured = await prisma.subscription.upsert({
        where: { externalSubscriptionId: params.subscriptionId },
        update: {
            userId: params.userId,
            planId: params.plan.id,
            organizationId: params.organizationId,
            status: normalizedStatus,
            startedAt,
            expiresAt,
            canceledAt: params.providerSubscription.canceledAt ?? null,
            externalSubscriptionIds: mergedSubIds,
            paymentProvider: params.providerKey,
            scheduledPlanId: null,
            scheduledPlanDate: null,
        },
        create: {
            userId: params.userId,
            planId: params.plan.id,
            organizationId: params.organizationId,
            status: normalizedStatus,
            startedAt,
            expiresAt,
            canceledAt: params.providerSubscription.canceledAt ?? null,
            externalSubscriptionId: params.subscriptionId,
            externalSubscriptionIds: mergedSubIds ?? JSON.stringify({ [params.providerKey]: params.subscriptionId }),
            paymentProvider: params.providerKey
        } satisfies Prisma.SubscriptionUncheckedCreateInput,
        include: { plan: true }
    });

    Logger.info('Hydrated missing subscription from provider data', {
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        planId: params.plan.id
    });

    return ensured;
}

export async function ensureProviderBackedSubscriptionRecord(params: {
    subscriptionId: string;
    context?: { invoice?: StandardizedInvoice; subscription?: StandardizedSubscription };
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<Prisma.SubscriptionGetPayload<{ include: { plan: true } }> | null>;
    getProviderSubscription: (subscriptionId: string) => Promise<SubscriptionDetails>;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<Plan | null>;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    getPendingSubscriptionLookbackDate: () => Date;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    unresolvedPlanLogLevel?: 'debug' | 'info' | 'warn';
}): Promise<Prisma.SubscriptionGetPayload<{ include: { plan: true } }> | null> {
    const context = params.context ?? {};

    const existing = await params.findSubscriptionByProviderId(params.subscriptionId);
    if (existing) return existing;

    let providerSubscription = buildProviderSubscriptionFromContext(context.subscription);
    if (!providerSubscription) {
        try {
            providerSubscription = await params.getProviderSubscription(params.subscriptionId);
        } catch (err) {
            Logger.error('Failed to fetch provider subscription while hydrating missing record', {
                subscriptionId: params.subscriptionId,
                error: toError(err).message
            });
            return null;
        }
    }

    // Stripe embedded subscription intents create a Subscription immediately with
    // `payment_behavior=default_incomplete`. If the customer abandons checkout,
    // these remain `incomplete`/`incomplete_expired` and should NOT be hydrated
    // into a local PENDING subscription (which would appear as activatable).
    if (params.providerKey === 'stripe') {
        const st = providerSubscription.status;
        const isStripeUnpaidSetup = st === 'incomplete' || st === 'incomplete_expired' || st === 'unpaid';
        if (isStripeUnpaidSetup) {
            Logger.info('Skipping hydration for Stripe unpaid/incomplete subscription', {
                subscriptionId: params.subscriptionId,
                status: st,
            });
            return null;
        }
    }

    const planResolution = await resolveProviderSubscriptionPlan({
        providerSubscription,
        invoice: context.invoice,
        subscriptionId: params.subscriptionId,
        providerKey: params.providerKey,
        findPlanByPriceIdentifier: params.findPlanByPriceIdentifier,
        resolveUserByCustomerId: params.resolveUserByCustomerId,
        getPendingSubscriptionLookbackDate: params.getPendingSubscriptionLookbackDate,
    });
    const priceId = planResolution.priceId;
    const plan = planResolution.plan;

    if (!priceId) {
        Logger.warn('Cannot ensure subscription without priceId', { subscriptionId: params.subscriptionId });
        return null;
    }

    if (!plan) {
        const unresolvedPlanPayload = {
            subscriptionId: params.subscriptionId,
            priceId,
            metadataPlanId: providerSubscription.metadata?.planId,
        };

        if (params.unresolvedPlanLogLevel === 'debug') {
            Logger.debug('Unable to map provider subscription to plan', unresolvedPlanPayload);
        } else if (params.unresolvedPlanLogLevel === 'info') {
            Logger.info('Unable to map provider subscription to plan', unresolvedPlanPayload);
        } else {
            Logger.warn('Unable to map provider subscription to plan', unresolvedPlanPayload);
        }
        return null;
    }

    const { userId, organizationId } = await resolveProviderSubscriptionIdentity({
        providerSubscription,
        invoice: context.invoice,
        resolveUserByCustomerId: params.resolveUserByCustomerId,
    });

    if (!userId) {
        Logger.warn('Unable to resolve user for provider subscription', {
            subscriptionId: params.subscriptionId,
            customerId: providerSubscription.customerId,
            invoiceId: context.invoice?.id
        });
        return null;
    }

    let resolvedOrganizationId = organizationId;

    // Fallback: some providers (notably Paystack) do not reliably round-trip metadata
    // on scheduled plan changes (cancel+recreate at renewal). If we can’t extract an
    // organization id from provider metadata, infer it from the existing local
    // subscription that scheduled this plan change.
    if (!resolvedOrganizationId && plan.supportsOrganizations) {
        try {
            const lookbackMs = 7 * 24 * 60 * 60 * 1000;
            const candidate = await prisma.subscription.findFirst({
                where: {
                    userId,
                    paymentProvider: params.providerKey,
                    scheduledPlanId: plan.id,
                    organizationId: { not: null },
                    expiresAt: { gte: new Date(Date.now() - lookbackMs) },
                },
                orderBy: { updatedAt: 'desc' },
                select: { organizationId: true, id: true },
            });

            if (candidate?.organizationId) {
                resolvedOrganizationId = candidate.organizationId;
                Logger.info('Inferred organizationId for provider subscription via scheduled plan fallback', {
                    subscriptionId: params.subscriptionId,
                    providerKey: params.providerKey,
                    userId,
                    planId: plan.id,
                    sourceSubscriptionId: candidate.id,
                    organizationId: candidate.organizationId,
                });
            }
        } catch (err) {
            Logger.warn('Failed to infer organizationId for provider subscription via scheduled plan fallback', {
                subscriptionId: params.subscriptionId,
                providerKey: params.providerKey,
                userId,
                planId: plan.id,
                error: toError(err).message,
            });
        }
    }

    return upsertHydratedProviderSubscription({
        subscriptionId: params.subscriptionId,
        providerKey: params.providerKey,
        userId,
        organizationId: resolvedOrganizationId,
        plan,
        providerSubscription,
        mergeIdMap: params.mergeIdMap,
    });
}