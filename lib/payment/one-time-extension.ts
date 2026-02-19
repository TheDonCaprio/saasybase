import { prisma } from '../prisma';
import { Logger } from '../logger';
import { shouldClearPaidTokensOnRenewal } from '../paidTokens';
import { creditOrganizationSharedTokens } from '../teams';
import { updateSubscriptionLastPaymentAmount } from '../payments';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { getDefaultTokenLabel } from '../settings';
import { toError } from '../runtime-guards';
import type { Prisma, Plan } from '@prisma/client';
import type { OrganizationPlanContext } from '../user-plan-context';
import type { StandardizedCheckoutSession } from './types';

type LatestActiveOneTimeSub = {
    id: string;
    expiresAt: Date;
    plan: {
        autoRenew: boolean;
    } | null;
};

export async function processOneTimeNonRecurringExtension(params: {
    latestActive: LatestActiveOneTimeSub;
    userId: string;
    planToUse: Plan;
    periodMs: number;
    organizationContext: OrganizationPlanContext | null;
    resolvedAmountCents: number;
    resolvedSubtotalCents: number;
    resolvedDiscountCents: number;
    couponCode: string | null;
    session: StandardizedCheckoutSession;
    finalPaymentIntent?: string;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
}): Promise<void> {
    const newExpires = new Date(params.latestActive.expiresAt.getTime() + params.periodMs);
    const shouldResetTokensOnOneTimeRenewal = await shouldClearPaidTokensOnRenewal(false);

    await prisma.$transaction(async (tx) => {
        await tx.subscription.update({ where: { id: params.latestActive.id }, data: { expiresAt: newExpires } });
        await tx.payment.create({
            data: {
                userId: params.userId,
                subscriptionId: null,
                planId: params.planToUse.id,
                amountCents: params.resolvedAmountCents,
                subtotalCents: params.resolvedSubtotalCents,
                discountCents: params.resolvedDiscountCents,
                couponCode: params.couponCode || null,
                status: 'SUCCEEDED',
                externalSessionId: params.session.id,
                externalPaymentId: params.finalPaymentIntent,
                externalPaymentIds: params.mergeIdMap(null, params.providerKey, params.finalPaymentIntent) ?? undefined,
                externalSessionIds: params.mergeIdMap(null, params.providerKey, params.session.id) ?? undefined,
                paymentProvider: params.providerKey
            } satisfies Prisma.PaymentUncheckedCreateInput
        });
        await tx.user.update({ where: { id: params.userId }, data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput });

        if (params.planToUse.tokenLimit) {
            if (params.organizationContext && params.organizationContext.role === 'OWNER') {
                if (shouldResetTokensOnOneTimeRenewal) {
                    await tx.organization.update({
                        where: { id: params.organizationContext.organization.id },
                        data: { tokenBalance: params.planToUse.tokenLimit },
                    });
                } else {
                    await creditOrganizationSharedTokens({
                        organizationId: params.organizationContext.organization.id,
                        amount: params.planToUse.tokenLimit,
                        tx
                    });
                }
            } else if (shouldResetTokensOnOneTimeRenewal) {
                await tx.user.update({
                    where: { id: params.userId },
                    data: { tokenBalance: params.planToUse.tokenLimit }
                });
            } else {
                await tx.user.update({
                    where: { id: params.userId },
                    data: { tokenBalance: { increment: params.planToUse.tokenLimit } }
                });
            }
        }
    });

    await updateSubscriptionLastPaymentAmount(params.latestActive.id);

    try {
        const planTokenName = typeof params.planToUse.tokenName === 'string' ? params.planToUse.tokenName.trim() : '';
        const tokenName = planTokenName || await getDefaultTokenLabel();

        const notificationTitle = 'Subscription Extended';
        const notificationMessage = `Your subscription has been extended by ${params.planToUse.durationHours} hours.`;

        await sendBillingNotification({
            userId: params.userId,
            title: notificationTitle,
            message: notificationMessage,
            templateKey: 'subscription_extended',
            variables: {
                planName: params.planToUse.name,
                amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                newExpiry: newExpires.toLocaleDateString(),
                tokensAdded: params.planToUse.tokenLimit ? String(params.planToUse.tokenLimit) : '0',
                tokenName,
                transactionId: (params.finalPaymentIntent || params.session.id) as string
            }
        });

        await sendAdminNotificationEmail({
            userId: params.userId,
            title: 'Subscription Extended',
            message: `User ${params.userId} extended subscription with ${params.planToUse.name}.`,
            alertType: 'renewal',
            templateKey: 'admin_notification',
            variables: {
                planName: params.planToUse.name,
                amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                newExpiry: newExpires.toLocaleString(),
                transactionId: (params.finalPaymentIntent || params.session.id) as string
            }
        });
    } catch (err) {
        Logger.warn('Failed to send subscription extension notifications', { error: toError(err).message });
    }
}