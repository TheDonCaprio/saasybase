import { Logger } from '../logger';
import { sendBillingNotification, sendAdminNotificationEmail } from '../notifications';
import { createBillingNotification } from '../notifications';
import { getDefaultTokenLabel } from '../settings';
import { toError } from '../runtime-guards';
import { sendEmail, shouldEmailUser, getSiteName } from '../email';
import { prisma } from '../prisma';
import { activatePendingSubscriptions } from '../auth';
import type { Plan } from '@/lib/prisma-client';
import type { SubscriptionDetails, StandardizedCheckoutSession } from './types';

type SubscriptionForActivationNotification = {
    id: string;
    userId: string;
    startedAt: Date;
    expiresAt: Date;
    plan: {
        name: string;
        tokenName: string | null;
        tokenLimit: number | null;
    };
};

type SubscriptionUpdatedSideEffectsSub = {
    id: string;
    userId: string;
    status: string;
    plan: {
        id: string;
        priceCents: number;
    };
    startedAt: Date;
    expiresAt: Date;
};

export function resolveSubscriptionUpdateActivationChange(params: {
    previousStatus: string;
    effectiveStatus: string;
    isNewlyCreated: boolean;
    previousPlan: { id: string; priceCents: number } | null;
    currentPlan: { id: string; priceCents: number };
}): {
    shouldNotify: boolean;
    changeType: 'upgrade' | 'downgrade' | null;
} {
    const transitionedToActive = params.previousStatus !== 'ACTIVE' && params.effectiveStatus === 'ACTIVE';
    if (!transitionedToActive || params.isNewlyCreated) {
        return { shouldNotify: false, changeType: null };
    }

    if (!params.previousPlan || params.previousPlan.id === params.currentPlan.id) {
        return { shouldNotify: true, changeType: null };
    }

    if (params.previousPlan.priceCents < params.currentPlan.priceCents) {
        return { shouldNotify: true, changeType: 'upgrade' };
    }

    if (params.previousPlan.priceCents > params.currentPlan.priceCents) {
        return { shouldNotify: true, changeType: 'downgrade' };
    }

    return { shouldNotify: true, changeType: null };
}

export async function sendActivationNotificationsFromSubscriptionUpdate(
    dbSub: SubscriptionForActivationNotification,
    providerSubscriptionId: string,
    changeType: 'upgrade' | 'downgrade' | null,
    deps: {
        findRecentNotificationByTitles: (
            userId: string,
            titles: string[],
            lookbackMs: number
        ) => Promise<{ id: string; title: string } | null>;
    }
): Promise<void> {
    try {
        const recentBillingNotification = await deps.findRecentNotificationByTitles(
            dbSub.userId,
            [
                'Subscription Active',
                'Subscription Activated',
                'Subscription Upgraded',
                'Subscription Changed',
            ],
            3 * 60 * 1000
        );

        if (recentBillingNotification) {
            Logger.info('Skipping activation notification from subscription.updated (recent notification already exists)', {
                subscriptionId: dbSub.id,
                providerSubscriptionId,
                userId: dbSub.userId,
                existingNotificationId: recentBillingNotification.id,
                existingTitle: recentBillingNotification.title,
            });
            return;
        }

        const resolvedChangeType = changeType;

        const planTokenName = typeof dbSub.plan?.tokenName === 'string' ? dbSub.plan.tokenName.trim() : '';
        const tokenName = planTokenName || await getDefaultTokenLabel();
        const startedAt = dbSub.startedAt
            ? dbSub.startedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const expiresAt = dbSub.expiresAt
            ? dbSub.expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : '';

        const templateKey = resolvedChangeType === 'upgrade'
            ? 'subscription_upgraded_recurring'
            : resolvedChangeType === 'downgrade'
                ? 'subscription_downgraded'
                : 'subscription_activated';
        const title = resolvedChangeType === 'upgrade'
            ? 'Subscription Upgraded'
            : resolvedChangeType === 'downgrade'
                ? 'Subscription Changed'
                : 'Subscription Active';
        const message = resolvedChangeType === 'upgrade'
            ? `Your subscription has been upgraded to ${dbSub.plan.name}.`
            : resolvedChangeType === 'downgrade'
                ? `Your subscription has been changed to ${dbSub.plan.name}.`
                : `Your subscription to ${dbSub.plan.name} is now active.`;

        await sendBillingNotification({
            userId: dbSub.userId,
            title,
            message,
            templateKey,
            variables: {
                planName: dbSub.plan.name,
                tokenBalance: String(dbSub.plan.tokenLimit || 0),
                tokenName,
                startedAt,
                expiresAt,
                amount: '—',
                transactionId: providerSubscriptionId,
            },
        });

        await sendAdminNotificationEmail({
            userId: dbSub.userId,
            title: resolvedChangeType === 'upgrade'
                ? 'Subscription upgraded'
                : resolvedChangeType === 'downgrade'
                    ? 'Subscription downgraded'
                    : 'Subscription activated',
            alertType: resolvedChangeType === 'upgrade' ? 'upgrade' : resolvedChangeType === 'downgrade' ? 'downgrade' : 'new_purchase',
            message: resolvedChangeType === 'upgrade'
                ? `User ${dbSub.userId} upgraded to ${dbSub.plan.name}. Subscription: ${dbSub.id}`
                : resolvedChangeType === 'downgrade'
                    ? `User ${dbSub.userId} downgraded to ${dbSub.plan.name}. Subscription: ${dbSub.id}`
                    : `User ${dbSub.userId} subscription ${providerSubscriptionId} is now active on ${dbSub.plan.name}.`,
            templateKey: 'admin_notification',
            variables: {
                planName: dbSub.plan.name,
                startedAt: new Date().toLocaleString(),
                transactionId: providerSubscriptionId,
            },
        });

        Logger.info('Sent activation notifications from subscription.updated transition', {
            subscriptionId: dbSub.id,
            providerSubscriptionId,
            userId: dbSub.userId,
        });
    } catch (err) {
        Logger.warn('Failed to send activation notifications from subscription.updated transition', {
            subscriptionId: dbSub.id,
            providerSubscriptionId,
            userId: dbSub.userId,
            error: toError(err).message,
        });
    }
}

export async function sendSubscriptionCheckoutNotifications(params: {
    userId: string;
    plan: Plan;
    status: string;
    isUpgrade: boolean;
    isDowngrade: boolean;
    subscription: SubscriptionDetails;
    session: StandardizedCheckoutSession;
}): Promise<void> {
    Logger.info('sendSubscriptionNotifications called', {
        userId: params.userId,
        planName: params.plan.name,
        status: params.status,
        isUpgrade: params.isUpgrade,
        isDowngrade: params.isDowngrade,
    });

    try {
        if (params.status === 'ACTIVE') {
            let templateKey = 'subscription_activated';
            let notificationTitle = 'Subscription Active';
            let notificationMessage = `Payment succeeded for ${params.plan.name}. Your subscription is active.`;

            if (params.isUpgrade) {
                templateKey = 'subscription_upgraded_recurring';
                notificationTitle = 'Subscription Upgraded';
                notificationMessage = `You've upgraded to ${params.plan.name}!`;
            } else if (params.isDowngrade) {
                templateKey = 'subscription_downgraded';
                notificationTitle = 'Subscription Changed';
                notificationMessage = `Your subscription has been changed to ${params.plan.name}.`;
            }

            const fallbackCustomerEmail = params.session.userEmail;

            Logger.info('Sending user billing notification', {
                userId: params.userId,
                templateKey,
                title: notificationTitle,
            });

            const userNotifResult = await sendBillingNotification({
                userId: params.userId,
                title: notificationTitle,
                message: notificationMessage,
                templateKey,
                fallbackEmail: fallbackCustomerEmail ?? undefined,
                variables: {
                    planName: params.plan.name,
                    amount: `$${(params.plan.priceCents / 100).toFixed(2)}`,
                    startedAt: params.subscription.currentPeriodStart.toLocaleDateString(),
                    expiresAt: params.subscription.currentPeriodEnd.toLocaleDateString(),
                    transactionId: params.subscription.latestInvoice?.paymentIntentId || params.session.paymentIntentId || params.session.id,
                },
            });

            Logger.info('User billing notification result', {
                userId: params.userId,
                notificationCreated: userNotifResult.notificationCreated,
                emailSent: userNotifResult.emailSent,
            });
        } else if (params.status === 'PENDING') {
            await createBillingNotification(
                params.userId,
                `Payment succeeded for ${params.plan.name}. Your subscription will activate when your current plan expires.`
            );
            const emailOk = await shouldEmailUser(params.userId);
            if (emailOk) {
                const user = await prisma.user.findUnique({
                    where: { id: params.userId },
                    select: { email: true, name: true },
                });
                const siteName = await getSiteName();
                if (user?.email) {
                    const result = await sendEmail({
                        to: user.email,
                        userId: params.userId,
                        subject: `${siteName}: Subscription scheduled`,
                        text: `Your payment for ${params.plan.name} was successful. Your new subscription will automatically activate when your current subscription expires.`,
                    });

                    if (!result.success) {
                        Logger.warn('Subscription scheduled email delivery failed', {
                            userId: params.userId,
                            email: user.email,
                            error: result.error,
                        });
                    }
                }
            }
        }

        const transactionId = params.subscription.latestInvoice?.paymentIntentId ?? params.subscription.id;
        const formattedAmount = `$${(params.plan.priceCents / 100).toFixed(2)}`;

        const adminTitle = params.isUpgrade
            ? 'Subscription upgraded'
            : params.isDowngrade
                ? 'Subscription downgraded'
                : 'New subscription purchase';
        const adminMessage = params.isUpgrade
            ? `User ${params.userId} upgraded to ${params.plan.name}. Subscription: ${params.subscription.id}`
            : params.isDowngrade
                ? `User ${params.userId} downgraded to ${params.plan.name}. Subscription: ${params.subscription.id}`
                : `User ${params.userId} purchased recurring ${params.plan.name}. Subscription: ${params.subscription.id}`;

        Logger.info('Sending admin notification email', {
            userId: params.userId,
            planName: params.plan.name,
            amount: formattedAmount,
            change: params.isUpgrade ? 'upgrade' : params.isDowngrade ? 'downgrade' : 'new',
        });

        await sendAdminNotificationEmail({
            userId: params.userId,
            title: adminTitle,
            message: adminMessage,
            alertType: params.isUpgrade ? 'upgrade' : params.isDowngrade ? 'downgrade' : 'new_purchase',
            templateKey: 'admin_notification',
            variables: {
                planName: params.plan.name,
                amount: formattedAmount,
                transactionId,
                startedAt: params.subscription.currentPeriodStart.toLocaleString(),
            },
        });

        Logger.info('Admin notification email sent successfully', {
            userId: params.userId,
            planName: params.plan.name,
        });
    } catch (err) {
        Logger.error('Failed to send billing notifications', {
            userId: params.userId,
            planName: params.plan.name,
            error: toError(err).message,
            stack: toError(err).stack,
        });
    }
}

export async function runPostSubscriptionCheckoutSideEffects(params: {
    userId: string;
    plan: Plan;
    desiredStatus: 'ACTIVE' | 'PENDING';
    isUpgrade: boolean;
    isDowngrade: boolean;
    subscription: SubscriptionDetails;
    session: StandardizedCheckoutSession;
    syncOrganizationEligibilityForUser: (userId: string) => Promise<unknown>;
}): Promise<void> {
    await params.syncOrganizationEligibilityForUser(params.userId);

    try {
        await activatePendingSubscriptions(params.userId, {
            sendNotifications: true,
            source: 'payment:webhook:subscription_checkout',
        });
    } catch (err) {
        Logger.warn('Failed to activate pending subscriptions after subscription checkout', {
            userId: params.userId,
            error: toError(err).message,
        });
    }

    await sendSubscriptionCheckoutNotifications({
        userId: params.userId,
        plan: params.plan,
        status: params.desiredStatus,
        isUpgrade: params.isUpgrade,
        isDowngrade: params.isDowngrade,
        subscription: params.subscription,
        session: params.session,
    });
}

export async function processSubscriptionUpdatedPostMutationSideEffects<TSub extends SubscriptionUpdatedSideEffectsSub>(params: {
    dbSub: TSub;
    subscriptionId: string;
    status: string;
    providerKey: string;
    effectiveStatus: string;
    normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
    isNewlyCreated: boolean;
    previousStatus: string;
    previousPlan: { id: string; priceCents: number } | null;
}, deps: {
    resolveSubscriptionUpdateActivationChange: (params: {
        previousStatus: string;
        effectiveStatus: string;
        isNewlyCreated: boolean;
        previousPlan: { id: string; priceCents: number } | null;
        currentPlan: { id: string; priceCents: number };
    }) => {
        shouldNotify: boolean;
        changeType: 'upgrade' | 'downgrade' | null;
    };
    sendActivationNotificationsFromSubscriptionUpdate: (
        dbSub: TSub,
        providerSubscriptionId: string,
        changeType: 'upgrade' | 'downgrade' | null,
        deps: {
            findRecentNotificationByTitles: (
                userId: string,
                titles: string[],
                lookbackMs: number
            ) => Promise<{ id: string; title: string } | null>;
        }
    ) => Promise<void>;
    findRecentNotificationByTitles: (
        userId: string,
        titles: string[],
        lookbackMs: number
    ) => Promise<{ id: string; title: string } | null>;
    ensureRazorpayFallbackSubscriptionPaymentOnUpdate: (
        dbSub: TSub,
        subscriptionId: string,
    ) => Promise<void>;
    processPaystackSubscriptionUpdatedPostProcessing: (params: {
        dbSub: TSub;
        effectiveStatus: string;
        providerKey: string;
        isNewlyCreated: boolean;
        subscriptionId: string;
    }) => Promise<void>;
    handleNewlyCreatedActiveSubscriptionUpdate: (
        dbSub: TSub,
        subscriptionId: string,
    ) => Promise<{ linked: boolean; demoted: boolean }>;
}): Promise<TSub> {
    let currentSub = params.dbSub;

    const { shouldNotify, changeType } = deps.resolveSubscriptionUpdateActivationChange({
        previousStatus: params.previousStatus,
        effectiveStatus: params.effectiveStatus,
        isNewlyCreated: params.isNewlyCreated,
        previousPlan: params.previousPlan,
        currentPlan: {
            id: currentSub.plan.id,
            priceCents: currentSub.plan.priceCents,
        },
    });

    if (shouldNotify) {
        await deps.sendActivationNotificationsFromSubscriptionUpdate(
            currentSub,
            params.subscriptionId,
            changeType,
            {
                findRecentNotificationByTitles: deps.findRecentNotificationByTitles,
            }
        );
    }

    if (params.effectiveStatus === 'ACTIVE' && params.providerKey === 'razorpay') {
        await deps.ensureRazorpayFallbackSubscriptionPaymentOnUpdate(currentSub, params.subscriptionId);
    }

    await deps.processPaystackSubscriptionUpdatedPostProcessing({
        dbSub: currentSub,
        effectiveStatus: params.effectiveStatus,
        providerKey: params.providerKey,
        isNewlyCreated: params.isNewlyCreated,
        subscriptionId: params.subscriptionId,
    });

    if (params.isNewlyCreated && params.normalizedStatus === 'ACTIVE') {
        const { linked, demoted } = await deps.handleNewlyCreatedActiveSubscriptionUpdate(currentSub, params.subscriptionId);
        if (!linked) {
            if (demoted) {
                currentSub = {
                    ...currentSub,
                    status: 'PENDING',
                } as TSub;
            }

            Logger.info('Skipping grantSubscriptionAccess for newly created ACTIVE subscription (no pending payment to link)', {
                subscriptionId: params.subscriptionId,
                dbSubscriptionId: currentSub.id,
                userId: currentSub.userId,
            });
        }
    }

    return currentSub;
}