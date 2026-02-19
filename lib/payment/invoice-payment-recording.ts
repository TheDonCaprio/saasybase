import { prisma } from '../prisma';
import { Logger } from '../logger';
import { creditOrganizationSharedTokens } from '../teams';
import type { Prisma } from '@prisma/client';
import type { StandardizedInvoice } from './types';
import { toError } from '../runtime-guards';
import { updateSubscriptionLastPaymentAmount } from '../payments';
import { applyInvoicePaymentStateUpdates } from './invoice-payment-state-updates';
import { refreshInvoicePaymentSubscriptionExpiry } from './invoice-payment-expiry-refresh';
import { processInvoicePaidNotifications } from './invoice-payment-notifications';

type InvoicePaymentDbSubShape = {
    id: string;
    userId: string;
    planId: string;
    plan: {
        tokenLimit: number | null;
        supportsOrganizations: boolean | null;
    };
};

type InvoicePaidOrchestrationSubscriptionShape = InvoicePaymentDbSubShape & {
    organizationId: string | null;
    status: string;
    prorationPendingSince: Date | null;
    expiresAt: Date;
    plan: {
        name: string;
        autoRenew: boolean;
        tokenLimit: number | null;
        supportsOrganizations: boolean | null;
    };
};

export async function processInvoicePaidEvent<TSub extends InvoicePaidOrchestrationSubscriptionShape>(params: {
    invoice: StandardizedInvoice;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<TSub | null>;
    ensureProviderBackedSubscription: (subscriptionId: string, context: { invoice: StandardizedInvoice }) => Promise<TSub | null>;
    resolveOrganizationContext: (userId: string) => Promise<{
        role: 'OWNER' | 'MEMBER';
        organization: { id: string };
    } | null>;
    shouldClearPaidTokensOnRenewal: (isRecurringPlan: boolean) => Promise<boolean>;
    refreshSubscriptionExpiryFromProvider: (opts: {
        dbSubscriptionId: string;
        providerSubscriptionId: string;
        wasLocallyExpired: boolean;
        resurrectOnlyIfFuture: boolean;
        warnMessage: string;
    }) => Promise<{ refreshedPeriodEnd: Date | null; resurrected: boolean }>;
    findRecentNotificationByTitles: (
        userId: string,
        titles: string[],
        lookbackMs: number
    ) => Promise<{ id: string } | null>;
    findRecentNotificationByExactMessage: (
        userId: string,
        title: string,
        message: string,
        lookbackMs: number
    ) => Promise<{ id: string } | null>;
}): Promise<void> {
    const preflight = await resolveInvoicePaidProcessingContext<TSub>({
        invoice: params.invoice,
        findSubscriptionByProviderId: params.findSubscriptionByProviderId,
        ensureProviderBackedSubscription: params.ensureProviderBackedSubscription,
        resolveOrganizationContext: params.resolveOrganizationContext,
        shouldClearPaidTokensOnRenewal: params.shouldClearPaidTokensOnRenewal,
    });
    if (preflight.shouldSkip || !preflight.dbSub || !preflight.subscriptionId || !preflight.paymentIntentId) {
        return;
    }

    let dbSub: TSub = preflight.dbSub;
    const subscriptionId = preflight.subscriptionId;
    const paymentIntentId = preflight.paymentIntentId;
    const resolvedOrganizationId = preflight.resolvedOrganizationId ?? null;
    const shouldResetTokensOnRenewal = preflight.shouldResetTokensOnRenewal === true;

    try {
        const paymentResult = await recordInvoicePaymentAndApplyTokens({
            dbSub,
            invoice: params.invoice,
            paymentIntentId,
            subscriptionId,
            resolvedOrganizationId,
            shouldResetTokensOnRenewal,
            providerKey: params.providerKey,
            mergeIdMap: params.mergeIdMap,
        });

        await updateSubscriptionLastPaymentAmount(dbSub.id);

        dbSub = await applyInvoicePaymentStateUpdates({
            dbSub,
            paymentCreated: paymentResult.created,
            subscriptionId,
            paymentIntentId,
        }) as TSub;

        const refreshResult = await refreshInvoicePaymentSubscriptionExpiry({
            dbSub,
            subscriptionId,
            refreshSubscriptionExpiryFromProvider: params.refreshSubscriptionExpiryFromProvider,
        });
        dbSub = refreshResult.dbSub as TSub;
        const refreshedExpiresAt = refreshResult.refreshedExpiresAt;

        const notificationResult = await processInvoicePaidNotifications({
            dbSub,
            invoice: params.invoice,
            paymentResult,
            subscriptionId,
            paymentIntentId,
            refreshedExpiresAt,
            findRecentNotificationByTitles: params.findRecentNotificationByTitles,
            findRecentNotificationByExactMessage: params.findRecentNotificationByExactMessage,
        });

        if (notificationResult.shouldReturnEarly) {
            return;
        }

        Logger.info('Recorded recurring payment', { subscriptionId, paymentIntentId });

    } catch (err) {
        Logger.error('Failed to process invoice payment', { error: toError(err).message });
    }
}

export async function resolveInvoicePaidProcessingContext<TSub extends InvoicePaymentDbSubShape & {
    organizationId: string | null;
    plan: {
        autoRenew: boolean;
        tokenLimit: number | null;
        supportsOrganizations: boolean | null;
    };
}>(params: {
    invoice: StandardizedInvoice;
    findSubscriptionByProviderId: (subscriptionId: string) => Promise<TSub | null>;
    ensureProviderBackedSubscription: (subscriptionId: string, context: { invoice: StandardizedInvoice }) => Promise<TSub | null>;
    resolveOrganizationContext: (userId: string) => Promise<{
        role: 'OWNER' | 'MEMBER';
        organization: { id: string };
    } | null>;
    shouldClearPaidTokensOnRenewal: (isRecurringPlan: boolean) => Promise<boolean>;
}): Promise<{
    shouldSkip: boolean;
    subscriptionId?: string;
    paymentIntentId?: string;
    dbSub?: TSub;
    resolvedOrganizationId?: string | null;
    shouldResetTokensOnRenewal?: boolean;
}> {
    const subscriptionId = params.invoice.subscriptionId;
    const paymentIntentId = params.invoice.paymentIntentId;

    if (!subscriptionId || !paymentIntentId) {
        return { shouldSkip: true };
    }

    const initialSub = await params.findSubscriptionByProviderId(subscriptionId);
    let dbSub: TSub | null = initialSub;

    if (!dbSub) {
        dbSub = await params.ensureProviderBackedSubscription(subscriptionId, { invoice: params.invoice });
        if (!dbSub) {
            if (params.invoice.billingReason === 'subscription_create') {
                Logger.info('Ignoring invoice.payment_succeeded for new subscription (handled by checkout)', {
                    subscriptionId,
                    invoiceId: params.invoice.id,
                });
                return { shouldSkip: true };
            }

            Logger.warn('Invoice paid for unknown subscription', {
                subscriptionId,
                invoiceId: params.invoice.id,
                billingReason: params.invoice.billingReason,
            });
            return { shouldSkip: true };
        }
    }

    const organizationContext = await params.resolveOrganizationContext(dbSub.userId);
    const resolvedOrganizationId = organizationContext?.role === 'OWNER'
        ? organizationContext.organization.id
        : (dbSub.organizationId ?? null);

    const shouldResetTokensOnRenewal = await params.shouldClearPaidTokensOnRenewal(Boolean(dbSub.plan?.autoRenew));

    return {
        shouldSkip: false,
        subscriptionId,
        paymentIntentId,
        dbSub,
        resolvedOrganizationId,
        shouldResetTokensOnRenewal,
    };
}

export async function recordInvoicePaymentAndApplyTokens<TSub extends InvoicePaymentDbSubShape>(params: {
    dbSub: TSub;
    invoice: StandardizedInvoice;
    paymentIntentId: string;
    subscriptionId: string;
    resolvedOrganizationId: string | null;
    shouldResetTokensOnRenewal: boolean;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<{ payment: { id: string; externalPaymentId: string | null }; created: boolean }> {
    return prisma.$transaction(async (tx) => {
        const existingPayment = await tx.payment.findUnique({ where: { externalPaymentId: params.paymentIntentId } });
        if (existingPayment) {
            return { payment: existingPayment, created: false };
        }

        const priorSuccessfulPaymentsForSubscription = await tx.payment.count({
            where: {
                subscriptionId: params.dbSub.id,
                status: 'SUCCEEDED',
            },
        });

        const payment = await tx.payment.create({
            data: {
                userId: params.dbSub.userId,
                subscriptionId: params.dbSub.id,
                planId: params.dbSub.planId,
                organizationId: params.resolvedOrganizationId,
                amountCents: params.invoice.amountPaid,
                subtotalCents: params.invoice.subtotal,
                discountCents: params.invoice.amountDiscount,
                status: 'SUCCEEDED',
                externalPaymentId: params.paymentIntentId,
                externalPaymentIds: params.mergeIdMap(null, params.providerKey, params.paymentIntentId) ?? undefined,
                externalSessionId: null,
                externalSessionIds: params.mergeIdMap(null, params.providerKey, params.invoice.id) ?? undefined,
                paymentProvider: params.providerKey
            } satisfies Prisma.PaymentUncheckedCreateInput
        });

        await tx.user.update({
            where: { id: params.dbSub.userId },
            data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput
        });

        const isLikelyInitialSubscriptionCharge =
            params.invoice.billingReason === 'subscription_create' || priorSuccessfulPaymentsForSubscription === 0;

        const tokenLimit = params.dbSub.plan?.tokenLimit;
        const planSupportsOrganizations = params.dbSub.plan?.supportsOrganizations === true;

        if (isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0) {
            const tokensToGrant = tokenLimit;
            if (params.resolvedOrganizationId && planSupportsOrganizations) {
                await creditOrganizationSharedTokens({
                    organizationId: params.resolvedOrganizationId,
                    amount: tokensToGrant,
                    tx,
                });
            } else {
                await tx.user.update({
                    where: { id: params.dbSub.userId },
                    data: { tokenBalance: { increment: tokensToGrant } },
                });
            }

            Logger.info('Granted tokens from subscription invoice payment', {
                subscriptionId: params.subscriptionId,
                paymentIntentId: params.paymentIntentId,
                invoiceId: params.invoice.id,
                billingReason: params.invoice.billingReason,
                priorSuccessfulPaymentsForSubscription,
                tokensToGrant,
                resolvedOrganizationId: params.resolvedOrganizationId,
            });
        } else if (!isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0 && params.shouldResetTokensOnRenewal) {
            if (params.resolvedOrganizationId && planSupportsOrganizations) {
                await tx.organization.update({
                    where: { id: params.resolvedOrganizationId },
                    data: { tokenBalance: tokenLimit },
                });
            } else {
                await tx.user.update({
                    where: { id: params.dbSub.userId },
                    data: { tokenBalance: tokenLimit },
                });
            }

            Logger.info('Reset tokens on subscription renewal invoice payment', {
                subscriptionId: params.subscriptionId,
                paymentIntentId: params.paymentIntentId,
                invoiceId: params.invoice.id,
                billingReason: params.invoice.billingReason,
                priorSuccessfulPaymentsForSubscription,
                tokenLimit,
                resolvedOrganizationId: params.resolvedOrganizationId,
                planSupportsOrganizations,
            });
        } else if (!isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0 && !params.shouldResetTokensOnRenewal) {
            if (params.resolvedOrganizationId && planSupportsOrganizations) {
                await creditOrganizationSharedTokens({
                    organizationId: params.resolvedOrganizationId,
                    amount: tokenLimit,
                    tx,
                });
            } else {
                await tx.user.update({
                    where: { id: params.dbSub.userId },
                    data: { tokenBalance: { increment: tokenLimit } },
                });
            }

            Logger.info('Incremented tokens on subscription renewal invoice payment', {
                subscriptionId: params.subscriptionId,
                paymentIntentId: params.paymentIntentId,
                invoiceId: params.invoice.id,
                billingReason: params.invoice.billingReason,
                priorSuccessfulPaymentsForSubscription,
                tokenLimit,
                resolvedOrganizationId: params.resolvedOrganizationId,
                planSupportsOrganizations,
            });
        } else {
            Logger.info('Skipping token grant/reset from subscription invoice payment', {
                subscriptionId: params.subscriptionId,
                paymentIntentId: params.paymentIntentId,
                invoiceId: params.invoice.id,
                billingReason: params.invoice.billingReason,
                priorSuccessfulPaymentsForSubscription,
                hasPlanTokenLimit: Boolean(tokenLimit && tokenLimit > 0),
                shouldResetTokensOnRenewal: params.shouldResetTokensOnRenewal,
            });
        }

        return { payment, created: true };
    });
}