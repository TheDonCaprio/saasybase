import { prisma } from '../prisma';
import { Logger } from '../logger';
import { creditOrganizationSharedTokens } from '../teams';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { getDefaultTokenLabel } from '../settings';
import { toError } from '../runtime-guards';
import type { Prisma, Plan } from '@prisma/client';
import type { StandardizedCheckoutSession } from './types';
import type { OrganizationPlanContext } from '../user-plan-context';

export async function processOneTimeRecurringTopup(params: {
    userId: string;
    planToUse: Plan;
    resolvedAmountCents: number;
    resolvedSubtotalCents: number;
    resolvedDiscountCents: number;
    couponCode: string | null;
    session: StandardizedCheckoutSession;
    finalPaymentIntent?: string;
    providerKey: string;
    mergeIdMap: (existing: unknown, key: string, value?: string | null) => string | null;
    resolveOrganizationContext: (userId: string, activeOrganizationId?: string | null) => Promise<OrganizationPlanContext | null>;
}): Promise<void> {
    const tokensAdded = params.planToUse.tokenLimit || 0;
    const isTeamPlan = params.planToUse.supportsOrganizations === true;
    const isPlanSwitchFallback = Boolean(params.session.metadata?.prorationFallbackReason);
    const activeOrganizationId = params.session.metadata?.activeOrganizationId
        || params.session.metadata?.organizationId
        || params.session.metadata?.activeProviderOrganizationId
        || params.session.metadata?.activeClerkOrgId
        || params.session.metadata?.clerkOrgId
        || params.session.metadata?.orgId
        || null;
    const organizationContext = tokensAdded > 0
        ? await params.resolveOrganizationContext(params.userId, activeOrganizationId)
        : null;
    const workspaceTopupContext = isTeamPlan && organizationContext && organizationContext.role === 'OWNER'
        ? organizationContext
        : null;

    let topupDestination: 'user_balance' | 'workspace_shared' | null = null;
    let topupWorkspaceId: string | null = null;

    await prisma.$transaction(async (tx) => {
        const existingPayment = params.finalPaymentIntent
            ? await tx.payment.findUnique({ where: { externalPaymentId: params.finalPaymentIntent } })
            : await tx.payment.findUnique({ where: { externalSessionId: params.session.id } });

        let paymentCreated = false;

        if (!existingPayment) {
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
            paymentCreated = true;
        }

        if (paymentCreated && tokensAdded > 0) {
            const userUpdate: Prisma.UserUpdateInput = { paymentsCount: { increment: 1 } };
            if (!workspaceTopupContext && !isTeamPlan) {
                userUpdate.tokenBalance = { increment: tokensAdded };
                topupDestination = 'user_balance';
            } else if (!workspaceTopupContext && isTeamPlan) {
                Logger.info('Deferred team token allocation until workspace provisioning (one-time top-up)', {
                    userId: params.userId,
                    planId: params.planToUse.id,
                    tokensDeferred: tokensAdded,
                });
            }
            await tx.user.update({ where: { id: params.userId }, data: userUpdate });

            if (workspaceTopupContext) {
                topupWorkspaceId = workspaceTopupContext.organization.id;
                await creditOrganizationSharedTokens({
                    organizationId: workspaceTopupContext.organization.id,
                    amount: tokensAdded,
                    tx,
                });
                topupDestination = 'workspace_shared';
            }
        }
    });

    Logger.info('Token top-up completed', {
        userId: params.userId,
        tokensAdded,
        planName: params.planToUse.name,
        destination: topupDestination,
        workspaceId: topupWorkspaceId ?? undefined,
    });

    try {
        if (isPlanSwitchFallback) {
            Logger.info('Skipping token top-up notifications for plan switch fallback', {
                userId: params.userId,
                sessionId: params.session.id,
                reason: params.session.metadata?.prorationFallbackReason,
            });
            return;
        }

        const planTokenName = typeof params.planToUse.tokenName === 'string' ? params.planToUse.tokenName.trim() : '';
        const tokenName = planTokenName || await getDefaultTokenLabel();
        const tokenLabel = tokenName.charAt(0).toUpperCase() + tokenName.slice(1);
        const recipientLabel = workspaceTopupContext
            ? `${workspaceTopupContext.organization.name} workspace pool`
            : 'your account';

        const notificationBody = workspaceTopupContext
            ? `${tokensAdded} ${tokenName} added to your workspace pool.`
            : `${tokensAdded} ${tokenName} added to your account.`;

        await sendBillingNotification({
            userId: params.userId,
            title: `${tokenLabel} Added`,
            message: notificationBody,
            templateKey: 'token_topup',
            variables: {
                planName: params.planToUse.name,
                tokenAmount: String(tokensAdded),
                tokenName,
                amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                transactionId: (params.finalPaymentIntent || params.session.id) as string,
                destination: recipientLabel,
            },
        });

        const adminMessage = workspaceTopupContext
            ? `User ${params.userId} purchased ${tokensAdded} ${tokenName} for workspace ${workspaceTopupContext.organization.name}.`
            : `User ${params.userId} purchased ${tokensAdded} ${tokenName} from ${params.planToUse.name}.`;

        await sendAdminNotificationEmail({
            userId: params.userId,
            title: `${tokenLabel} top-up purchase`,
            message: adminMessage,
            alertType: 'new_purchase',
            templateKey: 'admin_notification',
            variables: {
                planName: params.planToUse.name,
                amount: `$${(params.resolvedAmountCents / 100).toFixed(2)}`,
                transactionId: (params.finalPaymentIntent || params.session.id) as string,
                tokenAmount: String(tokensAdded),
                tokenName,
                destination: recipientLabel,
            },
        });
    } catch (err) {
        Logger.warn('Failed to send token top-up notifications', { error: toError(err).message });
    }
}