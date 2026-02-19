import type { Plan } from '@prisma/client';
import type { StandardizedCheckoutSession } from './types';
import type { StandardizedPayment } from './types';
import type { StandardizedInvoice } from './types';
import type { PaymentProvider, SubscriptionDetails } from './types';
import type { OrganizationPlanContext } from '../user-plan-context';
import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';
import { expirePriorActiveSubscriptionsForCheckout, persistSubscriptionCheckoutState } from './subscription-checkout-state';
import { resolveSubscriptionCheckoutState } from './subscription-checkout-resolution';
import { recordSubscriptionCheckoutPaymentIfNeeded } from './subscription-checkout-payments';
import { runPostSubscriptionCheckoutSideEffects } from './subscription-update-notifications';

export function buildSubscriptionCheckoutPaymentContext(params: {
    session: StandardizedCheckoutSession;
    userId: string;
    dbSubscriptionId: string;
    planToUse: Plan;
    desiredStatus: 'ACTIVE' | 'PENDING';
    organizationContext: OrganizationPlanContext | null;
    replacedRecurringSubscription: unknown;
    resetTokensOnRenewal: boolean;
}): {
    paymentId?: string | null;
    sessionId: string;
    checkoutCouponCode: string | null;
    defaultPlanPriceCents: number;
    subscriptionPaymentBase: {
        userId: string;
        subscriptionId: string;
        planId: string;
        organizationId: string | null;
    };
    tokensToGrant: number;
    shouldResetTokensOnRenewal: boolean;
} {
    const tokensToGrant = params.desiredStatus === 'ACTIVE' && params.planToUse.tokenLimit ? params.planToUse.tokenLimit : 0;
    const shouldResetTokensOnRenewal = Boolean(params.replacedRecurringSubscription && params.resetTokensOnRenewal);
    const paymentId = params.session.transactionId || params.session.paymentIntentId;
    const sessionId = params.session.id;
    const checkoutCouponCode = params.session.metadata?.couponCode || null;
    const defaultPlanPriceCents = params.planToUse.priceCents;
    const organizationId = params.organizationContext?.organization.id ?? null;
    const subscriptionPaymentBase = {
        userId: params.userId,
        subscriptionId: params.dbSubscriptionId,
        planId: params.planToUse.id,
        organizationId,
    };

    return {
        paymentId,
        sessionId,
        checkoutCouponCode,
        defaultPlanPriceCents,
        subscriptionPaymentBase,
        tokensToGrant,
        shouldResetTokensOnRenewal,
    };
}

export async function processSubscriptionCheckout(params: {
    session: StandardizedCheckoutSession;
    userId: string;
    organizationContext: OrganizationPlanContext | null;
    providerKey: string;
}, deps: {
    getSubscription: (subscriptionId: string) => Promise<SubscriptionDetails>;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<Plan | null>;
    consumeCouponRedemptionFromMetadata: (metadata?: Record<string, unknown> | null) => Promise<void>;
    getProviderForRecord: (paymentProvider: string | null | undefined) => PaymentProvider;
    parseIdMap: (value: unknown) => Record<string, string>;
    buildImmediateCancellationData: (cancellationTime: Date) => {
        status: 'CANCELLED';
        canceledAt: Date;
        expiresAt: Date;
        cancelAtPeriodEnd: boolean;
    };
    computePlanPeriodMs: (plan: Plan) => number;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
}): Promise<void> {
    const subscriptionId = params.session.subscriptionId;
    if (!subscriptionId) return;

    const sub = await deps.getSubscription(subscriptionId);
    const priceId = sub.priceId;

    if (!priceId || !params.userId) return;

    const finalPlan = await deps.findPlanByPriceIdentifier(priceId, params.session.metadata?.planId);

    if (!finalPlan) {
        Logger.warn('handleSubscriptionCheckout: Plan not found for priceId', { priceId, userId: params.userId, metadataPlanId: params.session.metadata?.planId });
        return;
    }

    const planToUse = finalPlan;

    await deps.consumeCouponRedemptionFromMetadata(params.session.metadata);
    await deps.consumeCouponRedemptionFromMetadata(sub.metadata);

    const startedAt = sub.currentPeriodStart;
    const expiresAt = sub.currentPeriodEnd;
    await expirePriorActiveSubscriptionsForCheckout(params.userId);

    const existingActive = await prisma.subscription.findFirst({
        where: { userId: params.userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        include: { plan: true }
    });
    const {
        desiredStatus,
        isUpgrade,
        isDowngrade,
        replacedRecurringSubscription,
        resetTokensOnRenewal,
        effectiveStartedAt,
        effectiveExpiresAt,
    } = await resolveSubscriptionCheckoutState({
        existingActive,
        planToUse,
        userId: params.userId,
        startedAt,
        expiresAt,
        sub,
        session: params.session,
        deps: {
            getProviderForRecord: deps.getProviderForRecord,
            parseIdMap: deps.parseIdMap,
            buildImmediateCancellationData: deps.buildImmediateCancellationData,
            computePlanPeriodMs: deps.computePlanPeriodMs,
        },
    });

    const dbSub = await persistSubscriptionCheckoutState({
        userId: params.userId,
        subscription: sub,
        planToUse,
        desiredStatus,
        effectiveStartedAt,
        effectiveExpiresAt,
        providerKey: params.providerKey,
        mergeIdMap: deps.mergeIdMap,
    });
    const paymentContext = buildSubscriptionCheckoutPaymentContext({
        session: params.session,
        userId: params.userId,
        dbSubscriptionId: dbSub.id,
        planToUse,
        desiredStatus,
        organizationContext: params.organizationContext,
        replacedRecurringSubscription,
        resetTokensOnRenewal,
    });

    await recordSubscriptionCheckoutPaymentIfNeeded({
        subscription: sub,
        paymentId: paymentContext.paymentId,
        sessionId: paymentContext.sessionId,
        userId: params.userId,
        dbSubscriptionId: dbSub.id,
        defaultPlanPriceCents: paymentContext.defaultPlanPriceCents,
        sessionAmountTotal: params.session.amountTotal,
        sessionAmountSubtotal: params.session.amountSubtotal,
        checkoutCouponCode: paymentContext.checkoutCouponCode,
        subscriptionPaymentBase: paymentContext.subscriptionPaymentBase,
        tokensToGrant: paymentContext.tokensToGrant,
        organizationContext: params.organizationContext,
        shouldResetTokensOnRenewal: paymentContext.shouldResetTokensOnRenewal,
        desiredStatus,
        providerKey: params.providerKey,
        mergeIdMap: deps.mergeIdMap,
    });

    await runPostSubscriptionCheckoutSideEffects({
        userId: params.userId,
        plan: planToUse,
        desiredStatus,
        isUpgrade,
        isDowngrade,
        subscription: sub,
        session: params.session,
        syncOrganizationEligibilityForUser: deps.syncOrganizationEligibilityForUser,
    });
}

export async function prepareCheckoutSessionForProcessing(params: {
    session: StandardizedCheckoutSession;
    providerKey: string;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<{
    userId: string | null;
    shouldSkip: boolean;
}> {
    let userId = params.session.userId || params.session.metadata?.userId;

    Logger.info('handleCheckoutCompleted called', {
        sessionId: params.session.id,
        userId,
        mode: params.session.mode,
        hasSubscription: !!params.session.subscriptionId,
    });

    if (!userId) {
        const customerId = params.session.customerId;
        if (customerId) {
            try {
                const resolvedByCustomer = await params.resolveUserByCustomerId(customerId);
                if (resolvedByCustomer) {
                    userId = resolvedByCustomer;
                    Logger.info('Resolved userId from customerId on checkout.session.completed', {
                        sessionId: params.session.id,
                        userId,
                        customerId,
                    });
                }
            } catch (err) {
                Logger.warn('Failed to resolve user by customerId for checkout session', {
                    sessionId: params.session.id,
                    customerId,
                    error: toError(err).message,
                });
            }
        }
    }

    if (!userId) {
        const fallbackEmail = params.session.userEmail;
        if (fallbackEmail) {
            try {
                const userByEmail = await prisma.user.findUnique({ where: { email: fallbackEmail }, select: { id: true } });
                if (userByEmail) {
                    userId = userByEmail.id;
                    Logger.info('Resolved userId from customer email on checkout.session.completed', {
                        sessionId: params.session.id,
                        userId,
                        email: fallbackEmail,
                    });
                }
            } catch (err) {
                Logger.warn('Failed to resolve user by email for checkout session', {
                    sessionId: params.session.id,
                    email: fallbackEmail,
                    error: toError(err).message,
                });
            }
        }
    }

    if (!userId) {
        Logger.warn('Checkout completed without userId', { sessionId: params.session.id });
        return { userId: null, shouldSkip: true };
    }

    if (params.session.authorization?.code) {
        try {
            await prisma.paymentAuthorization.upsert({
                where: {
                    provider_authorizationCode: {
                        provider: params.providerKey,
                        authorizationCode: params.session.authorization.code,
                    },
                },
                update: {
                    userId,
                    customerId: params.session.customerId ?? null,
                    reusable: params.session.authorization.reusable === true,
                    channel: params.session.authorization.channel ?? null,
                    brand: params.session.authorization.brand ?? null,
                    bank: params.session.authorization.bank ?? null,
                    last4: params.session.authorization.last4 ?? null,
                    expMonth: params.session.authorization.expMonth ?? null,
                    expYear: params.session.authorization.expYear ?? null,
                },
                create: {
                    userId,
                    provider: params.providerKey,
                    customerId: params.session.customerId ?? null,
                    authorizationCode: params.session.authorization.code,
                    reusable: params.session.authorization.reusable === true,
                    channel: params.session.authorization.channel ?? null,
                    brand: params.session.authorization.brand ?? null,
                    bank: params.session.authorization.bank ?? null,
                    last4: params.session.authorization.last4 ?? null,
                    expMonth: params.session.authorization.expMonth ?? null,
                    expYear: params.session.authorization.expYear ?? null,
                },
            });
        } catch (err) {
            Logger.warn('Failed to persist payment authorization from checkout', {
                sessionId: params.session.id,
                provider: params.providerKey,
                userId,
                error: toError(err).message,
            });
        }
    }

    if (params.session.customerId && userId) {
        try {
            const userForCid = await prisma.user.findUnique({ where: { id: userId }, select: { externalCustomerIds: true } });
            const mergedCids = params.mergeIdMap(userForCid?.externalCustomerIds, params.providerKey, params.session.customerId);

            let canSetLegacyCid = true;
            try {
                const cidOwner = await prisma.user.findUnique({
                    where: { externalCustomerId: params.session.customerId },
                    select: { id: true },
                });
                if (cidOwner?.id && cidOwner.id !== userId) {
                    canSetLegacyCid = false;
                }
            } catch {
            }

            await prisma.user.update({
                where: { id: userId },
                data: {
                    ...(canSetLegacyCid ? { externalCustomerId: params.session.customerId } : null),
                    externalCustomerIds: mergedCids ?? userForCid?.externalCustomerIds,
                    paymentProvider: params.providerKey,
                },
            });
        } catch (err) {
            Logger.warn('Failed to persist customerId from checkout session', {
                sessionId: params.session.id,
                provider: params.providerKey,
                userId,
                customerId: params.session.customerId,
                error: toError(err).message,
            });
        }
    }

    const existing = await prisma.payment.findFirst({ where: { externalSessionId: params.session.id } });
    if (existing) {
        Logger.info('Skipping already-processed checkout', {
            sessionId: params.session.id,
            existingPaymentId: existing.id,
        });
        return { userId, shouldSkip: true };
    }

    if (params.session.paymentIntentId) {
        const existingByPaymentId = await prisma.payment.findFirst({
            where: { externalPaymentId: params.session.paymentIntentId },
            select: { id: true, subscriptionId: true },
        });
        if (existingByPaymentId) {
            if (params.session.subscriptionId && existingByPaymentId.subscriptionId) {
                try {
                    const sub = await prisma.subscription.findUnique({
                        where: { id: existingByPaymentId.subscriptionId },
                        select: { id: true, externalSubscriptionId: true },
                    });
                    if (sub && !sub.externalSubscriptionId) {
                        await prisma.subscription.update({
                            where: { id: sub.id },
                            data: {
                                externalSubscriptionId: params.session.subscriptionId,
                                externalSubscriptionIds: params.mergeIdMap(null, params.providerKey, params.session.subscriptionId),
                            },
                        });
                        Logger.info('Back-filled externalSubscriptionId from later event', {
                            subscriptionId: sub.id,
                            externalSubscriptionId: params.session.subscriptionId,
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed to back-fill externalSubscriptionId', {
                        error: toError(err).message,
                        subscriptionId: existingByPaymentId.subscriptionId,
                    });
                }
            }

            Logger.info('Skipping already-processed checkout (payment id match)', {
                sessionId: params.session.id,
                paymentIntentId: params.session.paymentIntentId,
                existingPaymentId: existingByPaymentId.id,
            });
            return { userId, shouldSkip: true };
        }
    }

    return { userId, shouldSkip: false };
}

export async function resolveCheckoutCompletedRouting(params: {
    session: StandardizedCheckoutSession;
    userId: string;
    providerKey: string;
    findPlanByPriceIdentifier: (priceId: string, metadataPlanId?: string | null) => Promise<Plan | null>;
}): Promise<{
    effectiveMode: 'payment' | 'subscription';
    shouldProcessAsSubscription: boolean;
}> {
    let effectiveMode: 'payment' | 'subscription' = params.session.mode === 'subscription' ? 'subscription' : 'payment';

    if (params.providerKey === 'paystack' && params.session.mode === 'subscription' && !params.session.subscriptionId) {
        const detectedPriceId = params.session.lineItems?.[0]?.priceId
            || params.session.metadata?.priceId
            || params.session.metadata?.planPriceId
            || params.session.metadata?.planCode;

        if (detectedPriceId) {
            const detectedPlan = await params.findPlanByPriceIdentifier(detectedPriceId, params.session.metadata?.planId);
            if (detectedPlan && detectedPlan.autoRenew === false) {
                effectiveMode = 'payment';
                Logger.warn('Paystack checkout reported subscription mode for non-recurring plan; routing as one-time', {
                    sessionId: params.session.id,
                    userId: params.userId,
                    provider: params.providerKey,
                    planId: detectedPlan.id,
                    priceId: detectedPriceId,
                });
            }
        }
    }

    return {
        effectiveMode,
        shouldProcessAsSubscription: effectiveMode === 'subscription' || Boolean(params.session.subscriptionId),
    };
}

export async function resolvePaymentSucceededUserContext(params: {
    payload: StandardizedPayment;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    resolveUserByCustomerId: (customerId: string) => Promise<string | null>;
    getCheckoutSession: (sessionId: string) => Promise<{
        subscriptionId?: string;
        clientReferenceId?: string;
        metadata?: Record<string, unknown>;
    }>;
}): Promise<{
    userId: string | null;
    orderId?: string;
    shouldSkip: boolean;
}> {
    let userId: string | null = params.payload.userId || params.payload.metadata?.userId || null;
    const orderId = params.payload.metadata?.orderId;

    if (orderId) {
        try {
            const existingByOrder = await prisma.payment.findFirst({
                where: { externalSessionId: orderId },
                select: { id: true, externalPaymentId: true },
            });
            if (existingByOrder) {
                if (!existingByOrder.externalPaymentId || existingByOrder.externalPaymentId !== params.payload.id) {
                    await prisma.payment.update({
                        where: { id: existingByOrder.id },
                        data: {
                            externalPaymentId: params.payload.id,
                            externalPaymentIds: params.mergeIdMap(null, params.providerKey, params.payload.id) ?? undefined,
                        }
                    });
                }
                Logger.info('Payment succeeded already recorded for order checkout', {
                    id: params.payload.id,
                    orderId,
                    paymentId: existingByOrder.id,
                });
                return { userId, orderId, shouldSkip: true };
            }
        } catch (err) {
            Logger.warn('Failed to resolve existing order payment on payment.succeeded', {
                id: params.payload.id,
                orderId,
                error: toError(err).message,
            });
        }
    }

    if (!userId) {
        const customerId = params.payload.metadata?.customerId;
        if (customerId) {
            try {
                const resolvedByCustomer = await params.resolveUserByCustomerId(customerId);
                if (resolvedByCustomer) {
                    userId = resolvedByCustomer;
                    Logger.info('Resolved userId from customerId on payment.succeeded', {
                        id: params.payload.id,
                        userId,
                        customerId,
                    });
                }
            } catch (err) {
                Logger.warn('Failed to resolve userId from customerId on payment.succeeded', {
                    id: params.payload.id,
                    customerId,
                    error: toError(err).message,
                });
            }
        }
    }

    if (!userId) {
        try {
            const existing = await prisma.payment.findUnique({
                where: { externalPaymentId: params.payload.id },
                select: { userId: true },
            });
            if (existing?.userId) {
                userId = existing.userId;
                Logger.info('Resolved userId from existing payment row on payment.succeeded', {
                    id: params.payload.id,
                    userId,
                });
            }
        } catch {
        }
    }

    if (!userId) {
        const maybeSessionId = params.payload.metadata?.paymentLinkId
            || params.payload.metadata?.subscriptionId
            || params.payload.metadata?.orderId;
        if (maybeSessionId) {
            try {
                const details = await params.getCheckoutSession(maybeSessionId);
                const recoveredUserId = details.clientReferenceId || details.metadata?.userId;
                if (typeof recoveredUserId === 'string' && recoveredUserId.length > 0) {
                    userId = recoveredUserId;
                    Logger.info('Recovered userId via checkout session lookup on payment.succeeded', {
                        id: params.payload.id,
                        userId,
                        sessionId: maybeSessionId,
                    });
                }
            } catch (err) {
                Logger.warn('Failed checkout session lookup on payment.succeeded', {
                    id: params.payload.id,
                    sessionId: maybeSessionId,
                    error: toError(err).message,
                });
            }
        }
    }

    if (!userId) {
        Logger.info('Payment succeeded without userId in metadata, skipping auto-fulfillment', {
            id: params.payload.id,
            provider: params.providerKey,
            metadataKeys: params.payload.metadata ? Object.keys(params.payload.metadata).slice(0, 25) : [],
        });
        return { userId: null, orderId, shouldSkip: true };
    }

    return { userId, orderId, shouldSkip: false };
}

export async function resolvePaymentSucceededSubscriptionRouting(params: {
    payload: StandardizedPayment;
    userId: string;
    providerKey: string;
    getCheckoutSession: (sessionId: string) => Promise<{
        subscriptionId?: string;
    }>;
}): Promise<{
    isSubscriptionCheckout: boolean;
    resolvedSubscriptionId?: string;
    shouldRouteThroughInvoice: boolean;
}> {
    const isSubscriptionCheckout = params.payload.metadata?.checkoutMode === 'subscription';
    let resolvedSubscriptionId: string | undefined = params.payload.metadata?.subscriptionId || undefined;

    if (isSubscriptionCheckout && !resolvedSubscriptionId) {
        const maybeRelatedSessionId = params.payload.metadata?.paymentLinkId
            || params.payload.metadata?.orderId;
        if (maybeRelatedSessionId) {
            try {
                const details = await params.getCheckoutSession(maybeRelatedSessionId);
                if (details.subscriptionId) {
                    resolvedSubscriptionId = details.subscriptionId;
                    Logger.info('Resolved subscriptionId via session lookup on payment.succeeded', {
                        id: params.payload.id,
                        subscriptionId: resolvedSubscriptionId,
                        sessionId: maybeRelatedSessionId,
                    });
                }
            } catch (err) {
                Logger.debug('Session lookup for subscription resolution failed', {
                    id: params.payload.id,
                    sessionId: maybeRelatedSessionId,
                    error: toError(err).message,
                });
            }
        }
    }

    if (!resolvedSubscriptionId && params.userId && params.providerKey === 'razorpay') {
        try {
            const activeRazorpaySub = await prisma.subscription.findFirst({
                where: {
                    userId: params.userId,
                    status: 'ACTIVE',
                    paymentProvider: 'razorpay',
                    externalSubscriptionId: { not: null },
                    plan: { autoRenew: true },
                },
                select: { externalSubscriptionId: true },
                orderBy: { expiresAt: 'desc' },
            });
            if (activeRazorpaySub?.externalSubscriptionId) {
                resolvedSubscriptionId = activeRazorpaySub.externalSubscriptionId;
                Logger.info('Resolved subscriptionId from active DB subscription for Razorpay renewal', {
                    id: params.payload.id,
                    subscriptionId: resolvedSubscriptionId,
                    userId: params.userId,
                });
            }
        } catch (err) {
            Logger.warn('Failed to look up active Razorpay subscription for renewal resolution', {
                id: params.payload.id,
                userId: params.userId,
                error: toError(err).message,
            });
        }
    }

    return {
        isSubscriptionCheckout,
        resolvedSubscriptionId,
        shouldRouteThroughInvoice: Boolean(resolvedSubscriptionId && !isSubscriptionCheckout),
    };
}

export function buildInvoiceFromSucceededPayment(params: {
    payload: StandardizedPayment;
    providerKey: string;
    resolvedSubscriptionId: string;
}): StandardizedInvoice {
    return {
        id: params.payload.id,
        providerId: params.payload.id,
        invoiceIdsByProvider: { [params.providerKey]: params.payload.id },
        amountPaid: params.payload.amount ?? 0,
        amountDue: 0,
        amountDiscount: 0,
        subtotal: params.payload.amount ?? 0,
        total: params.payload.amount ?? 0,
        currency: params.payload.currency ?? 'INR',
        status: 'paid',
        paymentIntentId: params.payload.id,
        subscriptionId: params.resolvedSubscriptionId,
        customerId: params.payload.metadata?.customerId,
        metadata: params.payload.metadata,
    };
}

export function buildCheckoutSessionFromSucceededPayment(params: {
    payload: StandardizedPayment;
    userId: string;
    orderId?: string;
    isSubscriptionCheckout: boolean;
    resolvedSubscriptionId?: string;
}): StandardizedCheckoutSession {
    const sessionId = typeof params.orderId === 'string' && params.orderId.trim().length > 0
        ? params.orderId
        : params.payload.id;
    const detectedMode: 'payment' | 'subscription' = (params.isSubscriptionCheckout || params.resolvedSubscriptionId)
        ? 'subscription'
        : 'payment';

    return {
        id: sessionId,
        userId: params.userId,
        userEmail: undefined,
        mode: detectedMode,
        subscriptionId: params.resolvedSubscriptionId,
        paymentStatus: params.payload.status === 'succeeded' ? 'paid' : 'unpaid',
        amountTotal: params.payload.amount,
        currency: params.payload.currency,
        metadata: params.payload.metadata,
        paymentIntentId: params.payload.id,
    };
}