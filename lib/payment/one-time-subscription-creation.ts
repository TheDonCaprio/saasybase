import { prisma } from '../prisma';
import { Logger } from '../logger';
import { creditOrganizationSharedTokens } from '../teams';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { getDefaultTokenLabel } from '../settings';
import { toError } from '../runtime-guards';
import type { Prisma, Plan } from '@prisma/client';
import type { StandardizedCheckoutSession } from './types';
import type { OrganizationPlanContext } from '../user-plan-context';

export async function processOneTimeSubscriptionCreation(params: {
    userId: string;
    planToUse: Plan;
    now: Date;
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
    try {
        const newExpires = new Date(params.now.getTime() + params.periodMs);
        await prisma.$transaction(async (tx) => {
            const sub = await tx.subscription.create({
                data: {
                    userId: params.userId,
                    planId: params.planToUse.id,
                    status: 'ACTIVE',
                    startedAt: params.now,
                    expiresAt: newExpires,
                    paymentProvider: params.providerKey,
                }
            });

            await tx.payment.create({
                data: {
                    userId: params.userId,
                    subscriptionId: sub.id,
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
                    paymentProvider: params.providerKey,
                } satisfies Prisma.PaymentUncheckedCreateInput
            });

            await tx.user.update({ where: { id: params.userId }, data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput });

            if (params.planToUse.tokenLimit) {
                if (params.organizationContext && params.organizationContext.role === 'OWNER') {
                    await creditOrganizationSharedTokens({ organizationId: params.organizationContext.organization.id, amount: params.planToUse.tokenLimit, tx });
                } else {
                    await tx.user.update({ where: { id: params.userId }, data: { tokenBalance: { increment: params.planToUse.tokenLimit } } });
                }
            }
        });

        Logger.info('Created new one-time subscription and payment', { userId: params.userId, planId: params.planToUse.id, sessionId: params.session.id });

        try {
            const planTokenName = typeof params.planToUse.tokenName === 'string' ? params.planToUse.tokenName.trim() : '';
            const tokenName = planTokenName || await getDefaultTokenLabel();

            await sendBillingNotification({
                userId: params.userId,
                title: 'Subscription Active',
                message: `Payment succeeded for ${params.planToUse.name}. Your subscription is active.`,
                templateKey: 'subscription_activated',
                variables: {
                    planName: params.planToUse.name,
                    amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                    startedAt: params.now.toLocaleDateString(),
                    expiresAt: newExpires.toLocaleDateString(),
                    tokensAdded: params.planToUse.tokenLimit ? String(params.planToUse.tokenLimit) : '0',
                    tokenName
                }
            });

            const isRecurringFallback = params.session.metadata?.checkoutMode === 'subscription' || params.planToUse.autoRenew === true;
            await sendAdminNotificationEmail({
                userId: params.userId,
                title: isRecurringFallback ? 'New subscription purchase' : 'New one-time subscription purchase',
                alertType: 'new_purchase',
                message: isRecurringFallback
                    ? `User ${params.userId} purchased recurring ${params.planToUse.name}.`
                    : `User ${params.userId} purchased ${params.planToUse.name}.`,
                templateKey: 'admin_notification',
                variables: {
                    planName: params.planToUse.name,
                    amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                    transactionId: (params.finalPaymentIntent || params.session.id) as string,
                    startedAt: params.now.toLocaleString()
                }
            });
        } catch (err) {
            Logger.warn('Failed to send one-time purchase notifications', { error: toError(err).message });
        }
    } catch (err) {
        Logger.error('Failed to create one-time subscription/payment', { error: toError(err).message, sessionId: params.session.id });
    }
}