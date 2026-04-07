import type { Prisma } from '@/lib/prisma-client';
import { Logger } from '../logger';
import { prisma } from '../prisma';
import { creditOrganizationSharedTokens, creditAllocatedPerMemberTokens } from '../teams';
import { toError } from '../runtime-guards';
import { updateSubscriptionLastPaymentAmount } from '../payments';
import type { OrganizationPlanContext } from '../user-plan-context';
import type { SubscriptionDetails } from './types';

type SubscriptionPaymentBase = {
    userId: string;
    subscriptionId: string;
    planId: string;
    organizationId: string | null;
};

type RecordSubscriptionCheckoutPaymentParams = {
    subscription: SubscriptionDetails;
    paymentId?: string | null;
    sessionId: string;
    userId: string;
    dbSubscriptionId: string;
    defaultPlanPriceCents: number;
    sessionAmountTotal?: number | null;
    sessionAmountSubtotal?: number | null;
    checkoutCouponCode: string | null;
    subscriptionPaymentBase: SubscriptionPaymentBase;
    tokensToGrant: number;
    planSupportsOrganizations: boolean;
    organizationContext: OrganizationPlanContext | null;
    shouldResetTokensOnRenewal: boolean;
    desiredStatus: 'ACTIVE' | 'PENDING';
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
};

function buildSubscriptionPaymentCreateInput(params: {
    userId: string;
    subscriptionId: string;
    planId: string;
    organizationId: string | null;
    amountCents: number;
    subtotalCents: number;
    discountCents: number;
    couponCode: string | null;
    externalPaymentId?: string | null;
    externalSessionId: string;
    includeExternalPaymentIdMapWhenMissingPaymentId?: boolean;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Prisma.PaymentUncheckedCreateInput {
    const includeExternalPaymentIdMapWhenMissingPaymentId = params.includeExternalPaymentIdMapWhenMissingPaymentId ?? true;

    const externalPaymentIds = includeExternalPaymentIdMapWhenMissingPaymentId || params.externalPaymentId
        ? (params.mergeIdMap(null, params.providerKey, params.externalPaymentId) ?? undefined)
        : undefined;

    return {
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        planId: params.planId,
        organizationId: params.organizationId,
        amountCents: params.amountCents,
        subtotalCents: params.subtotalCents,
        discountCents: params.discountCents,
        couponCode: params.couponCode,
        status: 'SUCCEEDED',
        externalPaymentId: params.externalPaymentId,
        externalSessionId: params.externalSessionId,
        externalPaymentIds,
        externalSessionIds: params.mergeIdMap(null, params.providerKey, params.externalSessionId) ?? undefined,
        paymentProvider: params.providerKey,
    } satisfies Prisma.PaymentUncheckedCreateInput;
}

async function incrementUserPaymentsCount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.user.update({
        where: { id: userId },
        data: { paymentsCount: { increment: 1 } },
    });
}

async function applySubscriptionCheckoutTokens(
    tx: Prisma.TransactionClient,
    userId: string,
    tokensToGrant: number,
    planSupportsOrganizations: boolean,
    organizationContext: OrganizationPlanContext | null,
    shouldResetOnRenewal: boolean,
    warnMessage: string
): Promise<void> {
    if (tokensToGrant <= 0) return;

    try {
        if (planSupportsOrganizations && organizationContext?.role === 'OWNER') {
            const strategy = (organizationContext.organization.tokenPoolStrategy || 'SHARED_FOR_ORG').toUpperCase();
            if (strategy === 'ALLOCATED_PER_MEMBER') {
                if (shouldResetOnRenewal) {
                    const { resetAllocatedPerMemberTokens } = await import('../teams');
                    await resetAllocatedPerMemberTokens({
                        organizationId: organizationContext.organization.id,
                        amount: tokensToGrant,
                        tx,
                    });
                } else {
                    await creditAllocatedPerMemberTokens({
                        organizationId: organizationContext.organization.id,
                        amount: tokensToGrant,
                        tx,
                    });
                }
            } else {
                if (shouldResetOnRenewal) {
                    await tx.organization.update({
                        where: { id: organizationContext.organization.id },
                        data: { tokenBalance: tokensToGrant }
                    });
                } else {
                    await creditOrganizationSharedTokens({
                        organizationId: organizationContext.organization.id,
                        amount: tokensToGrant,
                        tx,
                    });
                }
            }
        } else if (planSupportsOrganizations) {
            Logger.info('Deferred team token allocation until workspace provisioning (subscription checkout)', {
                userId,
                tokensDeferred: tokensToGrant,
            });
        } else if (shouldResetOnRenewal) {
            await tx.user.update({ where: { id: userId }, data: { tokenBalance: tokensToGrant } });
        } else {
            await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: tokensToGrant } } });
        }
    } catch (err) {
        Logger.warn(warnMessage, { error: toError(err).message, userId });
    }
}

async function findExistingPaymentBySessionOrExternalPaymentId(sessionId: string, externalPaymentId?: string | null) {
    if (!externalPaymentId) {
        return prisma.payment.findFirst({ where: { externalSessionId: sessionId } });
    }

    return prisma.payment.findFirst({
        where: { OR: [{ externalPaymentId }, { externalSessionId: sessionId }] }
    });
}

async function recordSubscriptionInvoicePaymentIfNeeded(params: {
    invoice: NonNullable<SubscriptionDetails['latestInvoice']>;
    paymentId?: string | null;
    sessionId: string;
    userId: string;
    dbSubscriptionId: string;
    defaultPlanPriceCents: number;
    couponCode: string | null;
    subscriptionPaymentBase: SubscriptionPaymentBase;
    tokensToGrant: number;
    planSupportsOrganizations: boolean;
    organizationContext: OrganizationPlanContext | null;
    shouldResetTokensOnRenewal: boolean;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<void> {
    const resolvedAmountCents = params.invoice.total ?? params.defaultPlanPriceCents;
    const resolvedSubtotalCents = params.invoice.subtotal ?? params.defaultPlanPriceCents;
    const resolvedDiscountCents = params.invoice.amountDiscount ?? 0;

    try {
        const lookupId = params.paymentId || params.invoice.paymentIntentId;
        const existing = lookupId
            ? await prisma.payment.findUnique({ where: { externalPaymentId: lookupId } })
            : await prisma.payment.findFirst({ where: { externalSessionId: params.sessionId } });

        if (!existing) {
            await prisma.$transaction(async (tx) => {
                await tx.payment.create({
                    data: buildSubscriptionPaymentCreateInput({
                        ...params.subscriptionPaymentBase,
                        amountCents: resolvedAmountCents,
                        subtotalCents: resolvedSubtotalCents,
                        discountCents: resolvedDiscountCents,
                        couponCode: params.couponCode,
                        externalPaymentId: params.paymentId || params.invoice.paymentIntentId,
                        externalSessionId: params.sessionId,
                        providerKey: params.providerKey,
                        mergeIdMap: params.mergeIdMap,
                    })
                });

                await incrementUserPaymentsCount(tx, params.userId);

                await applySubscriptionCheckoutTokens(
                    tx,
                    params.userId,
                    params.tokensToGrant,
                    params.planSupportsOrganizations,
                    params.organizationContext,
                    params.shouldResetTokensOnRenewal,
                    'Failed to add tokens from subscription payment'
                );
            });
        }

        await updateSubscriptionLastPaymentAmount(params.dbSubscriptionId);
    } catch (err) {
        Logger.error('Failed to create payment record', { error: toError(err).message });
    }
}

async function recordSubscriptionSessionFallbackPaymentIfNeeded(params: {
    paymentId: string;
    sessionId: string;
    userId: string;
    dbSubscriptionId: string;
    defaultPlanPriceCents: number;
    sessionAmountTotal?: number | null;
    sessionAmountSubtotal?: number | null;
    checkoutCouponCode: string | null;
    subscriptionPaymentBase: SubscriptionPaymentBase;
    tokensToGrant: number;
    planSupportsOrganizations: boolean;
    organizationContext: OrganizationPlanContext | null;
    shouldResetTokensOnRenewal: boolean;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<void> {
    const resolvedAmountCents = params.sessionAmountTotal ?? params.defaultPlanPriceCents;
    const resolvedSubtotalCents = params.sessionAmountSubtotal ?? params.defaultPlanPriceCents;
    const resolvedDiscountCents = params.sessionAmountSubtotal && params.sessionAmountTotal
        ? Math.max(0, params.sessionAmountSubtotal - params.sessionAmountTotal)
        : 0;

    try {
        const existing = await findExistingPaymentBySessionOrExternalPaymentId(params.sessionId, params.paymentId);

        if (!existing) {
            await prisma.$transaction(async (tx) => {
                await tx.payment.create({
                    data: buildSubscriptionPaymentCreateInput({
                        ...params.subscriptionPaymentBase,
                        amountCents: resolvedAmountCents,
                        subtotalCents: resolvedSubtotalCents,
                        discountCents: resolvedDiscountCents,
                        couponCode: params.checkoutCouponCode,
                        externalPaymentId: params.paymentId,
                        externalSessionId: params.sessionId,
                        providerKey: params.providerKey,
                        mergeIdMap: params.mergeIdMap,
                    })
                });

                await incrementUserPaymentsCount(tx, params.userId);

                await applySubscriptionCheckoutTokens(
                    tx,
                    params.userId,
                    params.tokensToGrant,
                    params.planSupportsOrganizations,
                    params.organizationContext,
                    params.shouldResetTokensOnRenewal,
                    'Failed to add tokens from subscription payment (fallback)'
                );
            });
        }

        await updateSubscriptionLastPaymentAmount(params.dbSubscriptionId);
    } catch (err) {
        Logger.error('Failed to create payment record (fallback)', { error: toError(err).message });
    }
}

async function recordRazorpaySubscriptionFallbackPaymentIfNeeded(params: {
    paymentId?: string | null;
    sessionId: string;
    userId: string;
    dbSubscriptionId: string;
    defaultPlanPriceCents: number;
    checkoutCouponCode: string | null;
    subscriptionPaymentBase: SubscriptionPaymentBase;
    tokensToGrant: number;
    planSupportsOrganizations: boolean;
    organizationContext: OrganizationPlanContext | null;
    shouldResetTokensOnRenewal: boolean;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<void> {
    const resolvedAmountCents = params.defaultPlanPriceCents;
    const resolvedSubtotalCents = params.defaultPlanPriceCents;
    const resolvedDiscountCents = 0;
    const fallbackPaymentId = (params.paymentId && params.paymentId.startsWith('pay_')) ? params.paymentId : null;

    try {
        const existing = await findExistingPaymentBySessionOrExternalPaymentId(params.sessionId, fallbackPaymentId);

        if (!existing) {
            await prisma.$transaction(async (tx) => {
                await tx.payment.create({
                    data: buildSubscriptionPaymentCreateInput({
                        ...params.subscriptionPaymentBase,
                        amountCents: resolvedAmountCents,
                        subtotalCents: resolvedSubtotalCents,
                        discountCents: resolvedDiscountCents,
                        couponCode: params.checkoutCouponCode,
                        externalPaymentId: fallbackPaymentId,
                        externalSessionId: params.sessionId,
                        includeExternalPaymentIdMapWhenMissingPaymentId: false,
                        providerKey: params.providerKey,
                        mergeIdMap: params.mergeIdMap,
                    })
                });

                await incrementUserPaymentsCount(tx, params.userId);

                await applySubscriptionCheckoutTokens(
                    tx,
                    params.userId,
                    params.tokensToGrant,
                    params.planSupportsOrganizations,
                    params.organizationContext,
                    params.shouldResetTokensOnRenewal,
                    'Failed to add tokens from Razorpay subscription fallback payment'
                );
            });
        }

        await updateSubscriptionLastPaymentAmount(params.dbSubscriptionId);
    } catch (err) {
        Logger.error('Failed to create Razorpay fallback payment record', { error: toError(err).message });
    }
}

export async function recordSubscriptionCheckoutPaymentIfNeeded(params: RecordSubscriptionCheckoutPaymentParams): Promise<void> {
    if (params.subscription.latestInvoice) {
        const couponCode = params.subscription.metadata?.couponCode || params.checkoutCouponCode;
        await recordSubscriptionInvoicePaymentIfNeeded({
            invoice: params.subscription.latestInvoice,
            paymentId: params.paymentId,
            sessionId: params.sessionId,
            userId: params.userId,
            dbSubscriptionId: params.dbSubscriptionId,
            defaultPlanPriceCents: params.defaultPlanPriceCents,
            couponCode,
            subscriptionPaymentBase: params.subscriptionPaymentBase,
            tokensToGrant: params.tokensToGrant,
            planSupportsOrganizations: params.planSupportsOrganizations,
            organizationContext: params.organizationContext,
            shouldResetTokensOnRenewal: params.shouldResetTokensOnRenewal,
            providerKey: params.providerKey,
            mergeIdMap: params.mergeIdMap,
        });
        return;
    }

    if (params.paymentId && params.sessionAmountTotal) {
        await recordSubscriptionSessionFallbackPaymentIfNeeded({
            paymentId: params.paymentId,
            sessionId: params.sessionId,
            userId: params.userId,
            dbSubscriptionId: params.dbSubscriptionId,
            defaultPlanPriceCents: params.defaultPlanPriceCents,
            sessionAmountTotal: params.sessionAmountTotal,
            sessionAmountSubtotal: params.sessionAmountSubtotal,
            checkoutCouponCode: params.checkoutCouponCode,
            subscriptionPaymentBase: params.subscriptionPaymentBase,
            tokensToGrant: params.tokensToGrant,
            planSupportsOrganizations: params.planSupportsOrganizations,
            organizationContext: params.organizationContext,
            shouldResetTokensOnRenewal: params.shouldResetTokensOnRenewal,
            providerKey: params.providerKey,
            mergeIdMap: params.mergeIdMap,
        });
        return;
    }

    if (params.providerKey === 'razorpay' && params.desiredStatus === 'ACTIVE') {
        await recordRazorpaySubscriptionFallbackPaymentIfNeeded({
            paymentId: params.paymentId,
            sessionId: params.sessionId,
            userId: params.userId,
            dbSubscriptionId: params.dbSubscriptionId,
            defaultPlanPriceCents: params.defaultPlanPriceCents,
            checkoutCouponCode: params.checkoutCouponCode,
            subscriptionPaymentBase: params.subscriptionPaymentBase,
            tokensToGrant: params.tokensToGrant,
            planSupportsOrganizations: params.planSupportsOrganizations,
            organizationContext: params.organizationContext,
            shouldResetTokensOnRenewal: params.shouldResetTokensOnRenewal,
            providerKey: params.providerKey,
            mergeIdMap: params.mergeIdMap,
        });
    }
}