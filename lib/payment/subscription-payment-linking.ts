import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';
import { updateSubscriptionLastPaymentAmount } from '../payments';
import { shouldClearPaidTokensOnRenewal } from '../paidTokens';
import { creditOrganizationSharedTokens } from '../teams';
import { getActiveCurrencyAsync } from './registry';
import { formatCurrency } from '../utils/currency';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import type { StandardizedCheckoutSession } from './types';
import { getDefaultTokenLabel } from '../settings';

type SubscriptionForRazorpayFallbackPayment = {
    id: string;
    userId: string;
    planId: string;
    organizationId: string | null;
    plan?: {
        priceCents: number | null;
    } | null;
};

type SubscriptionForStripeDemotion = {
    id: string;
    userId: string;
};

type SubscriptionForPendingPaymentLinking = {
    id: string;
    userId: string;
    planId: string;
};

type SubscriptionForNewlyCreatedActiveUpdate = SubscriptionForPendingPaymentLinking & {
    plan: {
        autoRenew: boolean;
    };
};

export async function linkPendingPaymentToSubscription(
    dbSub: SubscriptionForPendingPaymentLinking,
    deps: {
        getPendingSubscriptionLookbackDate: () => Date;
    }
): Promise<boolean> {
    try {
        const existingLinkedPayment = await prisma.payment.findFirst({
            where: {
                subscriptionId: dbSub.id,
                status: 'SUCCEEDED'
            }
        });

        if (existingLinkedPayment) {
            Logger.info('Subscription already has a linked payment, skipping', {
                subscriptionId: dbSub.id,
                existingPaymentId: existingLinkedPayment.id
            });
            return false;
        }

        const pendingPayments = await prisma.payment.findMany({
            where: {
                userId: dbSub.userId,
                planId: dbSub.planId,
                status: 'PENDING_SUBSCRIPTION',
                subscriptionId: null,
                createdAt: { gte: deps.getPendingSubscriptionLookbackDate() }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
        });

        if (pendingPayments.length > 0) {
            const payment = pendingPayments[0];
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    subscriptionId: dbSub.id,
                    status: 'SUCCEEDED'
                }
            });

            await updateSubscriptionLastPaymentAmount(dbSub.id);

            Logger.info('Linked pending payment to subscription', {
                paymentId: payment.id,
                subscriptionId: dbSub.id,
                userId: dbSub.userId
            });
            return true;
        }

        Logger.info('No pending payment found to link', {
            subscriptionId: dbSub.id,
            userId: dbSub.userId,
            planId: dbSub.planId
        });
        return false;
    } catch (err) {
        Logger.warn('Failed to link pending payment to subscription', {
            subscriptionId: dbSub.id,
            error: toError(err).message
        });
        return false;
    }
}

export async function ensureRazorpayFallbackSubscriptionPaymentOnUpdate(
    dbSub: SubscriptionForRazorpayFallbackPayment,
    providerSubscriptionId: string,
    deps: {
        providerKey: string;
        mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    }
): Promise<void> {
    if (deps.providerKey !== 'razorpay') return;

    try {
        const existingPayment = await prisma.payment.findFirst({
            where: {
                OR: [
                    { subscriptionId: dbSub.id },
                    { externalPaymentId: providerSubscriptionId },
                    { externalSessionId: providerSubscriptionId },
                ],
                status: 'SUCCEEDED',
            },
            select: { id: true },
        });

        if (existingPayment) return;

        const amountCents = typeof dbSub.plan?.priceCents === 'number' ? dbSub.plan.priceCents : 0;
        await prisma.$transaction(async (tx) => {
            await tx.payment.create({
                data: {
                    userId: dbSub.userId,
                    subscriptionId: dbSub.id,
                    planId: dbSub.planId,
                    organizationId: dbSub.organizationId ?? null,
                    amountCents,
                    subtotalCents: amountCents,
                    discountCents: 0,
                    status: 'SUCCEEDED',
                    externalPaymentId: providerSubscriptionId,
                    externalSessionId: providerSubscriptionId,
                    externalPaymentIds: deps.mergeIdMap(null, deps.providerKey, providerSubscriptionId) ?? undefined,
                    externalSessionIds: deps.mergeIdMap(null, deps.providerKey, providerSubscriptionId) ?? undefined,
                    paymentProvider: deps.providerKey,
                },
            });

            await tx.user.update({
                where: { id: dbSub.userId },
                data: { paymentsCount: { increment: 1 } },
            });
        });

        await updateSubscriptionLastPaymentAmount(dbSub.id);
        Logger.info('Created fallback Razorpay subscription payment on update', {
            subscriptionId: dbSub.id,
            providerSubscriptionId,
        });
    } catch (err) {
        Logger.warn('Failed to create fallback Razorpay payment on subscription update', {
            providerSubscriptionId,
            error: toError(err).message,
        });
    }
}

export async function demoteNewlyCreatedStripeActiveSubscriptionWithoutPayment(
    dbSub: SubscriptionForStripeDemotion,
    providerSubscriptionId: string,
    deps: {
        providerKey: string;
        status: string;
    }
): Promise<boolean> {
    if (!(deps.providerKey === 'stripe' && deps.status === 'active')) return false;

    const hasSuccessfulPayment = await prisma.payment.findFirst({
        where: {
            subscriptionId: dbSub.id,
            status: 'SUCCEEDED',
        },
        select: { id: true },
    });

    if (hasSuccessfulPayment) return false;

    await prisma.subscription.update({
        where: { id: dbSub.id },
        data: { status: 'PENDING' },
    });

    Logger.info('Demoted newly-created Stripe ACTIVE subscription to PENDING (no payment evidence yet)', {
        providerSubscriptionId,
        dbSubscriptionId: dbSub.id,
        userId: dbSub.userId,
    });

    return true;
}

export async function handleNewlyCreatedActiveSubscriptionUpdate(
    dbSub: SubscriptionForNewlyCreatedActiveUpdate,
    providerSubscriptionId: string,
    deps: {
        providerKey: string;
        status: string;
        cancelSupersededOneTimeSubscriptions: (userId: string, replacementSubscriptionId: string) => Promise<void>;
        getPendingSubscriptionLookbackDate: () => Date;
        syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
    }
): Promise<{ linked: boolean; demoted: boolean }> {
    if (deps.providerKey === 'paystack' && dbSub.plan.autoRenew === true) {
        await deps.cancelSupersededOneTimeSubscriptions(dbSub.userId, dbSub.id);
    }

    const linked = await linkPendingPaymentToSubscription(dbSub, {
        getPendingSubscriptionLookbackDate: deps.getPendingSubscriptionLookbackDate,
    });
    if (linked) {
        await deps.syncOrganizationEligibilityForUser(dbSub.userId);
        return { linked: true, demoted: false };
    }

    const demoted = await demoteNewlyCreatedStripeActiveSubscriptionWithoutPayment(
        dbSub,
        providerSubscriptionId,
        {
            providerKey: deps.providerKey,
            status: deps.status,
        }
    );

    return { linked: false, demoted };
}

export async function tryRecordPaystackRenewalStyleCharge(params: {
    session: StandardizedCheckoutSession;
    userId: string;
    plan: {
        id: string;
        name: string;
        autoRenew: boolean;
        supportsOrganizations: boolean;
        tokenLimit: number | null;
        durationHours: number;
    };
    providerKey: string;
    finalPaymentIntent: string | undefined;
    amountCents: number;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    resolveOrganizationContext: (userId: string) => Promise<{ role: string; organization: { id: string } } | null>;
    refreshSubscriptionExpiryFromProvider: (opts: {
        dbSubscriptionId: string;
        providerSubscriptionId: string;
        wasLocallyExpired: boolean;
        resurrectOnlyIfFuture: boolean;
        warnMessage: string;
    }) => Promise<{ refreshedPeriodEnd: Date | null }>;
    markSubscriptionActive: (dbSubscriptionId: string, expiresAt?: Date) => Promise<void>;
    findRecentNotificationByExactMessage: (
        userId: string,
        title: string,
        message: string,
        lookbackMs: number,
    ) => Promise<{ id: string } | null>;
    consumeCouponRedemptionFromMetadata: (metadata?: Record<string, unknown> | null) => Promise<void>;
}): Promise<boolean> {
    const { session, userId, plan, providerKey, finalPaymentIntent, amountCents } = params;
    if (providerKey !== 'paystack') return false;
    if (!finalPaymentIntent) return false;

    const candidateSub = await prisma.subscription.findFirst({
        where: {
            userId,
            planId: plan.id,
            paymentProvider: providerKey,
            status: { in: ['ACTIVE', 'PENDING', 'EXPIRED'] },
            expiresAt: { gt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { expiresAt: 'desc' },
        select: {
            id: true,
            organizationId: true,
            externalSubscriptionId: true,
            status: true,
            expiresAt: true,
        }
    });

    let hasSucceededPaymentForSub = false;
    if (candidateSub) {
        try {
            const existingSucceeded = await prisma.payment.findFirst({
                where: {
                    subscriptionId: candidateSub.id,
                    status: 'SUCCEEDED',
                },
                select: { id: true },
            });
            hasSucceededPaymentForSub = Boolean(existingSucceeded);
        } catch (err) {
            Logger.warn('Failed to check existing payments for Paystack renewal detection', {
                userId,
                subscriptionId: candidateSub.id,
                error: toError(err).message,
            });
        }
    }

    const now = Date.now();
    const activationWindowStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const activationWindowEnd = new Date(now + 2 * 24 * 60 * 60 * 1000);

    const shouldTreatAsRenewal = Boolean(candidateSub && hasSucceededPaymentForSub);
    const shouldTreatAsActivationOfPrecreatedSub = Boolean(
        candidateSub
        && !hasSucceededPaymentForSub
        && candidateSub.externalSubscriptionId
        // Guardrail: only treat as activation when the local subscription boundary is
        // near “now”. This avoids accidentally linking unrelated/older unpaid records.
        && candidateSub.expiresAt >= activationWindowStart
        && candidateSub.expiresAt <= activationWindowEnd
    );

    if (!shouldTreatAsRenewal && !shouldTreatAsActivationOfPrecreatedSub) {
        return false;
    }

    if (!candidateSub) {
        return false;
    }

    const organizationContext = await params.resolveOrganizationContext(userId);
    const resolvedOrganizationId = organizationContext?.role === 'OWNER'
        ? organizationContext.organization.id
        : (candidateSub.organizationId ?? null);

    const shouldResetTokensOnRenewal = await shouldClearPaidTokensOnRenewal(Boolean(plan.autoRenew));

    try {
        await prisma.$transaction(async (tx) => {
            await tx.payment.create({
                data: {
                    userId,
                    subscriptionId: candidateSub.id,
                    planId: plan.id,
                    organizationId: resolvedOrganizationId,
                    amountCents,
                    subtotalCents: amountCents,
                    discountCents: 0,
                    couponCode: session.metadata?.couponCode || null,
                    status: 'SUCCEEDED',
                    externalSessionId: session.id,
                    externalPaymentId: finalPaymentIntent,
                    externalPaymentIds: params.mergeIdMap(null, providerKey, finalPaymentIntent) ?? undefined,
                    externalSessionIds: params.mergeIdMap(null, providerKey, session.id) ?? undefined,
                    paymentProvider: providerKey
                }
            });

            await tx.user.update({
                where: { id: userId },
                data: { paymentsCount: { increment: 1 } }
            });

            if (plan.tokenLimit && plan.tokenLimit > 0) {
                const planSupportsOrganizations = plan.supportsOrganizations === true;
                if (resolvedOrganizationId && planSupportsOrganizations) {
                    if (shouldResetTokensOnRenewal) {
                        await tx.organization.update({
                            where: { id: resolvedOrganizationId },
                            data: { tokenBalance: plan.tokenLimit },
                        });
                    } else {
                        await creditOrganizationSharedTokens({
                            organizationId: resolvedOrganizationId,
                            amount: plan.tokenLimit,
                            tx,
                        });
                    }
                } else if (shouldResetTokensOnRenewal) {
                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: plan.tokenLimit } });
                } else {
                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: plan.tokenLimit } } });
                }
            }
        });

        await updateSubscriptionLastPaymentAmount(candidateSub.id);

        let refreshedPeriodEnd: Date | null = null;
        if (candidateSub.externalSubscriptionId) {
            const refreshed = await params.refreshSubscriptionExpiryFromProvider({
                dbSubscriptionId: candidateSub.id,
                providerSubscriptionId: candidateSub.externalSubscriptionId,
                wasLocallyExpired: candidateSub.status === 'EXPIRED',
                resurrectOnlyIfFuture: false,
                warnMessage: 'Unable to refresh subscription expiry after Paystack renewal-style charge',
            });
            refreshedPeriodEnd = refreshed.refreshedPeriodEnd;
        }

        if (candidateSub.status === 'EXPIRED' && !refreshedPeriodEnd) {
            const durationHours = typeof plan.durationHours === 'number' ? plan.durationHours : 0;
            if (durationHours > 0) {
                const base = Math.max(candidateSub.expiresAt.getTime(), Date.now());
                const nextExpiresAt = new Date(base + durationHours * 60 * 60 * 1000);
                await params.markSubscriptionActive(candidateSub.id, nextExpiresAt);
            } else {
                await params.markSubscriptionActive(candidateSub.id);
            }
        } else if (candidateSub.status === 'PENDING') {
            // If this was a pre-created Paystack subscription that only charges at cycle end,
            // the first charge is the proof of activation.
            await params.markSubscriptionActive(candidateSub.id, refreshedPeriodEnd ?? undefined);
        }

        Logger.info('Recorded Paystack renewal/activation-style charge as SUCCEEDED', {
            sessionId: session.id,
            userId,
            planId: plan.id,
            subscriptionId: candidateSub.id,
            externalPaymentId: finalPaymentIntent,
            treatedAs: shouldTreatAsActivationOfPrecreatedSub ? 'activation' : 'renewal',
        });

        try {
            const renewalTitle = shouldTreatAsActivationOfPrecreatedSub ? 'Subscription Activated' : 'Subscription Renewed';
            const renewalMessage = shouldTreatAsActivationOfPrecreatedSub
                ? `Your subscription to ${plan.name} is now active.`
                : `Your subscription to ${plan.name} has been renewed.`;

            const existingRecentNotification = await params.findRecentNotificationByExactMessage(
                userId,
                renewalTitle,
                renewalMessage,
                60 * 60 * 1000
            );

            if (!existingRecentNotification) {
                const activeCurrency = await getActiveCurrencyAsync();
                const refreshedSub = await prisma.subscription.findUnique({
                    where: { id: candidateSub.id },
                    select: { expiresAt: true },
                });

                await sendBillingNotification({
                    userId,
                    title: renewalTitle,
                    message: renewalMessage,
                    templateKey: 'subscription_renewed',
                    variables: {
                        planName: plan.name,
                        amount: formatCurrency(amountCents, activeCurrency),
                        date: new Date().toLocaleDateString(),
                        transactionId: finalPaymentIntent || session.id,
                        expiresAt: refreshedSub?.expiresAt ? refreshedSub.expiresAt.toLocaleDateString() : undefined,
                    },
                });

                await sendAdminNotificationEmail({
                    userId,
                    title: shouldTreatAsActivationOfPrecreatedSub ? 'Subscription activated' : 'Subscription renewed',
                    alertType: shouldTreatAsActivationOfPrecreatedSub ? 'new_purchase' : 'renewal',
                    message: shouldTreatAsActivationOfPrecreatedSub
                        ? `User ${userId} activated ${plan.name}. Subscription: ${candidateSub.id}`
                        : `User ${userId} renewed ${plan.name}. Subscription: ${candidateSub.id}`,
                    templateKey: 'admin_notification',
                    variables: {
                        planName: plan.name,
                        amount: formatCurrency(amountCents, activeCurrency),
                        transactionId: finalPaymentIntent || session.id,
                        startedAt: new Date().toLocaleString(),
                    },
                });
            }
        } catch (notifErr) {
            Logger.warn('Failed to send renewal notification for Paystack renewal charge', {
                userId,
                subscriptionId: candidateSub.id,
                error: toError(notifErr).message,
            });
        }

        await params.consumeCouponRedemptionFromMetadata(session.metadata);
        return true;
    } catch (err) {
        Logger.error('Failed to record Paystack renewal-style charge', {
            sessionId: session.id,
            userId,
            planId: plan.id,
            subscriptionId: candidateSub.id,
            error: toError(err).message
        });
        return false;
    }
}

export async function recordPendingSubscriptionPaymentFallback(params: {
    session: StandardizedCheckoutSession;
    userId: string;
    plan: {
        id: string;
        name: string;
        tokenLimit: number | null;
        tokenName: string | null;
        supportsOrganizations: boolean;
    };
    providerKey: string;
    finalPaymentIntent: string | undefined;
    amountCents: number;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    consumeCouponRedemptionFromMetadata: (metadata?: Record<string, unknown> | null) => Promise<void>;
    findRecentCancelledRecurringSubscription: (
        userId: string,
        lookbackMs: number,
    ) => Promise<{ id: string } | null>;
    resolveOrganizationContext: (userId: string) => Promise<{ role: string; organization: { id: string } } | null>;
    syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<{ id: string; userId: string; planId: string } | null>;
    getPendingSubscriptionLookbackDate: () => Date;
}): Promise<void> {
    const { session, userId, plan, providerKey, finalPaymentIntent, amountCents } = params;

    try {
        await prisma.payment.create({
            data: {
                userId,
                subscriptionId: null,
                planId: plan.id,
                amountCents,
                subtotalCents: amountCents,
                discountCents: 0,
                couponCode: session.metadata?.couponCode || null,
                status: 'PENDING_SUBSCRIPTION',
                externalSessionId: session.id,
                externalPaymentId: finalPaymentIntent,
                externalPaymentIds: params.mergeIdMap(null, providerKey, finalPaymentIntent) ?? undefined,
                externalSessionIds: params.mergeIdMap(null, providerKey, session.id) ?? undefined,
                paymentProvider: providerKey
            }
        });

        await prisma.user.update({
            where: { id: userId },
            data: { paymentsCount: { increment: 1 } }
        });

        Logger.info('Recorded pending subscription payment', {
            sessionId: session.id,
            userId,
            planId: plan.id,
            amountCents
        });

        await params.consumeCouponRedemptionFromMetadata(session.metadata);

        const isSwitchNowFallbackFlow = Boolean(session.metadata?.prorationFallbackReason);
        const recentCancelledRecurring = await params.findRecentCancelledRecurringSubscription(
            userId,
            30 * 60 * 1000,
        );
        const suppressNotifications = isSwitchNowFallbackFlow && Boolean(recentCancelledRecurring);

        if (plan.tokenLimit && plan.tokenLimit > 0) {
            const organizationContext = await params.resolveOrganizationContext(userId);
            if (organizationContext?.role === 'OWNER' && plan.supportsOrganizations) {
                await creditOrganizationSharedTokens({
                    organizationId: organizationContext.organization.id,
                    amount: plan.tokenLimit,
                });
            } else {
                await prisma.user.update({
                    where: { id: userId },
                    data: { tokenBalance: { increment: plan.tokenLimit } },
                });
            }
            Logger.info('Credited tokens from Paystack pending subscription payment', {
                userId,
                planId: plan.id,
                tokens: plan.tokenLimit,
            });
        }

        await params.syncOrganizationEligibilityForUser(userId);

        if (!suppressNotifications) {
            try {
                const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
                const tokenName = planTokenName || await getDefaultTokenLabel();
                const tokenInfo = plan.tokenLimit ? ` with ${plan.tokenLimit} ${tokenName}` : '';
                const currency = await getActiveCurrencyAsync();
                const formattedAmount = formatCurrency(amountCents, currency);
                const transactionId = finalPaymentIntent || session.id;

                await sendBillingNotification({
                    userId,
                    title: 'Subscription Activated',
                    message: `Your subscription to ${plan.name}${tokenInfo} is now active.`,
                    templateKey: 'subscription_activated',
                    variables: {
                        planName: plan.name,
                        amount: formattedAmount,
                        transactionId,
                        tokenBalance: String(plan.tokenLimit || 0),
                        tokenName,
                        startedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                        expiresAt: '',
                    },
                });

                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true, name: true },
                });

                await sendAdminNotificationEmail({
                    title: `New Subscription: ${plan.name}`,
                    alertType: 'new_purchase',
                    message: `A new subscription was activated.\n\nPlan: ${plan.name}\nUser: ${user?.name || 'N/A'}\nEmail: ${user?.email || 'N/A'}`,
                    userId,
                });
            } catch (notifErr) {
                Logger.warn('Failed to send notifications for Paystack pending subscription payment', {
                    userId,
                    error: toError(notifErr).message,
                });
            }
        }

        let existingSub: { id: string; userId: string; planId: string } | null = null;
        const providerSubscriptionId = session.subscriptionId || session.metadata?.subscriptionId;

        if (providerSubscriptionId) {
            Logger.info('Attempting to link pending payment to existing subscription', {
                sessionId: session.id,
                subscriptionId: providerSubscriptionId,
                userId
            });
            existingSub = await params.findSubscriptionByProviderId(providerSubscriptionId);
        }

        if (!existingSub) {
            const latestSub = await prisma.subscription.findFirst({
                where: {
                    userId,
                    planId: plan.id,
                    paymentProvider: providerKey,
                    status: 'ACTIVE',
                    createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, userId: true, planId: true }
            });
            existingSub = latestSub;
        }

        if (existingSub) {
            await linkPendingPaymentToSubscription(existingSub, {
                getPendingSubscriptionLookbackDate: params.getPendingSubscriptionLookbackDate,
            });
        }
    } catch (err) {
        Logger.error('Failed to record pending subscription payment', {
            sessionId: session.id,
            userId,
            error: toError(err).message
        });
    }
}