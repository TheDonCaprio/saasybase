import { prisma } from '../prisma';
import { Logger } from '../logger';
import {
    StandardizedWebhookEvent,
    PaymentProvider,
    SubscriptionDetails,
    StandardizedCheckoutSession,
    StandardizedSubscription,
    StandardizedInvoice
} from './types';
import {
    createBillingNotification,
    sendBillingNotification,
    notifyExpiredSubscriptions,
    sendAdminNotificationEmail
} from '../notifications';
import { sendEmail, shouldEmailUser, getSiteName } from '../email';
import { getDefaultTokenLabel } from '../settings';
import { shouldClearPaidTokensOnRenewal } from '../paidTokens';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../organization-access';
import { getOrganizationPlanContext, OrganizationPlanContext } from '../user-plan-context';
import { PLAN_DEFINITIONS } from '../plans';
import { creditOrganizationSharedTokens, resetOrganizationSharedTokens } from '../teams';
import { updateSubscriptionLastPaymentAmount } from '../payments';
import { markRedemptionConsumed } from '../couponRedemptions';
import { toError } from '../runtime-guards';
import { activatePendingSubscriptions } from '../auth';
import {
    parseProviderIdMap,
    mergeProviderIdMap,
    mapContainsValue
} from '../utils/provider-ids';
import type { Prisma, Plan } from '@prisma/client';
import { PaymentProviderFactory } from './factory';
import { formatCurrency } from '../utils/currency';
import { getActiveCurrency } from './registry';

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;

export class PaymentService {
    private _provider: PaymentProvider;

    constructor(provider: PaymentProvider) {
        this._provider = provider;
    }

    private get providerKey(): string {
        return this._provider.name;
    }

    private parseIdMap(value: unknown): Record<string, string> {
        return parseProviderIdMap(value);
    }

    private mergeIdMap(existing: unknown, key: string, value?: string | null): string | null {
        return mergeProviderIdMap(existing, key, value);
    }

    private mapHasValue(value: unknown, target: string): boolean {
        return mapContainsValue(value, target);
    }

    private async resetOwnedOrganizationTokenPools(userId: string, organizationIds: Array<string | null | undefined>) {
        const uniqueIds = Array.from(
            new Set(
                (organizationIds || []).filter((id): id is string => typeof id === 'string' && id.length > 0)
            )
        );
        if (uniqueIds.length === 0) return;

        const owned = await prisma.organization.findMany({
            where: { id: { in: uniqueIds }, ownerUserId: userId },
            select: { id: true },
        });

        for (const org of owned) {
            await resetOrganizationSharedTokens({ organizationId: org.id });
        }
    }

    private async findPlanByPriceIdentifier(priceId: string): Promise<Plan | null> {
        const legacy = await prisma.plan.findFirst({ where: { OR: [{ externalPriceId: priceId }, { stripePriceId: priceId }] } });
        if (legacy) return legacy;

        const plans = await prisma.plan.findMany({
            where: { externalPriceIds: { not: null } },
            select: { id: true, externalPriceIds: true }
        });

        const match = plans.find(p => this.mapHasValue(p.externalPriceIds, priceId));
        if (!match) return null;
        return prisma.plan.findUnique({ where: { id: match.id } });
    }

    private async findSubscriptionByProviderId(subscriptionId: string): Promise<SubscriptionWithPlan | null> {
        const legacy = await prisma.subscription.findUnique({ where: { externalSubscriptionId: subscriptionId }, include: { plan: true } });
        if (legacy) return legacy;

        const subs = await prisma.subscription.findMany({ where: { externalSubscriptionIds: { not: null } }, include: { plan: true } });
        return subs.find(s => this.mapHasValue(s.externalSubscriptionIds, subscriptionId)) || null;
    }

    private async resolveUserByCustomerId(customerId: string): Promise<string | null> {
        const legacy = await prisma.user.findFirst({
            where: {
                OR: [
                    { externalCustomerId: customerId },
                    { stripeCustomerId: customerId }
                ]
            },
            select: { id: true }
        });
        if (legacy) return legacy.id;

        const users = await prisma.user.findMany({ where: { externalCustomerIds: { not: null } }, select: { id: true, externalCustomerIds: true } });
        for (const user of users) {
            if (this.mapHasValue(user.externalCustomerIds, customerId)) return user.id;
        }
        return null;
    }

    get provider(): PaymentProvider {
        return this._provider;
    }

    /**
     * Returns the provider instance for a specific record (payment, subscription, etc.)
     * based on its stored `paymentProvider` field. Falls back to active provider if
     * the specified provider is not configured or if paymentProvider is null.
     * 
     * Use this when performing operations on existing records (cancel, refund, etc.)
     * to ensure the operation is routed to the correct provider that originally
     * processed the transaction.
     */
    getProviderForRecord(paymentProvider: string | null | undefined): PaymentProvider {
        if (paymentProvider) {
            const provider = PaymentProviderFactory.getProviderByName(paymentProvider);
            if (provider) return provider;
            Logger.warn('Provider not found for record, falling back to active provider', {
                requestedProvider: paymentProvider,
                activeProvider: this._provider.name
            });
        }
        return this._provider;
    }

    async createPaymentIntent(opts: import('./types').CheckoutOptions) {
        return this.provider.createPaymentIntent(opts);
    }

    async createSubscriptionIntent(opts: import('./types').CheckoutOptions) {
        return this.provider.createSubscriptionIntent(opts);
    }

    private async consumeCouponRedemptionFromMetadata(metadata?: Record<string, unknown> | null) {
        const redemptionId = metadata && typeof metadata['couponRedemptionId'] === 'string' ? metadata['couponRedemptionId'] : undefined;
        if (!redemptionId) return;
        try {
            const redemption = await prisma.couponRedemption.findUnique({ where: { id: redemptionId } });
            if (!redemption) return;
            await markRedemptionConsumed(redemption);
            Logger.info('Coupon redemption consumed after checkout', { redemptionId, couponId: redemption.couponId });
        } catch (err) {
            Logger.warn('Failed to consume coupon redemption', { redemptionId, error: toError(err).message });
        }
    }

    async processWebhookEvent(event: StandardizedWebhookEvent) {
        Logger.info('Processing standardized webhook event', { type: event.type });

        try {
            switch (event.type) {
                case 'checkout.completed':
                    await this.handleCheckoutCompleted(event.payload as StandardizedCheckoutSession);
                    break;
                case 'subscription.created':
                    // Handle new subscription created (Paystack flow - fires after charge.success)
                    await this.handleSubscriptionCreated(event.payload as StandardizedSubscription);
                    break;
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated(event.payload as StandardizedSubscription);
                    break;
                case 'invoice.created':
                    // Handle invoice created (before charge) - used for cancel-at-period-end workaround
                    await this.handleInvoiceCreated(event.payload as StandardizedInvoice);
                    break;
                case 'invoice.payment_succeeded':
                    await this.handleInvoicePaid(event.payload as StandardizedInvoice);
                    break;
                case 'payment.succeeded':
                    // Handle standalone payments from Elements/PaymentIntents
                    await this.handlePaymentSucceeded(event.payload as import('./types').StandardizedPayment);
                    break;
                case 'payment.failed':
                    // Handle failed payments - notify user and update subscription status
                    await this.handlePaymentFailed(event.payload as import('./types').StandardizedPaymentFailed);
                    break;
                case 'invoice.payment_failed':
                    // Handle failed subscription invoice payments
                    await this.handleInvoicePaymentFailed(event.payload as StandardizedInvoice);
                    break;
                case 'refund.processed':
                    // Handle refunds initiated from provider dashboard
                    await this.handleRefundProcessed(event.payload as import('./types').StandardizedRefund);
                    break;
                case 'dispute.created':
                case 'dispute.updated':
                    await this.handleDispute(event.payload as import('./types').StandardizedDispute, event.type);
                    break;
                case 'invoice.upcoming':
                    await this.handleInvoiceUpcoming(event.payload as StandardizedInvoice);
                    break;
                case 'ignored':
                    // Provider-specific events that we don't need to process
                    break;
                case 'other':
                    // Some providers emit catch-all/other events; ignore quietly to avoid noise.
                    Logger.info('Ignoring provider "other" event', { type: event.type });
                    break;
                default:
                    Logger.info('Unhandled webhook type (treated as no-op)', { type: event.type });
            }
        } catch (err) {
            Logger.error('Error processing webhook event', { type: event.type, error: toError(err).message });
            throw err;
        }
    }

    private async handlePaymentSucceeded(payload: import('./types').StandardizedPayment) {
        // Check if this is a PaymentIntent from Elements
        // It should have metadata with userId and planId
        let userId = payload.userId || payload.metadata?.userId;
        const orderId = payload.metadata?.orderId;

        if (orderId) {
            try {
                const existingByOrder = await prisma.payment.findFirst({
                    where: { externalSessionId: orderId },
                    select: { id: true, externalPaymentId: true },
                });
                if (existingByOrder) {
                    if (!existingByOrder.externalPaymentId || existingByOrder.externalPaymentId !== payload.id) {
                        await prisma.payment.update({
                            where: { id: existingByOrder.id },
                            data: {
                                externalPaymentId: payload.id,
                                externalPaymentIds: this.mergeIdMap(null, this.providerKey, payload.id) ?? undefined,
                            }
                        });
                    }
                    Logger.info('Payment succeeded already recorded for order checkout', {
                        id: payload.id,
                        orderId,
                        paymentId: existingByOrder.id,
                    });
                    return;
                }
            } catch (err) {
                Logger.warn('Failed to resolve existing order payment on payment.succeeded', {
                    id: payload.id,
                    orderId,
                    error: toError(err).message,
                });
            }
        }

        // Fallback 1: resolve via provider customerId if present (e.g. Razorpay attaches customer_id).
        if (!userId) {
            const customerId = payload.metadata?.customerId;
            if (customerId) {
                try {
                    const resolvedByCustomer = await this.resolveUserByCustomerId(customerId);
                    if (resolvedByCustomer) {
                        userId = resolvedByCustomer;
                        Logger.info('Resolved userId from customerId on payment.succeeded', {
                            id: payload.id,
                            userId,
                            customerId,
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed to resolve userId from customerId on payment.succeeded', {
                        id: payload.id,
                        customerId,
                        error: toError(err).message,
                    });
                }
            }
        }

        // Fallback 2: resolve from a previously-recorded Payment row.
        if (!userId) {
            try {
                const existing = await prisma.payment.findUnique({
                    where: { externalPaymentId: payload.id },
                    select: { userId: true },
                });
                if (existing?.userId) {
                    userId = existing.userId;
                    Logger.info('Resolved userId from existing payment row on payment.succeeded', {
                        id: payload.id,
                        userId,
                    });
                }
            } catch {
                // ignore
            }
        }

        // Fallback 3: use correlation IDs (e.g. Razorpay paymentLinkId/subscriptionId/orderId) to pull a checkout session
        // and recover metadata/userId.
        if (!userId) {
            const maybeSessionId = payload.metadata?.paymentLinkId
                || payload.metadata?.subscriptionId
                || payload.metadata?.orderId;
            if (maybeSessionId) {
                try {
                    const details = await this.provider.getCheckoutSession(maybeSessionId);
                    const recoveredUserId = details.clientReferenceId || details.metadata?.userId;
                    if (recoveredUserId) {
                        userId = recoveredUserId;
                        Logger.info('Recovered userId via checkout session lookup on payment.succeeded', {
                            id: payload.id,
                            userId,
                            sessionId: maybeSessionId,
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed checkout session lookup on payment.succeeded', {
                        id: payload.id,
                        sessionId: maybeSessionId,
                        error: toError(err).message,
                    });
                }
            }
        }

        if (!userId) {
            Logger.info('Payment succeeded without userId in metadata, skipping auto-fulfillment', {
                id: payload.id,
                provider: this.providerKey,
                metadataKeys: payload.metadata ? Object.keys(payload.metadata).slice(0, 25) : [],
            });
            return;
        }

        Logger.info('Handling payment.succeeded for Elements', { id: payload.id, userId });

        // Construct a fake session object to reuse handleCheckoutCompleted
        const sessionId = typeof orderId === 'string' && orderId.trim().length > 0 ? orderId : payload.id;
        const session: StandardizedCheckoutSession = {
            id: sessionId, // Prefer order id for Razorpay to match checkout confirmations
            userId: userId,
            userEmail: undefined, // We might not have it easily here
            mode: 'payment', // Default to payment, subscriptions usually go through invoice.payment_succeeded
            paymentStatus: payload.status === 'succeeded' ? 'paid' : 'unpaid',
            amountTotal: payload.amount,
            currency: payload.currency,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: payload.metadata as any,
            paymentIntentId: payload.id
        };

        await this.handleCheckoutCompleted(session);
    }

    private async handleCheckoutCompleted(session: StandardizedCheckoutSession) {
        let userId = session.userId || (session.metadata?.userId);

        Logger.info('handleCheckoutCompleted called', {
            sessionId: session.id,
            userId,
            mode: session.mode,
            hasSubscription: !!session.subscriptionId
        });

        // Fallback: try to resolve user by userEmail
        if (!userId) {
            const customerId = session.customerId;
            if (customerId) {
                try {
                    const resolvedByCustomer = await this.resolveUserByCustomerId(customerId);
                    if (resolvedByCustomer) {
                        userId = resolvedByCustomer;
                        Logger.info('Resolved userId from customerId on checkout.session.completed', {
                            sessionId: session.id,
                            userId,
                            customerId,
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed to resolve user by customerId for checkout session', {
                        sessionId: session.id,
                        customerId,
                        error: toError(err).message,
                    });
                }
            }
        }

        // Fallback: try to resolve user by userEmail
        if (!userId) {
            const fallbackEmail = session.userEmail;
            if (fallbackEmail) {
                try {
                    const userByEmail = await prisma.user.findUnique({ where: { email: fallbackEmail }, select: { id: true } });
                    if (userByEmail) {
                        userId = userByEmail.id;
                        Logger.info('Resolved userId from customer email on checkout.session.completed', { sessionId: session.id, userId, email: fallbackEmail });
                    }
                } catch (err) {
                    Logger.warn('Failed to resolve user by email for checkout session', { sessionId: session.id, email: fallbackEmail, error: toError(err).message });
                }
            }
        }

        if (!userId) {
            Logger.warn('Checkout completed without userId', { sessionId: session.id });
            return;
        }

        // Persist provider authorization details (Paystack authorization_code) for future renewal-time charges.
        if (session.authorization?.code) {
            try {
                await prisma.paymentAuthorization.upsert({
                    where: {
                        provider_authorizationCode: {
                            provider: this.providerKey,
                            authorizationCode: session.authorization.code,
                        },
                    },
                    update: {
                        userId,
                        customerId: session.customerId ?? null,
                        reusable: session.authorization.reusable === true,
                        channel: session.authorization.channel ?? null,
                        brand: session.authorization.brand ?? null,
                        bank: session.authorization.bank ?? null,
                        last4: session.authorization.last4 ?? null,
                        expMonth: session.authorization.expMonth ?? null,
                        expYear: session.authorization.expYear ?? null,
                    },
                    create: {
                        userId,
                        provider: this.providerKey,
                        customerId: session.customerId ?? null,
                        authorizationCode: session.authorization.code,
                        reusable: session.authorization.reusable === true,
                        channel: session.authorization.channel ?? null,
                        brand: session.authorization.brand ?? null,
                        bank: session.authorization.bank ?? null,
                        last4: session.authorization.last4 ?? null,
                        expMonth: session.authorization.expMonth ?? null,
                        expYear: session.authorization.expYear ?? null,
                    },
                });
            } catch (err) {
                Logger.warn('Failed to persist payment authorization from checkout', {
                    sessionId: session.id,
                    provider: this.providerKey,
                    userId,
                    error: toError(err).message,
                });
            }
        }

        // Idempotency check
        const existing = await prisma.payment.findFirst({ where: { externalSessionId: session.id } });
        if (existing) {
            Logger.info('Skipping already-processed checkout', { sessionId: session.id, existingPaymentId: existing.id });
            return;
        }
        if (session.paymentIntentId) {
            const existingByPaymentId = await prisma.payment.findFirst({
                where: { externalPaymentId: session.paymentIntentId },
                select: { id: true },
            });
            if (existingByPaymentId) {
                Logger.info('Skipping already-processed checkout (payment id match)', {
                    sessionId: session.id,
                    paymentIntentId: session.paymentIntentId,
                    existingPaymentId: existingByPaymentId.id,
                });
                return;
            }
        }

        // Resolve Organization Context
        const organizationContext = await this.resolveOrganizationContext(userId);

        if (session.mode === 'subscription' || session.subscriptionId) {
            Logger.info('Processing as subscription checkout', { sessionId: session.id, userId });
            if (session.subscriptionId) {
                await this.handleSubscriptionCheckout(session, userId, organizationContext);
            } else {
                // Paystack subscription: charge.success fires before subscription.create
                // Record the payment as pending subscription, let subscription.create event create the subscription
                Logger.info('Subscription checkout without subscriptionId (Paystack flow), recording pending payment', { 
                    sessionId: session.id, 
                    userId 
                });
                await this.handlePendingSubscriptionPayment(session, userId);
            }
        } else {
            Logger.info('Processing as one-time checkout', { sessionId: session.id, userId });
            await this.handleOneTimeCheckout(session, userId, organizationContext);
        }
    }

    /**
     * Handle Paystack subscription flow where charge.success arrives before subscription.create.
     * Records the payment with status PENDING_SUBSCRIPTION, to be linked when subscription.create fires.
     */
    private async handlePendingSubscriptionPayment(session: StandardizedCheckoutSession, userId: string) {
        const priceId = session.lineItems?.[0]?.priceId;
        if (!priceId) {
            Logger.warn('Pending subscription payment missing priceId', { sessionId: session.id, userId });
            return;
        }

        const plan = await this.findPlanByPriceIdentifier(priceId);
        if (!plan) {
            Logger.warn('Pending subscription payment: plan not found for priceId', { priceId, userId });
            return;
        }

        const finalPaymentIntent = session.transactionId || session.paymentIntentId;
        const amountCents = session.amountTotal ?? plan.priceCents;

        // If we've already recorded this payment (either via checkout.completed retry or invoice flow),
        // don't create another record.
        if (finalPaymentIntent) {
            const existingByExternalPaymentId = await prisma.payment.findUnique({
                where: { externalPaymentId: finalPaymentIntent },
                select: { id: true, status: true, subscriptionId: true }
            });
            if (existingByExternalPaymentId) {
                Logger.info('Pending subscription payment already recorded (by externalPaymentId)', {
                    sessionId: session.id,
                    userId,
                    externalPaymentId: finalPaymentIntent,
                    paymentId: existingByExternalPaymentId.id,
                    status: existingByExternalPaymentId.status,
                });
                return;
            }
        }

        // Paystack renewal edge case:
        // Paystack sometimes emits charge.success-like events for recurring charges without including
        // the subscription code. Previously we recorded these as PENDING_SUBSCRIPTION, but they could
        // never be linked because the subscription already has prior SUCCEEDED payments.
        // If the user already has an ACTIVE subscription for this plan/provider, treat this as a
        // renewal payment and record it as SUCCEEDED against that subscription.
        const existingActiveSub = await prisma.subscription.findFirst({
            where: {
                userId,
                planId: plan.id,
                paymentProvider: this.providerKey,
                status: { in: ['ACTIVE', 'EXPIRED'] },
                // Renewal webhooks can arrive late. Accept recently-expired subs so we can
                // record the renewal and resurrect access.
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

        if (existingActiveSub && finalPaymentIntent) {
            const organizationContext = await this.resolveOrganizationContext(userId);
            const resolvedOrganizationId = organizationContext?.role === 'OWNER'
                ? organizationContext.organization.id
                : (existingActiveSub.organizationId ?? null);

            const shouldResetTokensOnRenewal = await shouldClearPaidTokensOnRenewal(Boolean(plan.autoRenew));

            try {
                await prisma.$transaction(async (tx) => {
                    await tx.payment.create({
                        data: {
                            userId,
                            subscriptionId: existingActiveSub.id,
                            planId: plan.id,
                            organizationId: resolvedOrganizationId,
                            amountCents,
                            subtotalCents: amountCents,
                            discountCents: 0,
                            couponCode: session.metadata?.couponCode || null,
                            status: 'SUCCEEDED',
                            externalSessionId: session.id,
                            externalPaymentId: finalPaymentIntent,
                            externalPaymentIds: this.mergeIdMap(null, this.providerKey, finalPaymentIntent) ?? undefined,
                            externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                            paymentProvider: this.providerKey
                        }
                    });

                    await tx.user.update({
                        where: { id: userId },
                        data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput
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

                await updateSubscriptionLastPaymentAmount(existingActiveSub.id);

                // Best-effort: refresh expiry from provider so renewals extend access immediately.
                // If this was a locally EXPIRED subscription, resurrect it to ACTIVE.
                let refreshedPeriodEnd: Date | null = null;
                if (existingActiveSub.externalSubscriptionId) {
                    try {
                        const providerSub = await this.provider.getSubscription(existingActiveSub.externalSubscriptionId);
                        if (providerSub?.currentPeriodEnd) {
                            refreshedPeriodEnd = providerSub.currentPeriodEnd;
                            await prisma.subscription.update({
                                where: { id: existingActiveSub.id },
                                data: {
                                    expiresAt: providerSub.currentPeriodEnd,
                                    ...(existingActiveSub.status === 'EXPIRED' ? { status: 'ACTIVE' } : null),
                                }
                            });
                        }
                    } catch (err) {
                        Logger.warn('Unable to refresh subscription expiry after Paystack renewal-style charge', {
                            subscriptionId: existingActiveSub.externalSubscriptionId,
                            error: toError(err).message
                        });
                    }
                }

                if (existingActiveSub.status === 'EXPIRED' && !refreshedPeriodEnd) {
                    const durationHours = typeof plan.durationHours === 'number' ? plan.durationHours : 0;
                    if (durationHours > 0) {
                        const base = Math.max(existingActiveSub.expiresAt.getTime(), Date.now());
                        const nextExpiresAt = new Date(base + durationHours * 60 * 60 * 1000);
                        await prisma.subscription.update({
                            where: { id: existingActiveSub.id },
                            data: { status: 'ACTIVE', expiresAt: nextExpiresAt }
                        });
                    } else {
                        await prisma.subscription.update({
                            where: { id: existingActiveSub.id },
                            data: { status: 'ACTIVE' }
                        });
                    }
                }

                Logger.info('Recorded Paystack renewal-style charge as SUCCEEDED', {
                    sessionId: session.id,
                    userId,
                    planId: plan.id,
                    subscriptionId: existingActiveSub.id,
                    externalPaymentId: finalPaymentIntent,
                });

                await this.consumeCouponRedemptionFromMetadata(session.metadata);
                return;
            } catch (err) {
                Logger.error('Failed to record Paystack renewal-style charge', {
                    sessionId: session.id,
                    userId,
                    planId: plan.id,
                    subscriptionId: existingActiveSub.id,
                    error: toError(err).message
                });
                // Fall through to legacy pending payment behavior.
            }
        }

        try {
            await prisma.payment.create({
                data: {
                    userId,
                    subscriptionId: null, // Will be linked when subscription.create fires
                    planId: plan.id,
                    amountCents,
                    subtotalCents: amountCents,
                    discountCents: 0,
                    couponCode: session.metadata?.couponCode || null,
                    status: 'PENDING_SUBSCRIPTION', // Special status for Paystack flow
                    externalSessionId: session.id,
                    externalPaymentId: finalPaymentIntent,
                    externalPaymentIds: this.mergeIdMap(null, this.providerKey, finalPaymentIntent) ?? undefined,
                    externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                    paymentProvider: this.providerKey
                }
            });

            await prisma.user.update({
                where: { id: userId },
                data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput
            });

            Logger.info('Recorded pending subscription payment', {
                sessionId: session.id,
                userId,
                planId: plan.id,
                amountCents
            });

            // Consume coupon if present
            await this.consumeCouponRedemptionFromMetadata(session.metadata);

            // If the subscription already exists (webhook order reversed), link now
            let existingSub: SubscriptionWithPlan | null = null;
            const providerSubscriptionId = session.subscriptionId || session.metadata?.subscriptionId;

            if (providerSubscriptionId) {
                Logger.info('Attempting to link pending payment to existing subscription', {
                    sessionId: session.id,
                    subscriptionId: providerSubscriptionId,
                    userId
                });
                existingSub = await this.findSubscriptionByProviderId(providerSubscriptionId);
            }

            if (!existingSub) {
                // Fallback: find the most recent active Paystack subscription for this user/plan
                existingSub = await prisma.subscription.findFirst({
                    where: {
                        userId,
                        planId: plan.id,
                        paymentProvider: this.providerKey,
                        status: 'ACTIVE',
                        createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
                    },
                    orderBy: { createdAt: 'desc' },
                    include: { plan: true }
                });
            }

            if (existingSub) {
                await this.linkPendingPaymentToSubscription(existingSub);
            }
        } catch (err) {
            Logger.error('Failed to record pending subscription payment', { 
                sessionId: session.id, 
                userId, 
                error: toError(err).message 
            });
        }
    }

    private async handleSubscriptionCheckout(session: StandardizedCheckoutSession, userId: string, organizationContext: OrganizationPlanContext | null) {
        const subscriptionId = session.subscriptionId;
        if (!subscriptionId) return;

        const sub = await this.provider.getSubscription(subscriptionId);
        const priceId = sub.priceId;

        if (!priceId || !userId) return;

        const finalPlan = await this.findPlanByPriceIdentifier(priceId);

        if (!finalPlan) {
            Logger.warn('handleSubscriptionCheckout: Plan not found for priceId', { priceId, userId });
            return;
        }

        // Use finalPlan for the rest of the function
        const planToUse = finalPlan;

        // Coupon consumption
        await this.consumeCouponRedemptionFromMetadata(session.metadata);
        await this.consumeCouponRedemptionFromMetadata(sub.metadata);

        const startedAt = sub.currentPeriodStart;
        const expiresAt = sub.currentPeriodEnd;
        let effectiveStartedAt = startedAt;
        let effectiveExpiresAt = expiresAt;

        // Expire prior active subs
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
            // Natural expiry: only clear paid tokens after the grace window.
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

        // Notify expired subs
        if (expiredActiveSubs.length > 0) {
            notifyExpiredSubscriptions(expiredActiveSubs.map(s => s.id)).catch(err => {
                Logger.warn('Failed to notify expired subscriptions', { error: toError(err).message });
            });
        }

        // Check existing active subscription
        const existingActive = await prisma.subscription.findFirst({
            where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
            include: { plan: true }
        });

        let desiredStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE';
        let isUpgrade = false;
        let isDowngrade = false;
        let replacedRecurringSubscription: typeof existingActive | null = null;
        let resetTokensOnRenewal = false;

        const fallbackReason = (session.metadata?.prorationFallbackReason || sub.metadata?.prorationFallbackReason || '').trim();
        const switchAtPeriodEnd = fallbackReason === 'SWITCH_AT_PERIOD_END';

        if (existingActive) {
            if (existingActive.plan.autoRenew === false && planToUse.autoRenew === true) {
                // Replace non-recurring with recurring
                await prisma.subscription.update({
                    where: { id: existingActive.id },
                    data: { status: 'CANCELLED', canceledAt: new Date() }
                });

                // Send upgrade notification/email using template
                try {
                    const emailOk = await shouldEmailUser(userId);
                    if (emailOk) {
                        await sendBillingNotification({
                            userId,
                            title: 'Subscription Upgraded',
                            message: `Your ${planToUse.name} subscription is now active.`,
                            templateKey: 'subscription_upgraded',
                            variables: {
                                planName: planToUse.name,
                                amount: formatCurrency(planToUse.priceCents, getActiveCurrency()),
                                startedAt: startedAt.toLocaleDateString(),
                                expiresAt: expiresAt.toLocaleDateString(),
                                transactionId: sub.latestInvoice?.paymentIntentId || session.paymentIntentId || session.id
                            }
                        });
                    }
                } catch (err) {
                    Logger.warn('Failed to send upgrade email', { error: toError(err).message });
                }
                desiredStatus = 'ACTIVE';
            } else if (existingActive.plan.autoRenew === true && planToUse.autoRenew === true) {
                replacedRecurringSubscription = existingActive;
                resetTokensOnRenewal = await shouldClearPaidTokensOnRenewal(Boolean(planToUse.autoRenew));

                isUpgrade = planToUse.priceCents > existingActive.plan.priceCents;
                isDowngrade = planToUse.priceCents < existingActive.plan.priceCents;

                if (switchAtPeriodEnd) {
                    desiredStatus = 'PENDING';

                    // Queue activation to begin when the current subscription expires.
                    // NOTE: This assumes the new subscription was paid for at checkout time.
                    effectiveStartedAt = existingActive.expiresAt;
                    const periodMs = planToUse.durationHours * 3600 * 1000;
                    effectiveExpiresAt = new Date(effectiveStartedAt.getTime() + periodMs);

                    // Schedule cancellation of the existing subscription at period end.
                    // For providers without native support, adapters may implement a workaround.
                    try {
                        const existingProvider = this.getProviderForRecord(existingActive.paymentProvider);
                        const existingProviderKey = existingActive.paymentProvider || existingProvider.name;
                        const idMap = this.parseIdMap(existingActive.externalSubscriptionIds);
                        const existingProviderSubId = idMap[existingProviderKey] || existingActive.externalSubscriptionId;

                        if (existingProviderSubId) {
                            await existingProvider.cancelSubscription(existingProviderSubId, false);
                        } else {
                            Logger.warn('Missing provider subscription id when scheduling cancel-at-period-end', {
                                userId,
                                dbSubscriptionId: existingActive.id,
                                paymentProvider: existingActive.paymentProvider,
                            });
                        }

                        await prisma.subscription.update({
                            where: { id: existingActive.id },
                            data: { cancelAtPeriodEnd: true, canceledAt: existingActive.expiresAt },
                        });
                    } catch (err) {
                        Logger.warn('Failed to schedule cancel-at-period-end for existing subscription', {
                            userId,
                            dbSubscriptionId: existingActive.id,
                            error: toError(err).message,
                        });
                    }
                } else {
                    // Switch immediately (legacy behavior)
                    desiredStatus = 'ACTIVE';

                    try {
                        const existingProvider = this.getProviderForRecord(existingActive.paymentProvider);
                        const existingProviderKey = existingActive.paymentProvider || existingProvider.name;
                        const idMap = this.parseIdMap(existingActive.externalSubscriptionIds);
                        const existingProviderSubId = idMap[existingProviderKey] || existingActive.externalSubscriptionId;

                        if (existingProviderSubId) {
                            await existingProvider.cancelSubscription(existingProviderSubId, true);
                        } else {
                            Logger.warn('Missing provider subscription id when performing immediate switch cancellation', {
                                userId,
                                dbSubscriptionId: existingActive.id,
                                paymentProvider: existingActive.paymentProvider,
                            });
                        }
                    } catch (err) {
                        Logger.warn('Failed to cancel existing provider subscription during immediate switch', {
                            userId,
                            dbSubscriptionId: existingActive.id,
                            error: toError(err).message,
                        });
                    }

                    await prisma.subscription.update({
                        where: { id: existingActive.id },
                        data: { status: 'CANCELLED', canceledAt: new Date(), expiresAt: new Date(), cancelAtPeriodEnd: false }
                    });
                }
            } else {
                desiredStatus = 'PENDING';
                if (planToUse.autoRenew === true && existingActive.plan.autoRenew === true) {
                    isUpgrade = planToUse.priceCents > existingActive.plan.priceCents;
                    isDowngrade = planToUse.priceCents < existingActive.plan.priceCents;
                }
            }
        }

        // Update user customer ID
        if (sub.customerId && userId) {
            try {
                const user = await prisma.user.findUnique({ where: { id: userId }, select: { externalCustomerIds: true } });
                const mergedIds = this.mergeIdMap(user?.externalCustomerIds, this.providerKey, sub.customerId);

                // `externalCustomerId` is a legacy single-provider field and is UNIQUE.
                // If this customer id is already owned by a different user, skip updating the legacy field
                // and only update the provider-aware map.
                let canSetLegacyExternalCustomerId = true;
                try {
                    const owner = await prisma.user.findUnique({
                        where: { externalCustomerId: sub.customerId },
                        select: { id: true },
                    });
                    if (owner?.id && owner.id !== userId) {
                        canSetLegacyExternalCustomerId = false;
                        Logger.warn('externalCustomerId already linked to a different user; skipping legacy field update', {
                            provider: this.providerKey,
                            customerId: sub.customerId,
                            userId,
                            existingOwnerUserId: owner.id,
                        });
                    }
                } catch {
                    // If lookup fails, keep best-effort behavior.
                }

                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        ...(canSetLegacyExternalCustomerId ? { externalCustomerId: sub.customerId } : null),
                        externalCustomerIds: mergedIds ?? user?.externalCustomerIds,
                        paymentProvider: this.providerKey
                    },
                });
            } catch (err) {
                Logger.warn('Failed to update user customer ID', { error: toError(err).message });
            }
        }

        // Upsert subscription
        const existingSub = await prisma.subscription.findUnique({ where: { externalSubscriptionId: sub.id }, select: { externalSubscriptionIds: true } });
        const mergedSubIds = this.mergeIdMap(existingSub?.externalSubscriptionIds, this.providerKey, sub.id);

        const dbSub = await prisma.subscription.upsert({
            where: { externalSubscriptionId: sub.id },
            update: {
                userId,
                planId: planToUse.id,
                status: desiredStatus,
                startedAt: effectiveStartedAt,
                expiresAt: effectiveExpiresAt,
                canceledAt: sub.canceledAt ?? null,
                externalSubscriptionIds: mergedSubIds ?? existingSub?.externalSubscriptionIds,
                paymentProvider: this.providerKey
            },
            create: {
                userId,
                planId: planToUse.id,
                status: desiredStatus,
                startedAt: effectiveStartedAt,
                expiresAt: effectiveExpiresAt,
                canceledAt: sub.canceledAt ?? null,
                externalSubscriptionId: sub.id,
                externalSubscriptionIds: mergedSubIds ?? JSON.stringify({ [this.providerKey]: sub.id }),
                paymentProvider: this.providerKey
            } satisfies Prisma.SubscriptionUncheckedCreateInput
        });

        const tokensToGrant = desiredStatus === 'ACTIVE' && planToUse.tokenLimit ? planToUse.tokenLimit : 0;

        // Create Payment Record
        // For Paystack subscriptions, latestInvoice is null - use session data instead
        const paymentId = session.transactionId || session.paymentIntentId;
        let paymentRecorded = false;
        if (sub.latestInvoice) {
            const inv = sub.latestInvoice;
            const resolvedAmountCents = inv.total ?? planToUse.priceCents;
            const resolvedSubtotalCents = inv.subtotal ?? planToUse.priceCents;
            const resolvedDiscountCents = inv.amountDiscount ?? 0;
            const couponCode = sub.metadata?.couponCode || session.metadata?.couponCode;

            try {
                // Prefer transactionId for idempotency check (for Paystack)
                const lookupId = paymentId || inv.paymentIntentId;
                const existing = lookupId
                    ? await prisma.payment.findUnique({ where: { externalPaymentId: lookupId } })
                    : await prisma.payment.findFirst({ where: { externalSessionId: session.id } });

                if (!existing) {
                    await prisma.$transaction(async (tx) => {
                        await tx.payment.create({
                            data: {
                                userId,
                                subscriptionId: dbSub.id,
                                planId: planToUse.id,
                                organizationId: organizationContext?.organization.id ?? null,
                                amountCents: resolvedAmountCents,
                                subtotalCents: resolvedSubtotalCents,
                                discountCents: resolvedDiscountCents,
                                couponCode: couponCode || null,
                                status: 'SUCCEEDED',
                                // Prefer transactionId for Paystack dashboard URLs
                                externalPaymentId: paymentId || inv.paymentIntentId,
                                externalSessionId: session.id,
                                externalPaymentIds: this.mergeIdMap(null, this.providerKey, paymentId || inv.paymentIntentId) ?? undefined,
                                externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                                paymentProvider: this.providerKey
                            } satisfies Prisma.PaymentUncheckedCreateInput
                        });

                        const userUpdate: Prisma.UserUpdateInput = { paymentsCount: { increment: 1 } };
                        await tx.user.update({ where: { id: userId }, data: userUpdate });

                        if (tokensToGrant > 0) {
                            try {
                                if (organizationContext) {
                                    if (replacedRecurringSubscription && resetTokensOnRenewal) {
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
                                } else if (replacedRecurringSubscription && resetTokensOnRenewal) {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: tokensToGrant } });
                                } else {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: tokensToGrant } } });
                                }
                            } catch (err) {
                                Logger.warn('Failed to add tokens from subscription payment', { error: toError(err).message, userId });
                            }
                        }
                    });
                    paymentRecorded = true;
                } else {
                    paymentRecorded = true;
                }
                await updateSubscriptionLastPaymentAmount(dbSub.id);
            } catch (err) {
                Logger.error('Failed to create payment record', { error: toError(err).message });
            }
        } else if (paymentId && session.amountTotal) {
            // Fallback for providers without invoice data (e.g., Paystack)
            const couponCode = session.metadata?.couponCode;
            const resolvedAmountCents = session.amountTotal ?? planToUse.priceCents;
            const resolvedSubtotalCents = session.amountSubtotal ?? planToUse.priceCents;
            const resolvedDiscountCents = session.amountSubtotal && session.amountTotal
                ? Math.max(0, session.amountSubtotal - session.amountTotal)
                : 0;

            try {
                        const existing = await prisma.payment.findFirst({
                            where: { OR: [{ externalPaymentId: paymentId }, { externalSessionId: session.id }] }
                        });

                if (!existing) {
                    await prisma.$transaction(async (tx) => {
                        await tx.payment.create({
                            data: {
                                userId,
                                subscriptionId: dbSub.id,
                                planId: planToUse.id,
                                organizationId: organizationContext?.organization.id ?? null,
                                amountCents: resolvedAmountCents,
                                subtotalCents: resolvedSubtotalCents,
                                discountCents: resolvedDiscountCents,
                                couponCode: couponCode || null,
                                status: 'SUCCEEDED',
                                externalPaymentId: paymentId,
                                externalSessionId: session.id,
                                externalPaymentIds: this.mergeIdMap(null, this.providerKey, paymentId) ?? undefined,
                                externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                                paymentProvider: this.providerKey
                            } satisfies Prisma.PaymentUncheckedCreateInput
                        });

                        const userUpdate: Prisma.UserUpdateInput = { paymentsCount: { increment: 1 } };
                        await tx.user.update({ where: { id: userId }, data: userUpdate });

                        if (tokensToGrant > 0) {
                            try {
                                if (organizationContext) {
                                    if (replacedRecurringSubscription && resetTokensOnRenewal) {
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
                                } else if (replacedRecurringSubscription && resetTokensOnRenewal) {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: tokensToGrant } });
                                } else {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: tokensToGrant } } });
                                }
                            } catch (err) {
                                Logger.warn('Failed to add tokens from subscription payment (fallback)', { error: toError(err).message, userId });
                            }
                        }
                    });
                    paymentRecorded = true;
                } else {
                    paymentRecorded = true;
                }
                await updateSubscriptionLastPaymentAmount(dbSub.id);
            } catch (err) {
                Logger.error('Failed to create payment record (fallback)', { error: toError(err).message });
            }
        } else if (!paymentRecorded && this.providerKey === 'razorpay' && desiredStatus === 'ACTIVE') {
            // Razorpay subscription.activated can arrive without invoice/payment details.
            // Record a fallback payment so admin reporting + token grants are not skipped.
            const couponCode = session.metadata?.couponCode;
            const resolvedAmountCents = planToUse.priceCents;
            const resolvedSubtotalCents = planToUse.priceCents;
            const resolvedDiscountCents = 0;
            const fallbackPaymentId = paymentId || session.id;

            try {
                const existing = await prisma.payment.findFirst({
                    where: { OR: [{ externalPaymentId: fallbackPaymentId }, { externalSessionId: session.id }] }
                });

                if (!existing) {
                    await prisma.$transaction(async (tx) => {
                        await tx.payment.create({
                            data: {
                                userId,
                                subscriptionId: dbSub.id,
                                planId: planToUse.id,
                                organizationId: organizationContext?.organization.id ?? null,
                                amountCents: resolvedAmountCents,
                                subtotalCents: resolvedSubtotalCents,
                                discountCents: resolvedDiscountCents,
                                couponCode: couponCode || null,
                                status: 'SUCCEEDED',
                                externalPaymentId: fallbackPaymentId,
                                externalSessionId: session.id,
                                externalPaymentIds: this.mergeIdMap(null, this.providerKey, fallbackPaymentId) ?? undefined,
                                externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                                paymentProvider: this.providerKey
                            } satisfies Prisma.PaymentUncheckedCreateInput
                        });

                        const userUpdate: Prisma.UserUpdateInput = { paymentsCount: { increment: 1 } };
                        await tx.user.update({ where: { id: userId }, data: userUpdate });

                        if (tokensToGrant > 0) {
                            try {
                                if (organizationContext) {
                                    if (replacedRecurringSubscription && resetTokensOnRenewal) {
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
                                } else if (replacedRecurringSubscription && resetTokensOnRenewal) {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: tokensToGrant } });
                                } else {
                                    await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: tokensToGrant } } });
                                }
                            } catch (err) {
                                Logger.warn('Failed to add tokens from Razorpay subscription fallback payment', {
                                    error: toError(err).message,
                                    userId
                                });
                            }
                        }
                    });
                }

                paymentRecorded = true;
                await updateSubscriptionLastPaymentAmount(dbSub.id);
            } catch (err) {
                Logger.error('Failed to create Razorpay fallback payment record', { error: toError(err).message });
            }
        }

        await syncOrganizationEligibilityForUser(userId);

        // If any queued subscriptions are now due, activate them (and grant tokens).
        // This is especially important when switching at period end.
        try {
            await activatePendingSubscriptions(userId, { sendNotifications: true, source: 'payment:webhook:subscription_checkout' });
        } catch (err) {
            Logger.warn('Failed to activate pending subscriptions after subscription checkout', {
                userId,
                error: toError(err).message,
            });
        }

        // NOTE: Do not auto-provision organizations as a side-effect of payment.
        // Workspace provisioning is handled explicitly via the team provision flow.
        // (This also keeps token migration behavior consistent across providers.)

        // Notifications
        await this.sendSubscriptionNotifications(userId, planToUse, desiredStatus, isUpgrade, isDowngrade, sub, session);
    }

    private async handleOneTimeCheckout(session: StandardizedCheckoutSession, userId: string, organizationContext: OrganizationPlanContext | null) {
        Logger.info('handleOneTimeCheckout called', { sessionId: session.id, userId });

        if (!userId) {
            Logger.warn('handleOneTimeCheckout missing userId, skipping', { sessionId: session.id });
            return;
        }

        // Fallback: one-time payment via Checkout (legacy behavior)
        const priceId = session.lineItems?.[0]?.priceId || session.metadata?.priceId || session.metadata?.planPriceId;
        if (!priceId) return;

        const planToUse = await this.findPlanByPriceIdentifier(priceId);
        if (!planToUse) return;

        await this.consumeCouponRedemptionFromMetadata(session.metadata);

        const now = new Date();
        const periodMs = planToUse.durationHours * 3600 * 1000;
        const sessionSubtotalCents = session.amountSubtotal;
        const sessionTotalCents = session.amountTotal;
        
        // Check for in-app discount (for providers without native coupon support)
        const inAppDiscountCents = session.metadata?.inAppDiscountCents 
            ? parseInt(session.metadata.inAppDiscountCents, 10) 
            : 0;
        const originalPriceCents = session.metadata?.originalPriceCents 
            ? parseInt(session.metadata.originalPriceCents, 10) 
            : null;
        
        // Calculate discount: prefer in-app discount, then session-level discount
        const sessionDiscountCents = session.amountTotal && session.amountSubtotal 
            ? session.amountSubtotal - session.amountTotal 
            : inAppDiscountCents;

        const resolvedAmountCents = sessionTotalCents ?? planToUse.priceCents;
        const resolvedSubtotalCents = originalPriceCents 
            ?? sessionSubtotalCents 
            ?? (sessionDiscountCents != null ? resolvedAmountCents + sessionDiscountCents : undefined) 
            ?? planToUse.priceCents;
        const resolvedDiscountCents = inAppDiscountCents > 0 
            ? inAppDiscountCents 
            : (sessionDiscountCents ?? (resolvedSubtotalCents != null ? Math.max(0, resolvedSubtotalCents - resolvedAmountCents) : undefined));
        const couponCode = session.metadata?.couponCode;

        // Prefer transactionId for providers like Paystack that use numeric IDs for dashboard URLs
        const finalPaymentIntent: string | undefined = session.transactionId || session.paymentIntentId;

        // Expire prior active subs
        const expiredOnetimeSubs = await prisma.subscription.findMany({
            where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
            select: {
                id: true,
                organizationId: true,
                plan: { select: { autoRenew: true, supportsOrganizations: true } },
            }
        });

        const expiredOnetimeCount = await prisma.subscription.updateMany({
            where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
            data: { status: 'EXPIRED', canceledAt: new Date() }
        });

        if (expiredOnetimeCount.count > 0) {
            // Natural expiry: only clear paid tokens after the grace window.
            await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId });
            try {
                await syncOrganizationEligibilityForUser(userId);
            } catch (err) {
                Logger.warn('Failed to sync organization eligibility after expiring one-time subscriptions', {
                    userId,
                    error: toError(err).message
                });
            }
        }

        // Notify expired subs
        if (expiredOnetimeSubs.length > 0) {
            notifyExpiredSubscriptions(expiredOnetimeSubs.map(s => s.id)).catch(err => {
                Logger.warn('Failed to notify expired subscriptions', { error: toError(err).message });
            });
        }

        // Determine latest active subscription for extension
        const latestActive = await prisma.subscription.findFirst({
            where: { userId, status: 'ACTIVE', expiresAt: { gt: now } },
            include: { plan: true },
            orderBy: { expiresAt: 'desc' }
        });

        if (latestActive && latestActive.plan && latestActive.plan.autoRenew === false) {
            // Universal extension
            const newExpires = new Date(latestActive.expiresAt.getTime() + periodMs);

            // One-time extension behaves like a "renewal" for non-recurring plans.
            // Honor the operational control: reset bucket to tokenLimit vs increment.
            const shouldResetTokensOnOneTimeRenewal = await shouldClearPaidTokensOnRenewal(false);

            await prisma.$transaction(async (tx) => {
                await tx.subscription.update({ where: { id: latestActive.id }, data: { expiresAt: newExpires } });
                await tx.payment.create({
                    data: {
                        userId,
                        subscriptionId: null,
                        planId: planToUse.id,
                        amountCents: resolvedAmountCents,
                        subtotalCents: resolvedSubtotalCents,
                        discountCents: resolvedDiscountCents,
                        couponCode: couponCode || null,
                        status: 'SUCCEEDED',
                        externalSessionId: session.id,
                        externalPaymentId: finalPaymentIntent,
                        externalPaymentIds: this.mergeIdMap(null, this.providerKey, finalPaymentIntent) ?? undefined,
                        externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                        paymentProvider: this.providerKey
                    } satisfies Prisma.PaymentUncheckedCreateInput
                });
                await tx.user.update({ where: { id: userId }, data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput });

                if (planToUse.tokenLimit) {
                    // Credit tokens logic
                    if (organizationContext && organizationContext.role === 'OWNER') {
                        if (shouldResetTokensOnOneTimeRenewal) {
                            await tx.organization.update({
                                where: { id: organizationContext.organization.id },
                                data: { tokenBalance: planToUse.tokenLimit },
                            });
                        } else {
                            await creditOrganizationSharedTokens({
                                organizationId: organizationContext.organization.id,
                                amount: planToUse.tokenLimit,
                                tx
                            });
                        }
                    } else {
                        if (shouldResetTokensOnOneTimeRenewal) {
                            await tx.user.update({
                                where: { id: userId },
                                data: { tokenBalance: planToUse.tokenLimit }
                            });
                        } else {
                            await tx.user.update({
                                where: { id: userId },
                                data: { tokenBalance: { increment: planToUse.tokenLimit } }
                            });
                        }
                    }
                }
            });
            await updateSubscriptionLastPaymentAmount(latestActive.id);

            // Send extension notification
            try {
                const planTokenName = typeof planToUse.tokenName === 'string' ? planToUse.tokenName.trim() : '';
                const tokenName = planTokenName || await getDefaultTokenLabel();

                const notificationTitle = 'Subscription Extended';
                const notificationMessage = `Your subscription has been extended by ${planToUse.durationHours} hours.`;

                await sendBillingNotification({
                    userId,
                    title: notificationTitle,
                    message: notificationMessage,
                    templateKey: 'subscription_extended',
                    variables: {
                        planName: planToUse.name,
                        amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                        newExpiry: newExpires.toLocaleDateString(),
                        tokensAdded: planToUse.tokenLimit ? String(planToUse.tokenLimit) : '0',
                        tokenName,
                        transactionId: (finalPaymentIntent || session.id) as string
                    }
                });

                // Admin notification
                await sendAdminNotificationEmail({
                    userId,
                    title: 'Subscription Extended',
                    message: `User ${userId} extended subscription with ${planToUse.name}.`,
                    templateKey: 'admin_notification',
                    variables: {
                        planName: planToUse.name,
                        amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                        newExpiry: newExpires.toLocaleString(),
                        transactionId: (finalPaymentIntent || session.id) as string
                    }
                });
            } catch (err) {
                Logger.warn('Failed to send subscription extension notifications', { error: toError(err).message });
            }
        } else if (latestActive && latestActive.plan && latestActive.plan.autoRenew === true) {
            // Token top-up
            const tokensAdded = planToUse.tokenLimit || 0;
            const isPlanSwitchFallback = Boolean(session.metadata?.prorationFallbackReason);
            const organizationContext = tokensAdded > 0 ? await this.resolveOrganizationContext(userId) : null;
            const workspaceTopupContext = organizationContext && organizationContext.role === 'OWNER' ? organizationContext : null;

            let topupDestination: 'user_balance' | 'workspace_shared' | null = null;
            let topupWorkspaceId: string | null = null;

            await prisma.$transaction(async (tx) => {
                const existingPayment = finalPaymentIntent
                    ? await tx.payment.findUnique({ where: { externalPaymentId: finalPaymentIntent } })
                    : await tx.payment.findUnique({ where: { externalSessionId: session.id } });

                let paymentCreated = false;

                if (!existingPayment) {
                    await tx.payment.create({
                        data: {
                            userId,
                            subscriptionId: null,
                            planId: planToUse.id,
                            amountCents: resolvedAmountCents,
                            subtotalCents: resolvedSubtotalCents,
                            discountCents: resolvedDiscountCents,
                            couponCode: couponCode || null,
                            status: 'SUCCEEDED',
                            externalSessionId: session.id,
                            externalPaymentId: finalPaymentIntent,
                            externalPaymentIds: this.mergeIdMap(null, this.providerKey, finalPaymentIntent) ?? undefined,
                            externalSessionIds: this.mergeIdMap(null, this.providerKey, session.id) ?? undefined,
                            paymentProvider: this.providerKey
                        } satisfies Prisma.PaymentUncheckedCreateInput
                    });
                    paymentCreated = true;
                }

                if (paymentCreated && tokensAdded > 0) {
                    const userUpdate: Prisma.UserUpdateInput = { paymentsCount: { increment: 1 } };
                    if (!workspaceTopupContext) {
                        userUpdate.tokenBalance = { increment: tokensAdded };
                        topupDestination = 'user_balance';
                    }
                    await tx.user.update({ where: { id: userId }, data: userUpdate });

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
                userId,
                tokensAdded,
                planName: planToUse.name,
                destination: topupDestination,
                workspaceId: topupWorkspaceId ?? undefined,
            });

            // Send token top-up notification
            try {
                if (isPlanSwitchFallback) {
                    Logger.info('Skipping token top-up notifications for plan switch fallback', {
                        userId,
                        sessionId: session.id,
                        reason: session.metadata?.prorationFallbackReason,
                    });
                    return;
                }

                const planTokenName = typeof planToUse.tokenName === 'string' ? planToUse.tokenName.trim() : '';
                const tokenName = planTokenName || await getDefaultTokenLabel();
                const tokenLabel = tokenName.charAt(0).toUpperCase() + tokenName.slice(1);
                const recipientLabel = workspaceTopupContext
                    ? `${workspaceTopupContext.organization.name} workspace pool`
                    : 'your account';

                const notificationBody = workspaceTopupContext
                    ? `${tokensAdded} ${tokenName} added to your workspace pool.`
                    : `${tokensAdded} ${tokenName} added to your account.`;

                await sendBillingNotification({
                    userId,
                    title: `${tokenLabel} Added`,
                    message: notificationBody,
                    templateKey: 'token_topup',
                    variables: {
                        planName: planToUse.name,
                        tokenAmount: String(tokensAdded),
                        tokenName,
                        amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                        transactionId: (finalPaymentIntent || session.id) as string,
                        destination: recipientLabel,
                    },
                });

                const adminMessage = workspaceTopupContext
                    ? `User ${userId} purchased ${tokensAdded} ${tokenName} for workspace ${workspaceTopupContext.organization.name}.`
                    : `User ${userId} purchased ${tokensAdded} ${tokenName} from ${planToUse.name}.`;

                await sendAdminNotificationEmail({
                    userId,
                    title: `${tokenLabel} top-up purchase`,
                    message: adminMessage,
                    templateKey: 'admin_notification',
                    variables: {
                        planName: planToUse.name,
                        amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                        transactionId: (finalPaymentIntent || session.id) as string,
                        tokenAmount: String(tokensAdded),
                        tokenName,
                        destination: recipientLabel,
                    },
                });
            } catch (err) {
                Logger.warn('Failed to send token top-up notifications', { error: toError(err).message });
            }
        }
        else {
            // No existing active subscription -> create a new one-time subscription
            try {
                const newExpires = new Date(now.getTime() + periodMs);
                await prisma.$transaction(async (tx) => {
                    const sub = await tx.subscription.create({
                        data: {
                            userId,
                            planId: planToUse.id,
                            status: 'ACTIVE',
                            startedAt: now,
                            expiresAt: newExpires
                        }
                    });

                    await tx.payment.create({
                        data: {
                            userId,
                            subscriptionId: sub.id,
                            planId: planToUse.id,
                            amountCents: resolvedAmountCents,
                            subtotalCents: resolvedSubtotalCents,
                            discountCents: resolvedDiscountCents,
                            couponCode: couponCode || null,
                            status: 'SUCCEEDED',
                            externalSessionId: session.id,
                            externalPaymentId: finalPaymentIntent
                        } satisfies Prisma.PaymentUncheckedCreateInput
                    });

                    await tx.user.update({ where: { id: userId }, data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput });

                    if (planToUse.tokenLimit) {
                        if (organizationContext && organizationContext.role === 'OWNER') {
                            await creditOrganizationSharedTokens({ organizationId: organizationContext.organization.id, amount: planToUse.tokenLimit, tx });
                        } else {
                            await tx.user.update({ where: { id: userId }, data: { tokenBalance: { increment: planToUse.tokenLimit } } });
                        }
                    }
                });

                Logger.info('Created new one-time subscription and payment', { userId, planId: planToUse.id, sessionId: session.id });

                // Notifications
                try {
                    const planTokenName = typeof planToUse.tokenName === 'string' ? planToUse.tokenName.trim() : '';
                    const tokenName = planTokenName || await getDefaultTokenLabel();

                    await sendBillingNotification({
                        userId,
                        title: 'Subscription Active',
                        message: `Payment succeeded for ${planToUse.name}. Your subscription is active.`,
                        templateKey: 'subscription_activated',
                        variables: {
                            planName: planToUse.name,
                            amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                            startedAt: now.toLocaleDateString(),
                            expiresAt: newExpires.toLocaleDateString(),
                            tokensAdded: planToUse.tokenLimit ? String(planToUse.tokenLimit) : '0',
                            tokenName
                        }
                    });

                    await sendAdminNotificationEmail({
                        userId,
                        title: 'New one-time subscription purchase',
                        message: `User ${userId} purchased ${planToUse.name}.`,
                        templateKey: 'admin_notification',
                        variables: {
                            planName: planToUse.name,
                            amount: `$${(resolvedAmountCents / 100).toFixed(2)}`,
                            transactionId: (finalPaymentIntent || session.id) as string,
                            startedAt: now.toLocaleString()
                        }
                    });
                } catch (err) {
                    Logger.warn('Failed to send one-time purchase notifications', { error: toError(err).message });
                }
            } catch (err) {
                Logger.error('Failed to create one-time subscription/payment', { error: toError(err).message, sessionId: session.id });
            }
        }
    }

    private async sendSubscriptionNotifications(userId: string, plan: Plan, status: string, isUpgrade: boolean, isDowngrade: boolean, sub: SubscriptionDetails, session: StandardizedCheckoutSession) {
        Logger.info('sendSubscriptionNotifications called', { userId, planName: plan.name, status, isUpgrade, isDowngrade });

        try {
            if (status === 'ACTIVE') {
                let templateKey = 'subscription_activated';
                let notificationTitle = 'Subscription Active';
                let notificationMessage = `Payment succeeded for ${plan.name}. Your subscription is active.`;

                if (isUpgrade) {
                    templateKey = 'subscription_upgraded_recurring';
                    notificationTitle = 'Subscription Upgraded';
                    notificationMessage = `You've upgraded to ${plan.name}!`;
                } else if (isDowngrade) {
                    templateKey = 'subscription_downgraded';
                    notificationTitle = 'Subscription Changed';
                    notificationMessage = `Your subscription has been changed to ${plan.name}.`;
                }

                const fallbackCustomerEmail = session.userEmail;

                Logger.info('Sending user billing notification', { userId, templateKey, title: notificationTitle });

                const userNotifResult = await sendBillingNotification({
                    userId,
                    title: notificationTitle,
                    message: notificationMessage,
                    templateKey,
                    fallbackEmail: fallbackCustomerEmail ?? undefined,
                    variables: {
                        planName: plan.name,
                        amount: `$${(plan.priceCents / 100).toFixed(2)}`,
                        startedAt: sub.currentPeriodStart.toLocaleDateString(),
                        expiresAt: sub.currentPeriodEnd.toLocaleDateString(),
                        transactionId: sub.latestInvoice?.paymentIntentId || session.paymentIntentId || session.id
                    }
                });

                Logger.info('User billing notification result', {
                    userId,
                    notificationCreated: userNotifResult.notificationCreated,
                    emailSent: userNotifResult.emailSent
                });
            } else if (status === 'PENDING') {
                await createBillingNotification(userId, `Payment succeeded for ${plan.name}. Your subscription will activate when your current plan expires.`);
                const emailOk = await shouldEmailUser(userId);
                if (emailOk) {
                    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
                    const siteName = await getSiteName();
                    if (user?.email) {
                        await sendEmail({
                            to: user.email,
                            userId,
                            subject: `${siteName}: Subscription scheduled`,
                            text: `Your payment for ${plan.name} was successful. Your new subscription will automatically activate when your current subscription expires.`
                        });
                    }
                }
            }

            // Admin notification
            const transactionId = sub.latestInvoice?.paymentIntentId ?? sub.id;
            const formattedAmount = `$${(plan.priceCents / 100).toFixed(2)}`;

            const adminTitle = isUpgrade
                ? 'Subscription upgraded'
                : isDowngrade
                    ? 'Subscription downgraded'
                    : 'New subscription purchase';
            const adminMessage = isUpgrade
                ? `User ${userId} upgraded to ${plan.name}. Subscription: ${sub.id}`
                : isDowngrade
                    ? `User ${userId} downgraded to ${plan.name}. Subscription: ${sub.id}`
                    : `User ${userId} purchased recurring ${plan.name}. Subscription: ${sub.id}`;

            Logger.info('Sending admin notification email', {
                userId,
                planName: plan.name,
                amount: formattedAmount,
                change: isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'new',
            });

            await sendAdminNotificationEmail({
                userId,
                title: adminTitle,
                message: adminMessage,
                templateKey: 'admin_notification',
                variables: {
                    planName: plan.name,
                    amount: formattedAmount,
                    transactionId,
                    startedAt: sub.currentPeriodStart.toLocaleString(),
                },
            });

            Logger.info('Admin notification email sent successfully', { userId, planName: plan.name });

        } catch (err) {
            Logger.error('Failed to send billing notifications', {
                userId,
                planName: plan.name,
                error: toError(err).message,
                stack: toError(err).stack
            });
        }
    }

    private async resolveOrganizationContext(userId: string) {
        try {
            return await getOrganizationPlanContext(userId);
        } catch (err) {
            Logger.warn('Failed to resolve organization context', { userId, error: toError(err).message });
            return null;
        }
    }

    private async resolvePlanForOneTimeCheckout(priceId?: string | null, metadataPlanId?: string | null): Promise<Plan | null> {
        if (priceId) {
            const planByPrice = await this.findPlanByPriceIdentifier(priceId);
            if (planByPrice) return planByPrice;
        }

        if (!metadataPlanId) return null;
        const identifier = metadataPlanId.trim();
        if (!identifier) return null;

        const planById = await prisma.plan.findUnique({ where: { id: identifier } });
        if (planById) return planById;

        const candidateNames = new Set<string>();
        candidateNames.add(identifier);
        const seed = PLAN_DEFINITIONS.find(def => def.id === identifier);
        if (seed) {
            candidateNames.add(seed.name);
        }

        for (const nameCandidate of candidateNames) {
            const planByName = await prisma.plan.findFirst({ where: { name: nameCandidate } });
            if (planByName) return planByName;
        }

        return null;
    }

    /**
     * Handle subscription.created event (Paystack flow).
     * This fires after charge.success and is the signal that the subscription is fully set up.
     */
    private async handleSubscriptionCreated(subscription: StandardizedSubscription) {
        const subscriptionId = subscription.id;
        Logger.info('Handling subscription.created event', { subscriptionId, status: subscription.status });

        try {
            // Check if subscription already exists (idempotency)
            let dbSub = await this.findSubscriptionByProviderId(subscriptionId);

            if (dbSub) {
                Logger.info('Subscription already exists, treating as update', { subscriptionId });
                // Fall through to update logic
            } else {
                // Create the subscription
                dbSub = await this.ensureProviderBackedSubscription(subscriptionId, { subscription });
                if (!dbSub) {
                    Logger.warn('Failed to create subscription from subscription.created event', { subscriptionId });
                    return;
                }

                // Link pending payment and grant access for new subscriptions
                const status = subscription.status;
                if (status === 'active' || status === 'trialing') {
                    // Only grant access (and send activation emails) when we actually linked a
                    // pending payment. This keeps Paystack's pending-payment flow working while
                    // avoiding duplicate activation emails for providers where checkout.completed
                    // already handles fulfillment (e.g., Paddle/Stripe).
                    const linked = await this.linkPendingPaymentToSubscription(dbSub);
                    if (linked) {
                        await this.grantSubscriptionAccess(dbSub);
                    } else {
                        Logger.info('Skipping grantSubscriptionAccess (no pending payment to link)', {
                            subscriptionId,
                            dbSubscriptionId: dbSub.id,
                            userId: dbSub.userId,
                        });
                    }
                }

                Logger.info('Successfully created subscription from subscription.created event', {
                    subscriptionId,
                    dbSubscriptionId: dbSub.id,
                    userId: dbSub.userId
                });
                return;
            }

            // If subscription already existed, update it (same as handleSubscriptionUpdated)
            const status = subscription.status;
            const currentPeriodEnd = subscription.currentPeriodEnd;
            const normalizedStatus = status === 'active' || status === 'trialing'
                ? 'ACTIVE'
                : status === 'canceled'
                    ? 'CANCELLED'
                    : status === 'past_due' || status === 'unpaid'
                        ? 'PAST_DUE'
                        : 'PENDING';

            // Providers like Paystack represent "cancel at period end" as a status like
            // "non-renewing" while still being effectively active until the end date.
            // Persist cancelAtPeriodEnd and keep a stable canceledAt timestamp for UI.
            const nextCancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;
            const nextCanceledAt = normalizedStatus === 'CANCELLED'
                ? (subscription.canceledAt ?? dbSub.canceledAt ?? new Date())
                : nextCancelAtPeriodEnd
                    ? (subscription.canceledAt ?? dbSub.canceledAt ?? currentPeriodEnd)
                    : (subscription.canceledAt ?? null);

            // Policy: allow late webhooks to resurrect locally EXPIRED subscriptions (eventual consistency),
            // but do not auto-resurrect locally CANCELLED subscriptions.
            // Paystack can report an intentionally-disabled subscription as "active" + cancelAtPeriodEnd=true.
            const isLocallyCancelled = dbSub.status === 'CANCELLED';
            const effectiveStatus = isLocallyCancelled && normalizedStatus === 'ACTIVE'
                ? dbSub.status
                : normalizedStatus;
            const effectiveExpiresAt = isLocallyCancelled && normalizedStatus === 'ACTIVE'
                ? dbSub.expiresAt
                : currentPeriodEnd;

            // Store old status to detect "first activation" scenario
            const wasTransitioningToActive = dbSub.status === 'PENDING' && (status === 'active' || status === 'trialing');

            if (
                dbSub.status !== effectiveStatus
                || dbSub.expiresAt.getTime() !== effectiveExpiresAt.getTime()
                || dbSub.cancelAtPeriodEnd !== nextCancelAtPeriodEnd
                || (dbSub.canceledAt?.getTime() ?? 0) !== (nextCanceledAt?.getTime() ?? 0)
            ) {
                // Update the subscription and get fresh data
                const updatedSub = await prisma.subscription.update({
                    where: { id: dbSub.id },
                    data: {
                        expiresAt: effectiveExpiresAt,
                        status: effectiveStatus,
                        canceledAt: nextCanceledAt,
                        cancelAtPeriodEnd: nextCancelAtPeriodEnd,
                    },
                    include: { plan: true }
                });
                // Use fresh data for linking
                dbSub = updatedSub;
            }

            // Only link pending payment and grant access if this is a "first activation" scenario:
            // The subscription was PENDING and is now being set to ACTIVE
            if (wasTransitioningToActive) {
                const linked = await this.linkPendingPaymentToSubscription(dbSub);
                if (linked) {
                    await this.grantSubscriptionAccess(dbSub);
                } else {
                    Logger.info('Skipping grantSubscriptionAccess on activation transition (no pending payment to link)', {
                        subscriptionId,
                        dbSubscriptionId: dbSub.id,
                        userId: dbSub.userId,
                    });
                }
            }

            Logger.info('Processed subscription.created as update', { subscriptionId, status, wasTransitioningToActive });
        } catch (err) {
            Logger.error('Error handling subscription.created', { subscriptionId, error: toError(err).message });
        }
    }

    private async handleSubscriptionUpdated(subscription: StandardizedSubscription) {
        // Logic for subscription updates (renewals, cancellations, etc.)
        const subscriptionId = subscription.id;
        const status = subscription.status;
        const currentPeriodEnd = subscription.currentPeriodEnd;

        try {
            // Find the subscription in our DB
            // We use the provider-specific ID (externalSubscriptionId)
            let dbSub = await this.findSubscriptionByProviderId(subscriptionId);
            let isNewlyCreated = false;

            if (!dbSub) {
                dbSub = await this.ensureProviderBackedSubscription(subscriptionId, { subscription });
                if (!dbSub) {
                    Logger.warn('Received subscription update for unknown subscription', { subscriptionId });
                    return;
                }
                isNewlyCreated = true;
            }

            // Update status and expiry
            const normalizedStatus = status === 'active' || status === 'trialing'
                ? 'ACTIVE'
                : status === 'canceled'
                    ? 'CANCELLED'
                    : status === 'past_due' || status === 'unpaid'
                        ? 'PAST_DUE'
                        : 'PENDING';

            const nextCancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;
            const nextCanceledAt = normalizedStatus === 'CANCELLED'
                ? (subscription.canceledAt ?? dbSub.canceledAt ?? new Date())
                : nextCancelAtPeriodEnd
                    ? (subscription.canceledAt ?? dbSub.canceledAt ?? currentPeriodEnd)
                    : (subscription.canceledAt ?? null);

            // Policy: allow late webhooks to resurrect locally EXPIRED subscriptions, but not CANCELLED.
            const isLocallyCancelled = dbSub.status === 'CANCELLED';
            const effectiveStatus = isLocallyCancelled && normalizedStatus === 'ACTIVE'
                ? dbSub.status
                : normalizedStatus;
            const effectiveExpiresAt = isLocallyCancelled && normalizedStatus === 'ACTIVE'
                ? dbSub.expiresAt
                : currentPeriodEnd;

            // Plan changes: apply immediately when the provider sends a new priceId.
            // If we treat the webhook as stale (locally CANCELLED but provider says ACTIVE), also ignore plan changes.
            let nextPlanId: string | null = null;
            if (!(isLocallyCancelled && normalizedStatus === 'ACTIVE')) {
                const priceId = subscription.priceId;
                if (typeof priceId === 'string' && priceId.length > 0) {
                    const nextPlan = await this.findPlanByPriceIdentifier(priceId);
                    if (!nextPlan) {
                        Logger.warn('Received subscription update with unknown priceId', { subscriptionId, priceId });
                    } else if (nextPlan.id !== dbSub.planId) {
                        nextPlanId = nextPlan.id;
                    }
                }
            }

            if (
                dbSub.status !== effectiveStatus
                || dbSub.expiresAt.getTime() !== effectiveExpiresAt.getTime()
                || dbSub.cancelAtPeriodEnd !== nextCancelAtPeriodEnd
                || (dbSub.canceledAt?.getTime() ?? 0) !== (nextCanceledAt?.getTime() ?? 0)
				|| (nextPlanId != null && nextPlanId !== dbSub.planId)
            ) {
                Logger.info('Updating subscription from webhook', {
                    subscriptionId: dbSub.id,
                    oldStatus: dbSub.status,
                    newStatus: effectiveStatus,
                    oldExpiry: dbSub.expiresAt,
                    newExpiry: effectiveExpiresAt,
                    oldCancelAtPeriodEnd: dbSub.cancelAtPeriodEnd,
                    newCancelAtPeriodEnd: nextCancelAtPeriodEnd,
                });

                // Update and get fresh data
                const updatedSub = await prisma.subscription.update({
                    where: { id: dbSub.id },
                    data: {
                        expiresAt: effectiveExpiresAt,
                        status: effectiveStatus,
                        canceledAt: nextCanceledAt,
                        cancelAtPeriodEnd: nextCancelAtPeriodEnd,
						...(nextPlanId ? { planId: nextPlanId } : null),
                    },
                    include: { plan: true }
                });
                // Use fresh data for any subsequent operations
                dbSub = updatedSub;

				if (nextPlanId) {
					try {
						await syncOrganizationEligibilityForUser(dbSub.userId);
					} catch (err) {
						Logger.warn('Failed to sync organization eligibility after subscription plan change', {
							userId: dbSub.userId,
							error: toError(err).message,
						});
					}

                    // Token policy: when the plan actually changes (immediately or at cycle end),
                    // optionally reset remaining paid tokens to the new plan's allotment.
                    try {
                        const shouldResetTokens = await shouldClearPaidTokensOnRenewal(Boolean(dbSub.plan?.autoRenew));
                        if (shouldResetTokens && effectiveStatus === 'ACTIVE') {
                            const tokenLimit = typeof dbSub.plan?.tokenLimit === 'number' ? dbSub.plan.tokenLimit : null;
                            if (tokenLimit !== null) {
                                if (dbSub.organizationId) {
                                    // Organization strategy is fixed-pool; keep behavior conservative for now.
                                    await resetOrganizationSharedTokens({ organizationId: dbSub.organizationId });
                                    await creditOrganizationSharedTokens({ organizationId: dbSub.organizationId, amount: tokenLimit });
                                } else {
                                    await prisma.user.update({ where: { id: dbSub.userId }, data: { tokenBalance: tokenLimit } });
                                }

                                Logger.info('Reset token balance on subscription plan change per admin setting', {
                                    userId: dbSub.userId,
                                    tokenLimit,
                                    subscriptionId: dbSub.id,
                                });
                            }
                        }
                    } catch (err) {
                        Logger.warn('Failed to apply token operation after subscription plan change', {
                            userId: dbSub.userId,
                            error: toError(err).message,
                        });
                    }
				}
            }

            // For newly created subscriptions (Paystack flow), link pending payment and grant access
            if (isNewlyCreated && normalizedStatus === 'ACTIVE') {
                const linked = await this.linkPendingPaymentToSubscription(dbSub);
                if (linked) {
                    await this.grantSubscriptionAccess(dbSub);
                } else {
                    Logger.info('Skipping grantSubscriptionAccess for newly created ACTIVE subscription (no pending payment to link)', {
                        subscriptionId,
                        dbSubscriptionId: dbSub.id,
                        userId: dbSub.userId,
                    });
                }
            }

            Logger.info('Processed subscription update', { subscriptionId, status, isNewlyCreated });

        } catch (err) {
            Logger.error('Error handling subscription update', { subscriptionId, error: toError(err).message });
        }
    }

    /**
     * Links a pending payment (from Paystack charge.success) to the newly created subscription.
     * This is called when subscription.create fires after charge.success.
     */
    private async linkPendingPaymentToSubscription(
        dbSub: SubscriptionWithPlan
    ): Promise<boolean> {
        try {
            // First, check if there's already a payment linked to this subscription
            // This prevents duplicate linking if the webhook is retried
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

            // Find pending payments for this user and plan
            const pendingPayments = await prisma.payment.findMany({
                where: {
                    userId: dbSub.userId,
                    planId: dbSub.planId,
                    status: 'PENDING_SUBSCRIPTION',
                    subscriptionId: null,
                    // Only link reasonably recent payments to avoid linking old orphaned payments.
                    // Paystack can be delayed between charge.success and subscription.create.
                    createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
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
            } else {
                Logger.info('No pending payment found to link', {
                    subscriptionId: dbSub.id,
                    userId: dbSub.userId,
                    planId: dbSub.planId
                });
                return false;
            }
        } catch (err) {
            Logger.warn('Failed to link pending payment to subscription', {
                subscriptionId: dbSub.id,
                error: toError(err).message
            });
            return false;
        }
    }

    /**
     * Grants access (tokens, organization eligibility) when a new subscription is activated.
     * Used for Paystack flow where subscription.create fires separately from checkout.
     */
    private async grantSubscriptionAccess(dbSub: SubscriptionWithPlan) {
        const plan = dbSub.plan;
        const userId = dbSub.userId;

        try {
            const recentCancelledRecurring = await prisma.subscription.findFirst({
                where: {
                    userId,
                    id: { not: dbSub.id },
                    status: 'CANCELLED',
                    canceledAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
                    plan: { autoRenew: true },
                },
                select: { id: true },
            });
            const suppressActivationNotifications = Boolean(recentCancelledRecurring);

            // Grant tokens if plan has a token limit
            if (plan.tokenLimit && plan.tokenLimit > 0) {
                // Check if this is an organization subscription
                if (dbSub.organizationId) {
                    await creditOrganizationSharedTokens({
                        organizationId: dbSub.organizationId,
                        amount: plan.tokenLimit
                    });
                    Logger.info('Credited tokens to organization', {
                        organizationId: dbSub.organizationId,
                        tokens: plan.tokenLimit
                    });
                } else {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { tokenBalance: { increment: plan.tokenLimit } }
                    });
                    Logger.info('Credited tokens to user', {
                        userId,
                        tokens: plan.tokenLimit
                    });
                }
            }

            // Sync organization eligibility
            await syncOrganizationEligibilityForUser(userId);

            // Send notification with complete subscription details
            const planTokenName = typeof plan.tokenName === 'string' ? plan.tokenName.trim() : '';
            const tokenName = planTokenName || await getDefaultTokenLabel();
            const tokenInfo = plan.tokenLimit ? ` with ${plan.tokenLimit} ${tokenName}` : '';

            // Format dates for the template
            const startedAt = dbSub.startedAt
                ? dbSub.startedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const expiresAt = dbSub.expiresAt
                ? dbSub.expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';

            if (!suppressActivationNotifications) {
                await sendBillingNotification({
                    userId,
                    title: 'Subscription Activated',
                    message: `Your subscription to ${plan.name}${tokenInfo} is now active.`,
                    templateKey: 'subscription_activated',
                    variables: {
                        planName: plan.name,
                        tokenBalance: String(plan.tokenLimit || 0),
                        tokenName,
                        startedAt,
                        expiresAt
                    }
                });
            }

            // Send admin notification for new subscription
            // Note: sendAdminNotificationEmail internally checks SEND_ADMIN_BILLING_EMAILS
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, name: true }
            });

            if (!suppressActivationNotifications) {
                await sendAdminNotificationEmail({
                    title: `New Subscription: ${plan.name}`,
                    message: `A new subscription was activated.\n\nPlan: ${plan.name}\nUser: ${user?.name || 'N/A'}\nEmail: ${user?.email || 'N/A'}\nStarted: ${startedAt}\nExpires: ${expiresAt}`,
                    userId
                });
            }

            Logger.info('Granted subscription access', {
                subscriptionId: dbSub.id,
                userId,
                planId: plan.id,
                tokens: plan.tokenLimit
            });
        } catch (err) {
            Logger.error('Error granting subscription access', {
                subscriptionId: dbSub.id,
                userId,
                error: toError(err).message
            });
        }
    }

    private async handleInvoicePaid(invoice: StandardizedInvoice) {
        const subscriptionId = invoice.subscriptionId;

        if (!subscriptionId || !invoice.paymentIntentId) return;

        const paymentIntentId = invoice.paymentIntentId;

        // Find subscription (keep as non-nullable after early returns)
        const initialSub = await this.findSubscriptionByProviderId(subscriptionId) as SubscriptionWithPlan | null;
        let dbSub: SubscriptionWithPlan;

        if (!initialSub) {
            const ensured = await this.ensureProviderBackedSubscription(subscriptionId, { invoice });
            if (!ensured) {
                // If this is the initial invoice for a new subscription, it might be a race condition
                // where checkout.completed hasn't finished yet. We can safely ignore it because
                // checkout.completed handles the initial payment recording.
                if (invoice.billingReason === 'subscription_create') {
                    Logger.info('Ignoring invoice.payment_succeeded for new subscription (handled by checkout)', { subscriptionId, invoiceId: invoice.id });
                    return;
                }

                Logger.warn('Invoice paid for unknown subscription', { subscriptionId, invoiceId: invoice.id, billingReason: invoice.billingReason });
                return;
            }

            dbSub = ensured as SubscriptionWithPlan;
        } else {
            dbSub = initialSub;
        }

        // Resolve organization context once for consistent payment attribution.
        // (May be null if the user has not provisioned a workspace yet.)
        const organizationContext = await this.resolveOrganizationContext(dbSub.userId);
        const resolvedOrganizationId = organizationContext?.role === 'OWNER'
            ? organizationContext.organization.id
            : (dbSub.organizationId ?? null);

        const shouldResetTokensOnRenewal = await shouldClearPaidTokensOnRenewal(Boolean(dbSub.plan?.autoRenew));

        // Create Payment
        try {
            const paymentResult = await prisma.$transaction(async (tx) => {
                const existingPayment = await tx.payment.findUnique({ where: { externalPaymentId: paymentIntentId } });
                if (existingPayment) {
                    return { payment: existingPayment, created: false } as const;
                }

                // Use subscription payment history (in our DB) as a provider-agnostic signal
                // for whether this is the first successful charge for the subscription.
                // This avoids relying on provider-specific billingReason strings, which can vary
                // across providers and even across Stripe invoice types.
                const priorSuccessfulPaymentsForSubscription = await tx.payment.count({
                    where: {
                        subscriptionId: dbSub.id,
                        status: 'SUCCEEDED',
                    },
                });

                const payment = await tx.payment.create({
                    data: {
                        userId: dbSub.userId,
                        subscriptionId: dbSub.id,
                        planId: dbSub.planId,
                        organizationId: resolvedOrganizationId,
                        amountCents: invoice.amountPaid,
                        subtotalCents: invoice.subtotal,
                        discountCents: invoice.amountDiscount,
                        status: 'SUCCEEDED',
                        externalPaymentId: paymentIntentId,
                        externalPaymentIds: this.mergeIdMap(null, this.providerKey, paymentIntentId) ?? undefined,
                        externalSessionId: null,
                        externalSessionIds: this.mergeIdMap(null, this.providerKey, invoice.id) ?? undefined,
                        paymentProvider: this.providerKey
                    } satisfies Prisma.PaymentUncheckedCreateInput
                });

                await tx.user.update({
                    where: { id: dbSub.userId },
                    data: { paymentsCount: { increment: 1 } } as unknown as Prisma.UserUpdateInput
                });

                // Token granting for subscription invoices:
                // - Primary/expected flow: checkout.completed records the initial subscription payment.
                // - Fallback flow: invoice.payment_succeeded may arrive without (or before) checkout.completed.
                //
                // We intentionally grant tokens only when the Payment record is newly created (idempotency).
                // For the initial cycle, we grant when either:
                // - provider billingReason indicates subscription_create, OR
                // - this is the first successful payment we've recorded for the subscription.
                const isLikelyInitialSubscriptionCharge =
                    invoice.billingReason === 'subscription_create' || priorSuccessfulPaymentsForSubscription === 0;

                const tokenLimit = dbSub.plan?.tokenLimit;
                const planSupportsOrganizations = dbSub.plan?.supportsOrganizations === true;

                if (isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0) {
                    const tokensToGrant = tokenLimit;
                    if (resolvedOrganizationId && planSupportsOrganizations) {
                        await creditOrganizationSharedTokens({
                            organizationId: resolvedOrganizationId,
                            amount: tokensToGrant,
                            tx,
                        });
                    } else {
                        await tx.user.update({
                            where: { id: dbSub.userId },
                            data: { tokenBalance: { increment: tokensToGrant } },
                        });
                    }

                    Logger.info('Granted tokens from subscription invoice payment', {
                        subscriptionId,
                        paymentIntentId,
                        invoiceId: invoice.id,
                        billingReason: invoice.billingReason,
                        priorSuccessfulPaymentsForSubscription,
                        tokensToGrant,
                        resolvedOrganizationId,
                    });
                } else if (!isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0 && shouldResetTokensOnRenewal) {
                    // Renewal: reset the bucket back to the plan limit (rather than incrementing),
                    // matching the semantics used elsewhere for reset-on-renewal.
                    if (resolvedOrganizationId && planSupportsOrganizations) {
                        await tx.organization.update({
                            where: { id: resolvedOrganizationId },
                            data: { tokenBalance: tokenLimit },
                        });
                    } else {
                        await tx.user.update({
                            where: { id: dbSub.userId },
                            data: { tokenBalance: tokenLimit },
                        });
                    }

                    Logger.info('Reset tokens on subscription renewal invoice payment', {
                        subscriptionId,
                        paymentIntentId,
                        invoiceId: invoice.id,
                        billingReason: invoice.billingReason,
                        priorSuccessfulPaymentsForSubscription,
                        tokenLimit,
                        resolvedOrganizationId,
                        planSupportsOrganizations,
                    });
                } else if (!isLikelyInitialSubscriptionCharge && tokenLimit && tokenLimit > 0 && !shouldResetTokensOnRenewal) {
                    // Renewal: increment tokens when reset-on-renewal is OFF.
                    if (resolvedOrganizationId && planSupportsOrganizations) {
                        await creditOrganizationSharedTokens({
                            organizationId: resolvedOrganizationId,
                            amount: tokenLimit,
                            tx,
                        });
                    } else {
                        await tx.user.update({
                            where: { id: dbSub.userId },
                            data: { tokenBalance: { increment: tokenLimit } },
                        });
                    }

                    Logger.info('Incremented tokens on subscription renewal invoice payment', {
                        subscriptionId,
                        paymentIntentId,
                        invoiceId: invoice.id,
                        billingReason: invoice.billingReason,
                        priorSuccessfulPaymentsForSubscription,
                        tokenLimit,
                        resolvedOrganizationId,
                        planSupportsOrganizations,
                    });
                } else {
                    Logger.info('Skipping token grant/reset from subscription invoice payment', {
                        subscriptionId,
                        paymentIntentId,
                        invoiceId: invoice.id,
                        billingReason: invoice.billingReason,
                        priorSuccessfulPaymentsForSubscription,
                        hasPlanTokenLimit: Boolean(tokenLimit && tokenLimit > 0),
                        shouldResetTokensOnRenewal,
                    });
                }

                return { payment, created: true } as const;
            });

            await updateSubscriptionLastPaymentAmount(dbSub.id);

            // Refresh subscription expiry from the provider so renewal emails include an accurate next
            // renewal date even if our local record is stale.
            let refreshedExpiresAt: Date | null = dbSub.expiresAt ?? null;
            try {
                const providerSub = await this.provider.getSubscription(subscriptionId);
                if (providerSub?.currentPeriodEnd) {
                    refreshedExpiresAt = providerSub.currentPeriodEnd;
                    await prisma.subscription.update({
                        where: { id: dbSub.id },
                        data: {
                            expiresAt: providerSub.currentPeriodEnd,
                            // Policy: late renewal evidence should resurrect locally EXPIRED subscriptions.
                            ...(dbSub.status === 'EXPIRED' && providerSub.currentPeriodEnd.getTime() > Date.now()
                                ? { status: 'ACTIVE' }
                                : null),
                        }
                    });

                    // Keep in-memory state consistent for notification decisions below.
                    dbSub = {
                        ...dbSub,
                        expiresAt: providerSub.currentPeriodEnd,
                        ...(dbSub.status === 'EXPIRED' && providerSub.currentPeriodEnd.getTime() > Date.now()
                            ? { status: 'ACTIVE' }
                            : null),
                    } as SubscriptionWithPlan;
                }
            } catch (err) {
                Logger.warn('Unable to refresh subscription expiry before renewal notification', {
                    subscriptionId,
                    error: toError(err).message
                });
            }

            // If a retry hits an already-recorded payment, avoid duplicate emails by checking
            // for a recent renewal notification before continuing.
            if (!paymentResult.created) {
                const recentRenewalNotification = await prisma.notification.findFirst({
                    where: {
                        userId: dbSub.userId,
                        title: 'Subscription Renewed',
                        createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }
                    }
                });

                if (recentRenewalNotification) {
                    Logger.info('Skipping renewal notification (already sent for payment)', {
                        subscriptionId,
                        paymentIntentId,
                        notificationId: recentRenewalNotification.id
                    });
                    return;
                }

                Logger.info('Recurring payment already recorded; sending renewal notification for retry event', {
                    subscriptionId,
                    paymentIntentId
                });
            }

            const lineItemsTotal = invoice.lineItems?.reduce((sum, item) => sum + (item?.amount ?? 0), 0);
            const billingReason = invoice.billingReason;
            const isInitialInvoice = billingReason === 'subscription_create';

            // Initial subscription invoices are already covered by the checkout flow's activation email.
            // Avoid sending a renewal email for the first charge of a new subscription.
            if (isInitialInvoice) {
                Logger.info('Skipping renewal notification for initial subscription invoice', {
                    subscriptionId,
                    paymentIntentId,
                    invoiceId: invoice.id
                });
                return;
            }

            // Guard: one-time plans should not emit renewal notifications
            if (dbSub.plan?.autoRenew === false) {
                Logger.info('Skipping renewal notification for non-recurring plan', {
                    subscriptionId,
                    planId: dbSub.planId,
                    billingReason
                });
                return;
            }
            let changeType: 'upgrade' | 'downgrade' | null = null;

            if (billingReason === 'subscription_update') {
                if (typeof lineItemsTotal === 'number') {
                    if (lineItemsTotal > 0) changeType = 'upgrade';
                    else if (lineItemsTotal < 0) changeType = 'downgrade';
                } else {
                    // Fallback heuristic when line items are missing
                    changeType = invoice.amountPaid > 0 ? 'upgrade' : 'downgrade';
                }
            }

            if (changeType) {
                const templateKey = changeType === 'upgrade' ? 'subscription_upgraded_recurring' : 'subscription_downgraded';
                const title = changeType === 'upgrade' ? 'Subscription Upgraded' : 'Subscription Changed';
                const message = changeType === 'upgrade'
                    ? `Your subscription has been upgraded to ${dbSub.plan.name}.`
                    : `Your subscription has been changed to ${dbSub.plan.name}.`;

                const existingRecent = await prisma.notification.findFirst({
                    where: {
                        userId: dbSub.userId,
                        title,
                        message,
                        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
                    }
                });

                if (!existingRecent) {
                    await sendBillingNotification({
                        userId: dbSub.userId,
                        title,
                        message,
                        templateKey,
                        variables: {
                            planName: dbSub.plan.name,
                            amount: `$${(invoice.amountPaid / 100).toFixed(2)}`,
                            startedAt: new Date().toLocaleDateString(),
                            expiresAt: dbSub.expiresAt ? dbSub.expiresAt.toLocaleDateString() : undefined,
                        }
                    });
                } else {
                    Logger.info('Skipping duplicate change notification', {
                        userId: dbSub.userId,
                        subscriptionId,
                        templateKey,
                        notificationId: existingRecent.id
                    });
                }
            } else {
                const renewalTitle = 'Subscription Renewed';
                const renewalMessage = `Your subscription to ${dbSub.plan.name} has been renewed.`;

                const existingRecent = await prisma.notification.findFirst({
                    where: {
                        userId: dbSub.userId,
                        title: renewalTitle,
                        message: renewalMessage,
                        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
                    }
                });

                if (existingRecent) {
                    Logger.info('Skipping duplicate renewal notification', {
                        userId: dbSub.userId,
                        subscriptionId,
                        paymentIntentId,
                        notificationId: existingRecent.id
                    });
                } else {
                    await sendBillingNotification({
                        userId: dbSub.userId,
                        title: renewalTitle,
                        message: renewalMessage,
                        templateKey: 'subscription_renewed',
                        variables: {
                            planName: dbSub.plan.name,
                            amount: `$${(invoice.amountPaid / 100).toFixed(2)}`,
                            date: new Date().toLocaleDateString(),
                            transactionId: paymentResult.payment.id || paymentIntentId || invoice.id,
                            expiresAt: refreshedExpiresAt ? refreshedExpiresAt.toLocaleDateString() : undefined
                        }
                    });
                }
            }

            Logger.info('Recorded recurring payment', { subscriptionId, paymentIntentId });

        } catch (err) {
            Logger.error('Failed to process invoice payment', { error: toError(err).message });
        }
    }

    /**
     * Handle invoice.created webhook (Paystack).
     * This fires BEFORE the charge attempt. We use this to implement
     * cancel-at-period-end for providers that don't support it natively.
     * If the subscription is marked with cancelAtPeriodEnd=true in our DB,
     * we disable it now to prevent the charge.
     */
    private async handleInvoiceCreated(invoice: StandardizedInvoice) {
        const subscriptionId = invoice.subscriptionId;
        if (!subscriptionId) {
            Logger.info('Invoice created without subscription ID, skipping', { invoiceId: invoice.id });
            return;
        }

        try {
            // Find the subscription by external ID
            const dbSub = await prisma.subscription.findFirst({
                where: {
                    OR: [
                        { externalSubscriptionId: subscriptionId },
                        { stripeSubscriptionId: subscriptionId }
                    ]
                },
                include: { plan: true, user: true }
            });

            if (!dbSub) {
                Logger.warn('Invoice created for unknown subscription', { subscriptionId, invoiceId: invoice.id });
                return;
            }

            // Check if this subscription is marked for cancel-at-period-end
            if (!dbSub.cancelAtPeriodEnd) {
                Logger.info('Subscription not marked for cancel-at-period-end, allowing renewal', {
                    subscriptionId,
                    dbSubscriptionId: dbSub.id
                });
                return;
            }

            Logger.info('Subscription marked for cancel-at-period-end, disabling before charge', {
                subscriptionId,
                dbSubscriptionId: dbSub.id,
                invoiceId: invoice.id
            });

            // Get the provider and cancel immediately
            const provider = this.getProviderForRecord(dbSub.paymentProvider);
            const externalSubId = dbSub.externalSubscriptionId || dbSub.stripeSubscriptionId;

            if (!externalSubId) {
                Logger.error('No external subscription ID found for cancel-at-period-end', { dbSubscriptionId: dbSub.id });
                return;
            }

            // Cancel immediately in the provider
            await provider.cancelSubscription(externalSubId, true);

            // Update our DB
            await prisma.subscription.update({
                where: { id: dbSub.id },
                data: {
                    status: 'CANCELLED',
                    canceledAt: new Date(),
                    cancelAtPeriodEnd: false // Clear the flag
                }
            });

            Logger.info('Successfully cancelled subscription at period end via invoice.created webhook', {
                subscriptionId: externalSubId,
                dbSubscriptionId: dbSub.id,
                userId: dbSub.userId
            });

            // Notify the user
            try {
                await sendBillingNotification({
                    userId: dbSub.userId,
                    title: 'Subscription Ended',
                    message: `Your ${dbSub.plan.name} subscription has ended as scheduled.`,
                    templateKey: 'subscription_ended',
                    variables: {
                        planName: dbSub.plan.name
                    }
                });
            } catch (notifErr) {
                Logger.warn('Failed to send subscription ended notification', {
                    userId: dbSub.userId,
                    error: toError(notifErr).message
                });
            }
        } catch (err) {
            Logger.error('Error handling invoice.created for cancel-at-period-end', {
                subscriptionId,
                invoiceId: invoice.id,
                error: toError(err).message
            });
        }
    }

    private async handleInvoiceUpcoming(invoice: StandardizedInvoice) {
        const subscriptionId = invoice.subscriptionId;
        if (!subscriptionId) return;

        try {
            let dbSub = await prisma.subscription.findUnique({
                where: { externalSubscriptionId: subscriptionId },
                include: { plan: true }
            }) as SubscriptionWithPlan | null;

            if (!dbSub) {
                dbSub = await this.ensureProviderBackedSubscription(subscriptionId, { invoice });
                if (!dbSub) {
                    Logger.warn('Upcoming invoice for unknown subscription', { subscriptionId, invoiceId: invoice.id });
                    return;
                }
            }

            if (dbSub.status !== 'ACTIVE') {
                Logger.info('Skipping renewal reminder for non-active subscription', { subscriptionId, status: dbSub.status });
                return;
            }

            if (dbSub.plan?.autoRenew === false) {
                Logger.info('Skipping renewal reminder for non-recurring plan', { subscriptionId, planId: dbSub.planId });
                return;
            }

            const renewAt = invoice.nextPaymentAttempt || dbSub.expiresAt || null;

            const reminderTitle = 'Renewal Reminder';
            const reminderMessage = `Your subscription to ${dbSub.plan.name} renews soon.`;

            const existingRecent = await prisma.notification.findFirst({
                where: {
                    userId: dbSub.userId,
                    title: reminderTitle,
                    message: reminderMessage,
                    createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
                }
            });

            if (existingRecent) {
                Logger.info('Skipping duplicate renewal reminder', { subscriptionId, invoiceId: invoice.id, notificationId: existingRecent.id });
                return;
            }

            const amountSource = typeof invoice.amountDue === 'number' ? invoice.amountDue : invoice.amountPaid;
            const amount = typeof amountSource === 'number' ? `$${(amountSource / 100).toFixed(2)}` : undefined;

            await sendBillingNotification({
                userId: dbSub.userId,
                title: reminderTitle,
                message: reminderMessage,
                templateKey: 'subscription_renewal_reminder',
                variables: {
                    planName: dbSub.plan.name,
                    amount,
                    expiresAt: renewAt ? renewAt.toLocaleDateString() : undefined,
                    billingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/pricing`
                }
            });
        } catch (err) {
            Logger.error('Error handling upcoming invoice', { invoiceId: invoice.id, error: toError(err).message });
        }
    }

    private async handlePaymentFailed(payload: import('./types').StandardizedPaymentFailed) {
        const { id, subscriptionId, customerId, errorMessage, errorCode, metadata } = payload;
        
        Logger.warn('Payment failed webhook received', {
            paymentId: id,
            subscriptionId,
            customerId,
            errorMessage,
            errorCode
        });

        // Try to identify the user
        let userId = metadata?.userId;
        if (!userId && customerId) {
            userId = await this.resolveUserByCustomerId(customerId) || undefined;
        }

        if (!userId) {
            Logger.warn('Payment failed for unknown user', { paymentId: id, customerId });
            return;
        }

        // If this was a subscription payment, update subscription status
        if (subscriptionId) {
            try {
                const dbSub = await this.findSubscriptionByProviderId(subscriptionId);
                if (dbSub) {
                    await prisma.subscription.update({
                        where: { id: dbSub.id },
                        data: { status: 'PAST_DUE' }
                    });
                    Logger.info('Subscription marked as PAST_DUE due to payment failure', {
                        subscriptionId: dbSub.id,
                        externalId: subscriptionId
                    });
                }
            } catch (err) {
                Logger.error('Failed to update subscription status on payment failure', {
                    subscriptionId,
                    error: toError(err).message
                });
            }
        }

        // Notify the user
        try {
            await sendBillingNotification({
                userId,
                title: 'Payment Failed',
                message: 'Your recent payment could not be processed. Please update your payment method to avoid service interruption.',
                templateKey: 'payment_failed',
                variables: {
                    errorMessage: errorMessage || 'Payment declined',
                    billingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/dashboard/billing`
                }
            });
        } catch (notifErr) {
            Logger.warn('Failed to send payment failure notification', {
                userId,
                paymentId: id,
                error: toError(notifErr).message
            });
        }

        // Notify admins
        try {
            await sendAdminNotificationEmail({
                title: 'Payment Failed',
                message: `A payment has failed.\n\nPayment ID: ${id}\nUser: ${userId}\nError: ${errorMessage || 'Unknown'}\nError Code: ${errorCode || 'N/A'}`
            });
        } catch {
            // Silent - don't fail webhook for admin notification issues
        }
    }

    private async handleInvoicePaymentFailed(invoice: StandardizedInvoice) {
        const { id, subscriptionId, customerId, userEmail } = invoice;
        
        Logger.warn('Invoice payment failed webhook received', {
            invoiceId: id,
            subscriptionId,
            customerId
        });

        // Try to identify the user
        let userId: string | undefined;
        if (customerId) {
            userId = await this.resolveUserByCustomerId(customerId) || undefined;
        }
        if (!userId && userEmail) {
            const userByEmail = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
            userId = userByEmail?.id;
        }

        if (!userId) {
            Logger.warn('Invoice payment failed for unknown user', { invoiceId: id, customerId, userEmail });
            return;
        }

        // If this was a subscription invoice, update subscription status
        if (subscriptionId) {
            try {
                const dbSub = await this.findSubscriptionByProviderId(subscriptionId);
                if (dbSub) {
                    await prisma.subscription.update({
                        where: { id: dbSub.id },
                        data: { status: 'PAST_DUE' }
                    });
                    Logger.info('Subscription marked as PAST_DUE due to invoice payment failure', {
                        subscriptionId: dbSub.id,
                        externalId: subscriptionId,
                        invoiceId: id
                    });
                }
            } catch (err) {
                Logger.error('Failed to update subscription status on invoice payment failure', {
                    invoiceId: id,
                    subscriptionId,
                    error: toError(err).message
                });
            }
        }

        // Notify the user
        try {
            await sendBillingNotification({
                userId,
                title: 'Subscription Payment Failed',
                message: 'We were unable to process your subscription payment. Please update your payment method to continue your service.',
                templateKey: 'invoice_payment_failed',
                variables: {
                    billingUrl: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/dashboard/billing`
                }
            });
        } catch (notifErr) {
            Logger.warn('Failed to send invoice payment failure notification', {
                userId,
                invoiceId: id,
                error: toError(notifErr).message
            });
        }

        // Notify admins
        try {
            await sendAdminNotificationEmail({
                title: 'Subscription Payment Failed',
                message: `A subscription payment has failed.\n\nInvoice ID: ${id}\nSubscription ID: ${subscriptionId || 'N/A'}\nUser: ${userId}\nEmail: ${userEmail || 'N/A'}`
            });
        } catch {
            // Silent - don't fail webhook for admin notification issues
        }
    }

    private async handleRefundProcessed(refund: import('./types').StandardizedRefund) {
        const { id, paymentIntentId, chargeId, amount, currency, status, reason } = refund;
        
        Logger.info('Refund processed webhook received', {
            refundId: id,
            paymentIntentId,
            chargeId,
            amount,
            status
        });

        // Find the payment by externalPaymentId
        const paymentIdToSearch = paymentIntentId || chargeId;
        if (!paymentIdToSearch) {
            Logger.warn('Refund webhook missing payment identifier', { refundId: id });
            return;
        }

        try {
            const payment = await prisma.payment.findFirst({
                where: {
                    OR: [
                        { externalPaymentId: paymentIdToSearch },
                        { stripePaymentIntentId: paymentIdToSearch }
                    ]
                },
                include: { user: { select: { id: true, email: true } } }
            });

            if (!payment) {
                Logger.warn('Refund for unknown payment', { refundId: id, paymentId: paymentIdToSearch });
                return;
            }

            // Update payment status if not already refunded
            if (payment.status !== 'REFUNDED') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'REFUNDED',
                        externalRefundId: id
                    }
                });
                Logger.info('Payment marked as REFUNDED via webhook', {
                    paymentId: payment.id,
                    refundId: id,
                    amount
                });

                // Notify the user
                if (payment.userId) {
                    try {
                        const formattedAmount = `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
                        await sendBillingNotification({
                            userId: payment.userId,
                            title: 'Refund Processed',
                            message: `A refund of ${formattedAmount} has been processed for your payment.`,
                            templateKey: 'refund_processed',
                            variables: {
                                amount: formattedAmount,
                                reason: reason || 'Requested'
                            }
                        });
                    } catch (notifErr) {
                        Logger.warn('Failed to send refund notification', {
                            userId: payment.userId,
                            refundId: id,
                            error: toError(notifErr).message
                        });
                    }
                }
            } else {
                Logger.info('Skipping already-refunded payment', { paymentId: payment.id, refundId: id });
            }
        } catch (err) {
            Logger.error('Error handling refund webhook', { refundId: id, error: toError(err).message });
        }
    }

    private async handleDispute(
        dispute: import('./types').StandardizedDispute,
        eventType: 'dispute.created' | 'dispute.updated'
    ) {
        const { id, paymentIntentId, chargeId, amount, currency, status, reason, evidenceDueBy } = dispute;

        Logger.info('Dispute webhook received', {
            disputeId: id,
            paymentIntentId,
            chargeId,
            status,
            reason,
            eventType
        });

        // Find the payment by externalPaymentId
        const paymentIdToSearch = paymentIntentId || chargeId;
        if (!paymentIdToSearch) {
            Logger.warn('Dispute webhook missing payment identifier', { disputeId: id });
            return;
        }

        try {
            const payment = await prisma.payment.findFirst({
                where: {
                    OR: [
                        { externalPaymentId: paymentIdToSearch },
                        { stripePaymentIntentId: paymentIdToSearch }
                    ]
                },
                include: { user: { select: { id: true, email: true } } }
            });

            if (!payment) {
                Logger.warn('Dispute for unknown payment', { disputeId: id, paymentId: paymentIdToSearch });
                // Still notify admins about disputes for unknown payments
                try {
                    await sendAdminNotificationEmail({
                        title: 'Dispute Filed - Unknown Payment',
                        message: `A dispute has been filed for an unknown payment.\n\nDispute ID: ${id}\nPayment Intent: ${paymentIntentId || 'N/A'}\nCharge: ${chargeId || 'N/A'}\nAmount: ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}\nReason: ${reason}\nStatus: ${status}\nEvidence Due: ${evidenceDueBy ? evidenceDueBy.toISOString() : 'N/A'}`
                    });
                } catch {
                    // Silent
                }
                return;
            }

            // Update payment status for new disputes
            if (eventType === 'dispute.created' && payment.status !== 'DISPUTED') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'DISPUTED'
                    }
                });
                Logger.info('Payment marked as DISPUTED', {
                    paymentId: payment.id,
                    disputeId: id
                });
            }

            // Handle closed disputes
            if (status === 'won') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'SUCCEEDED' }
                });
                Logger.info('Dispute won - payment restored to SUCCEEDED', {
                    paymentId: payment.id,
                    disputeId: id
                });
            } else if (status === 'lost') {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'REFUNDED' }
                });
                Logger.info('Dispute lost - payment marked as REFUNDED', {
                    paymentId: payment.id,
                    disputeId: id
                });
            }

            // Always notify admins about disputes - they're critical
            const formattedAmount = `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
            const userInfo = payment.user?.email || payment.userId || 'Unknown';
            
            try {
                await sendAdminNotificationEmail({
                    title: eventType === 'dispute.created' ? 'New Dispute Filed' : `Dispute Updated: ${status}`,
                    message: `A ${eventType === 'dispute.created' ? 'new dispute has been filed' : 'dispute status has changed'}.\n\nDispute ID: ${id}\nAmount: ${formattedAmount}\nUser: ${userInfo}\nReason: ${reason}\nStatus: ${status}\nEvidence Due: ${evidenceDueBy ? evidenceDueBy.toISOString() : 'N/A'}\nPayment ID: ${payment.id}`
                });
            } catch {
                // Silent - don't fail webhook for admin notification issues
            }
        } catch (err) {
            Logger.error('Error handling dispute webhook', { disputeId: id, error: toError(err).message });
        }
    }

    private async ensureProviderBackedSubscription(
        subscriptionId: string,
        context: { invoice?: StandardizedInvoice; subscription?: StandardizedSubscription } = {}
    ): Promise<SubscriptionWithPlan | null> {
        const existing: SubscriptionWithPlan | null = await this.findSubscriptionByProviderId(subscriptionId);

        if (existing) return existing;

        let providerSubscription: SubscriptionDetails;
        if (context.subscription) {
            providerSubscription = {
                id: context.subscription.id,
                status: context.subscription.status,
                currentPeriodStart: context.subscription.currentPeriodStart,
                currentPeriodEnd: context.subscription.currentPeriodEnd,
                cancelAtPeriodEnd: context.subscription.cancelAtPeriodEnd,
                canceledAt: context.subscription.canceledAt ?? undefined,
                metadata: context.subscription.metadata,
                priceId: context.subscription.priceId,
                customerId: context.subscription.customerId,
                latestInvoice: context.subscription.latestInvoice ? {
                    id: context.subscription.latestInvoice.id,
                    amountPaid: context.subscription.latestInvoice.amountPaid,
                    amountDue: context.subscription.latestInvoice.amountDue,
                    status: context.subscription.latestInvoice.status,
                    paymentIntentId: context.subscription.latestInvoice.paymentIntentId,
                    subtotal: context.subscription.latestInvoice.subtotal,
                    total: context.subscription.latestInvoice.total,
                    amountDiscount: context.subscription.latestInvoice.amountDiscount
                } : null
            };
        } else {
            try {
                providerSubscription = await this.provider.getSubscription(subscriptionId);
            } catch (err) {
                Logger.error('Failed to fetch provider subscription while hydrating missing record', {
                    subscriptionId,
                    error: toError(err).message
                });
                return null;
            }
        }

        const priceId = providerSubscription.priceId;
        if (!priceId) {
            Logger.warn('Cannot ensure subscription without priceId', { subscriptionId });
            return null;
        }

        const plan = await this.findPlanByPriceIdentifier(priceId);

        if (!plan) {
            Logger.warn('Unable to map provider subscription to plan', { subscriptionId, priceId });
            return null;
        }

        const metadataUserId = providerSubscription.metadata?.['userId']
            || providerSubscription.metadata?.['user_id'];
        const invoiceMetadataUserId = context.invoice?.metadata?.['userId']
            || context.invoice?.metadata?.['user_id'];

        let userId = metadataUserId || invoiceMetadataUserId || null;

        if (!userId) {
            const customerId = providerSubscription.customerId || context.invoice?.customerId;
            if (customerId) {
                userId = await this.resolveUserByCustomerId(customerId);
            }
        }

        if (!userId && context.invoice?.userEmail) {
            const userByEmail = await prisma.user.findUnique({
                where: { email: context.invoice.userEmail },
                select: { id: true }
            });
            userId = userByEmail?.id ?? null;
        }

        if (!userId) {
            Logger.warn('Unable to resolve user for provider subscription', {
                subscriptionId,
                customerId: providerSubscription.customerId,
                invoiceId: context.invoice?.id
            });
            return null;
        }

        const organizationMetadataId = providerSubscription.metadata?.['organizationId']
            || providerSubscription.metadata?.['organization_id']
            || context.invoice?.metadata?.['organizationId']
            || context.invoice?.metadata?.['organization_id'];

        let organizationId: string | null = null;
        if (organizationMetadataId) {
            const org = await prisma.organization.findUnique({ where: { id: organizationMetadataId }, select: { id: true } });
            organizationId = org?.id ?? null;
        }

        const startedAt = providerSubscription.currentPeriodStart ?? new Date();
        const expiresAt = providerSubscription.currentPeriodEnd ?? startedAt;
        const normalizedStatus = providerSubscription.status === 'active' || providerSubscription.status === 'trialing'
            ? 'ACTIVE'
            : providerSubscription.status === 'canceled'
                ? 'CANCELLED'
                : 'PENDING';

        const mergedSubIds = this.mergeIdMap(null, this.providerKey, subscriptionId);

        const ensured = await prisma.subscription.upsert({
            where: { externalSubscriptionId: subscriptionId },
            update: {
                userId,
                planId: plan.id,
                organizationId,
                status: normalizedStatus,
                startedAt,
                expiresAt,
                canceledAt: providerSubscription.canceledAt ?? null,
                externalSubscriptionIds: mergedSubIds,
                paymentProvider: this.providerKey
            },
            create: {
                userId,
                planId: plan.id,
                organizationId,
                status: normalizedStatus,
                startedAt,
                expiresAt,
                canceledAt: providerSubscription.canceledAt ?? null,
                externalSubscriptionId: subscriptionId,
                externalSubscriptionIds: mergedSubIds ?? JSON.stringify({ [this.providerKey]: subscriptionId }),
                paymentProvider: this.providerKey
            } satisfies Prisma.SubscriptionUncheckedCreateInput,
            include: { plan: true }
        });

        Logger.info('Hydrated missing subscription from provider data', {
            subscriptionId,
            userId,
            planId: plan.id
        });

        return ensured;
    }



    getDashboardUrl(type: 'payment' | 'subscription' | 'customer', id: string): string {
        return this._provider.getDashboardUrl(type, id);
    }

    async reconcileSubscriptions(batchSize = 100) {
        Logger.info('Starting subscription reconciliation', { provider: this.provider.name });

        const subs = await prisma.subscription.findMany({
            where: {
                paymentProvider: this.provider.name,
                externalSubscriptionId: { not: null }
            },
            select: { id: true, externalSubscriptionId: true }
        });

        let updatedCount = 0;
        let errorCount = 0;

        for (let i = 0; i < subs.length; i += batchSize) {
            const batch = subs.slice(i, i + batchSize);
            await Promise.all(batch.map(async (s) => {
                try {
                    if (!s.externalSubscriptionId) return;
                    const subDetails = await this.provider.getSubscription(s.externalSubscriptionId);

                    if (subDetails.currentPeriodEnd) {
                        await prisma.subscription.update({
                            where: { id: s.id },
                            data: { expiresAt: subDetails.currentPeriodEnd }
                        });
                        updatedCount++;
                    }
                } catch (err) {
                    errorCount++;
                    Logger.warn('Failed to reconcile subscription', {
                        subscriptionId: s.id,
                        externalId: s.externalSubscriptionId,
                        error: toError(err).message
                    });
                }
            }));
        }

        Logger.info('Subscription reconciliation completed', { total: subs.length, updated: updatedCount, errors: errorCount });
        return { total: subs.length, updated: updatedCount, errors: errorCount };
    }
}

// Lazy singleton to avoid provider instantiation at module load time
let _paymentServiceInstance: PaymentService | null = null;

/**
 * Get the payment service singleton.
 * Uses lazy initialization to avoid instantiating the provider at module load time.
 */
export function getPaymentService(): PaymentService {
    if (!_paymentServiceInstance) {
        _paymentServiceInstance = new PaymentService(PaymentProviderFactory.getProvider());
    }
    return _paymentServiceInstance;
}

/**
 * @deprecated Use getPaymentService() instead for lazy initialization.
 * This export is maintained for backward compatibility but may be removed in a future version.
 */
export const paymentService = new Proxy({} as PaymentService, {
    get(_, prop) {
        return (getPaymentService() as unknown as Record<string | symbol, unknown>)[prop];
    }
});
