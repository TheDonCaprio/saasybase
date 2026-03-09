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
import { shouldClearPaidTokensOnRenewal as shouldClearPaidTokensOnRenewalExternal } from '../paidTokens';
import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../organization-access';
import { getOrganizationPlanContext, OrganizationPlanContext } from '../user-plan-context';
import { PLAN_DEFINITIONS } from '../plans';
import { resetOrganizationSharedTokens } from '../teams';
import { markRedemptionConsumed } from '../couponRedemptions';
import { toError } from '../runtime-guards';
import {
    parseProviderIdMap,
    mergeProviderIdMap,
    mapContainsValue
} from '../utils/provider-ids';
import type { Prisma, Plan } from '@prisma/client';
import { PaymentProviderFactory } from './factory';
import { formatCurrency } from '../utils/currency';
import { getActiveCurrencyAsync } from './registry';
import {
    findRecentNotificationByExactMessage as findRecentNotificationByExactMessageExternal,
    findRecentNotificationByTitles as findRecentNotificationByTitlesExternal,
    findRecentCancelledRecurringSubscription as findRecentCancelledRecurringSubscriptionExternal,
    getPendingSubscriptionLookbackDate as getPendingSubscriptionLookbackDateExternal,
} from './subscription-query-helpers';
import {
    prepareCheckoutSessionForProcessing as prepareCheckoutSessionForProcessingExternal,
    resolveCheckoutCompletedRouting as resolveCheckoutCompletedRoutingExternal,
    resolvePaymentSucceededUserContext as resolvePaymentSucceededUserContextExternal,
    resolvePaymentSucceededSubscriptionRouting as resolvePaymentSucceededSubscriptionRoutingExternal,
    buildInvoiceFromSucceededPayment as buildInvoiceFromSucceededPaymentExternal,
    buildCheckoutSessionFromSucceededPayment as buildCheckoutSessionFromSucceededPaymentExternal,
    processSubscriptionCheckout as processSubscriptionCheckoutExternal,
} from './subscription-checkout-context';
import {
    isProviderSubscriptionActiveStatus as isProviderSubscriptionActiveStatusExternal,
    deriveSubscriptionWebhookState as deriveSubscriptionWebhookStateExternal,
} from './subscription-webhook-state';
import { refreshSubscriptionExpiryFromProvider as refreshSubscriptionExpiryFromProviderExternal } from './subscription-expiry-refresh';
import {
    sendActivationNotificationsFromSubscriptionUpdate as sendActivationNotificationsFromSubscriptionUpdateExternal,
    resolveSubscriptionUpdateActivationChange as resolveSubscriptionUpdateActivationChangeExternal,
    processSubscriptionUpdatedPostMutationSideEffects as processSubscriptionUpdatedPostMutationSideEffectsExternal,
} from './subscription-update-notifications';
import {
    handlePaystackActiveSubscriptionPostProcessing as handlePaystackActiveSubscriptionPostProcessingExternal,
    processPaystackSubscriptionUpdatedPostProcessing as processPaystackSubscriptionUpdatedPostProcessingExternal,
    processSubscriptionCreatedPendingPaymentLink as processSubscriptionCreatedPendingPaymentLinkExternal,
    processSubscriptionCreatedExistingRecord as processSubscriptionCreatedExistingRecordExternal,
} from './subscription-paystack-post-processing';
import { cancelSupersededOneTimeSubscriptions as cancelSupersededOneTimeSubscriptionsExternal } from './subscription-cancellation';
import {
    linkPendingPaymentToSubscription as linkPendingPaymentToSubscriptionExternal,
    ensureRazorpayFallbackSubscriptionPaymentOnUpdate as ensureRazorpayFallbackSubscriptionPaymentOnUpdateExternal,
    handleNewlyCreatedActiveSubscriptionUpdate as handleNewlyCreatedActiveSubscriptionUpdateExternal,
    tryRecordPaystackRenewalStyleCharge as tryRecordPaystackRenewalStyleChargeExternal,
    recordPendingSubscriptionPaymentFallback as recordPendingSubscriptionPaymentFallbackExternal,
} from './subscription-payment-linking';
import {
    buildImmediateCancellationData as buildImmediateCancellationDataExternal,
    markSubscriptionActive as markSubscriptionActiveExternal,
    applySubscriptionCreatedExistingRecordUpdate as applySubscriptionCreatedExistingRecordUpdateExternal,
    resolveAndApplySubscriptionUpdatedState as resolveAndApplySubscriptionUpdatedStateExternal,
} from './subscription-state-mutations';
import { consumeCouponRedemptionFromMetadata as consumeCouponRedemptionFromMetadataExternal } from './coupon-redemption-consumption';
import {
    resolveOrganizationContext as resolveOrganizationContextExternal,
    resolveActiveProviderOrganizationIdFromMetadata,
} from './organization-context';
import {
    resolvePlanForOneTimeCheckout as resolvePlanForOneTimeCheckoutExternal,
    resolveOneTimeCheckoutDisposition as resolveOneTimeCheckoutDispositionExternal,
} from './one-time-plan-resolution';
import {
    processInvoicePaidEvent as processInvoicePaidEventExternal,
} from './invoice-payment-recording';
import { resolveOneTimeCheckoutPricing as resolveOneTimeCheckoutPricingExternal } from './one-time-pricing';
import { expirePriorActiveSubscriptionsForOneTimeCheckout as expirePriorActiveSubscriptionsForOneTimeCheckoutExternal } from './one-time-subscription-expiry';
import { processOneTimeNonRecurringExtension as processOneTimeNonRecurringExtensionExternal } from './one-time-extension';
import { processOneTimeRecurringTopup as processOneTimeRecurringTopupExternal } from './one-time-topup';
import { processOneTimeSubscriptionCreation as processOneTimeSubscriptionCreationExternal } from './one-time-subscription-creation';
import { handleInvoiceCreatedCancellation as handleInvoiceCreatedCancellationExternal } from './invoice-created-cancellation';
import { handleInvoiceUpcomingReminder as handleInvoiceUpcomingReminderExternal } from './invoice-upcoming-reminder';
import { handlePaymentFailureEvent as handlePaymentFailureEventExternal } from './payment-failure-handler';
import { handleInvoicePaymentFailureEvent as handleInvoicePaymentFailureEventExternal } from './invoice-payment-failure-handler';
import { handleRefundProcessedEvent as handleRefundProcessedEventExternal } from './refund-processed-handler';
import { handleDisputeEvent as handleDisputeEventExternal } from './dispute-handler';
import {
    ensureProviderBackedSubscriptionRecord as ensureProviderBackedSubscriptionRecordExternal,
    resolveSubscriptionCreatedRecordWithRetry as resolveSubscriptionCreatedRecordWithRetryExternal,
} from './provider-subscription-identity';

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;

const PAYSTACK_PENDING_SUBSCRIPTION_LOOKBACK_MS = 48 * 60 * 60 * 1000;

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

    /**
     * Compute the subscription period in milliseconds for a plan.
     * For auto-renew plans, use recurringInterval × recurringIntervalCount
     * (which matches the provider billing cycle) instead of durationHours.
     * Falls back to durationHours when interval metadata is unavailable.
     */
    private static computePlanPeriodMs(plan: Plan): number {
        if (plan.autoRenew && plan.recurringInterval) {
            const count = plan.recurringIntervalCount ?? 1;
            switch (plan.recurringInterval) {
                case 'day': return count * 24 * 3600 * 1000;
                case 'week': return count * 7 * 24 * 3600 * 1000;
                case 'month': return count * 30 * 24 * 3600 * 1000;
                case 'year': return count * 365 * 24 * 3600 * 1000;
                default: break; // fall through to durationHours
            }
        }
        return plan.durationHours * 3600 * 1000;
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

    private async findPlanByPriceIdentifier(priceId: string, metadataPlanId?: string | null): Promise<Plan | null> {
        const legacy = await prisma.plan.findFirst({ where: { externalPriceId: priceId } });
        if (legacy) return legacy;

        const plans = await prisma.plan.findMany({
            where: { externalPriceIds: { not: null } },
            select: { id: true, externalPriceIds: true }
        });

        const match = plans.find(p => this.mapHasValue(p.externalPriceIds, priceId));
        if (match) return prisma.plan.findUnique({ where: { id: match.id } });

        // Fallback: the priceId may be a dynamically-created discounted plan/price that
        // doesn't exist in the Plan table (e.g. coupon-discounted Paystack/Razorpay plans).
        // Use the original planId from checkout metadata to resolve the plan.
        if (metadataPlanId) {
            const identifier = metadataPlanId.trim();
            if (identifier) {
                const planById = await prisma.plan.findUnique({ where: { id: identifier } });
                if (planById) {
                    Logger.info('Resolved plan via metadata planId fallback (discounted price)', { priceId, metadataPlanId: identifier });
                    return planById;
                }
                // Also try matching by name via PLAN_DEFINITIONS seed
                const seed = PLAN_DEFINITIONS.find(def => def.id === identifier);
                if (seed) {
                    const planByName = await prisma.plan.findFirst({ where: { name: seed.name } });
                    if (planByName) {
                        Logger.info('Resolved plan via metadata planId seed name fallback', { priceId, metadataPlanId: identifier, name: seed.name });
                        return planByName;
                    }
                }
            }
        }

        return null;
    }

    private async findSubscriptionByProviderId(subscriptionId: string): Promise<SubscriptionWithPlan | null> {
        const legacy = await prisma.subscription.findUnique({ where: { externalSubscriptionId: subscriptionId }, include: { plan: true } });
        if (legacy) return legacy;

        const subs = await prisma.subscription.findMany({ where: { externalSubscriptionIds: { not: null } }, include: { plan: true } });
        return subs.find(s => this.mapHasValue(s.externalSubscriptionIds, subscriptionId)) || null;
    }

    private async resolveUserByCustomerId(customerId: string): Promise<string | null> {
        const legacyOr: Array<Record<string, unknown>> = [
            // `externalCustomerId` is legacy and not inherently provider-scoped.
            // Restrict to the currently-active provider to avoid misattribution.
            { externalCustomerId: customerId, paymentProvider: this.providerKey },
        ];

        const legacy = await prisma.user.findFirst({
            where: {
                OR: legacyOr as any,
            },
            select: { id: true },
        });
        if (legacy) return legacy.id;

        const users = await prisma.user.findMany({
            where: { externalCustomerIds: { not: null } },
            select: { id: true, externalCustomerIds: true },
        });
        for (const user of users) {
            const map = (user.externalCustomerIds ?? {}) as Record<string, unknown>;
            if (map[this.providerKey] === customerId) return user.id;
        }

        // Fallback: check PaymentAuthorization table — the authorization from
        // charge.success may have stored the customerId before it was persisted
        // on the User record.
        try {
            const authRecord = await prisma.paymentAuthorization.findFirst({
                where: { customerId, provider: this.providerKey },
                select: { userId: true },
                orderBy: { updatedAt: 'desc' },
            });
            if (authRecord?.userId) return authRecord.userId;
        } catch { /* best-effort */ }

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
        await consumeCouponRedemptionFromMetadataExternal(metadata);
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
        const {
            userId,
            orderId,
            shouldSkip,
        } = await resolvePaymentSucceededUserContextExternal({
            payload,
            ...this.getPaymentSucceededUserContextDeps(),
        });
        if (shouldSkip || !userId) {
            return;
        }

        Logger.info('Handling payment.succeeded for Elements', { id: payload.id, userId });

        const {
            isSubscriptionCheckout,
            resolvedSubscriptionId,
            shouldRouteThroughInvoice,
        } = await resolvePaymentSucceededSubscriptionRoutingExternal({
            payload,
            userId,
            ...this.getPaymentSucceededSubscriptionRoutingDeps(),
        });

        // If we resolved a subscription ID, route through the invoice flow for proper
        // renewal handling (expiry extension, token grants, etc.) instead of checkout flow.
        if (resolvedSubscriptionId && shouldRouteThroughInvoice) {
            Logger.info('Routing Razorpay renewal payment through invoice flow', {
                id: payload.id,
                subscriptionId: resolvedSubscriptionId,
                userId,
            });
            const invoice = buildInvoiceFromSucceededPaymentExternal({
                payload,
                providerKey: this.providerKey,
                resolvedSubscriptionId,
            });
            await this.handleInvoicePaid(invoice);
            return;
        }

        const session = buildCheckoutSessionFromSucceededPaymentExternal({
            payload,
            userId,
            orderId,
            isSubscriptionCheckout,
            resolvedSubscriptionId,
        });

        await this.handleCheckoutCompleted(session);
    }

    private async handleCheckoutCompleted(session: StandardizedCheckoutSession) {
        const { userId, shouldSkip } = await prepareCheckoutSessionForProcessingExternal({
            session,
            ...this.getCheckoutPreparationDeps(),
        });
        if (shouldSkip || !userId) {
            return;
        }

        // Resolve Organization Context
        const activeOrganizationId = resolveActiveProviderOrganizationIdFromMetadata(session.metadata);
        const organizationContext = await this.resolveOrganizationContext(userId, activeOrganizationId);

        const {
            effectiveMode,
            shouldProcessAsSubscription,
        } = await resolveCheckoutCompletedRoutingExternal({
            session,
            userId,
            ...this.getCheckoutCompletedRoutingDeps(),
        });

        if (shouldProcessAsSubscription) {
            Logger.info('Processing as subscription checkout', { sessionId: session.id, userId });
            if (session.subscriptionId) {
                await this.handleSubscriptionCheckout(session, userId, organizationContext);
            } else if (this.providerKey === 'paystack') {
                // Paystack subscription: charge.success fires before subscription.create
                // Record the payment as pending subscription, let subscription.create event create the subscription
                Logger.info('Subscription checkout without subscriptionId (Paystack flow), recording pending payment', {
                    sessionId: session.id,
                    userId
                });
                await this.handlePendingSubscriptionPayment(session, userId);
            } else {
                // Razorpay (and other redirect providers): subscription_id may not be available
                // yet on the payment.  Create an active subscription immediately so the user
                // has access.  If subscription.activated fires later it will upsert with the
                // provider subscription id.
                Logger.info('Subscription checkout without subscriptionId – creating active subscription via one-time path', {
                    sessionId: session.id,
                    userId,
                    provider: this.providerKey,
                });
                await this.handleOneTimeCheckout(session, userId, organizationContext);
            }
        } else {
            Logger.info('Processing as one-time checkout', { sessionId: session.id, userId });
            const oneTimeSession = effectiveMode === session.mode ? session : { ...session, mode: 'payment' as const };
            await this.handleOneTimeCheckout(oneTimeSession, userId, organizationContext);
        }
    }

    private getPaymentSucceededUserContextDeps() {
        return {
            ...this.getCheckoutUserResolutionDeps(),
            getCheckoutSession: this.getProviderCheckoutSession.bind(this),
        };
    }

    private getPaymentSucceededSubscriptionRoutingDeps() {
        return {
            providerKey: this.providerKey,
            getCheckoutSession: this.getProviderCheckoutSession.bind(this),
        };
    }

    private async getProviderCheckoutSession(sessionId: string) {
        return this.provider.getCheckoutSession(sessionId);
    }

    private getCheckoutPreparationDeps() {
        return this.getCheckoutUserResolutionDeps();
    }

    private getCheckoutUserResolutionDeps() {
        return {
            providerKey: this.providerKey,
            resolveUserByCustomerId: this.resolveUserByCustomerId.bind(this),
            ...this.getMergeIdMapDeps(),
        };
    }

    private getCheckoutCompletedRoutingDeps() {
        return {
            providerKey: this.providerKey,
            findPlanByPriceIdentifier: this.findPlanByPriceIdentifier.bind(this),
        };
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

        const plan = await this.findPlanByPriceIdentifier(priceId, session.metadata?.planId);
        if (!plan) {
            Logger.warn('Pending subscription payment: plan not found for priceId', { priceId, userId, metadataPlanId: session.metadata?.planId });
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

        const activeOrganizationId = resolveActiveProviderOrganizationIdFromMetadata(session.metadata);

        const didHandleRenewalStyleCharge = await tryRecordPaystackRenewalStyleChargeExternal({
            session,
            userId,
            plan,
            providerKey: this.providerKey,
            finalPaymentIntent,
            amountCents,
            ...this.getPendingSubscriptionRenewalDeps(activeOrganizationId),
        });
        if (didHandleRenewalStyleCharge) {
            await syncOrganizationEligibilityForUser(userId);
            return;
        }

        await recordPendingSubscriptionPaymentFallbackExternal({
            session,
            userId,
            plan,
            providerKey: this.providerKey,
            finalPaymentIntent,
            amountCents,
            ...this.getPendingSubscriptionFallbackDeps(activeOrganizationId),
        });
    }

    private getPendingSubscriptionRenewalDeps(activeOrganizationId?: string | null) {
        return {
            ...this.getMergeIdMapDeps(),
            ...this.getOrganizationResolutionDeps(activeOrganizationId),
            refreshSubscriptionExpiryFromProvider: this.refreshSubscriptionExpiryFromProvider.bind(this),
            markSubscriptionActive: this.markSubscriptionActive.bind(this),
            findRecentNotificationByExactMessage: this.findRecentNotificationByExactMessage.bind(this),
            consumeCouponRedemptionFromMetadata: this.consumeCouponRedemptionFromMetadata.bind(this),
        };
    }

    private getPendingSubscriptionFallbackDeps(activeOrganizationId?: string | null) {
        return {
            ...this.getMergeIdMapDeps(),
            consumeCouponRedemptionFromMetadata: this.consumeCouponRedemptionFromMetadata.bind(this),
            findRecentCancelledRecurringSubscription: this.findRecentCancelledRecurringSubscription.bind(this),
            ...this.getOrganizationResolutionDeps(activeOrganizationId),
            syncOrganizationEligibilityForUser,
            ...this.getSubscriptionLookupDeps(),
            getPendingSubscriptionLookbackDate: this.getPendingSubscriptionLookbackDate.bind(this),
        };
    }

    private async handleSubscriptionCheckout(session: StandardizedCheckoutSession, userId: string, organizationContext: OrganizationPlanContext | null) {
        await processSubscriptionCheckoutExternal({
            session,
            userId,
            organizationContext,
            providerKey: this.providerKey,
        }, this.getSubscriptionCheckoutDeps());
    }

    private getSubscriptionCheckoutDeps() {
        return {
            getSubscription: this.provider.getSubscription.bind(this.provider),
            findPlanByPriceIdentifier: this.findPlanByPriceIdentifier.bind(this),
            consumeCouponRedemptionFromMetadata: this.consumeCouponRedemptionFromMetadata.bind(this),
            getProviderForRecord: this.getProviderForRecord.bind(this),
            parseIdMap: this.parseIdMap.bind(this),
            buildImmediateCancellationData: this.buildImmediateCancellationData.bind(this),
            computePlanPeriodMs: PaymentService.computePlanPeriodMs,
            ...this.getMergeIdMapDeps(),
            syncOrganizationEligibilityForUser,
        };
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

        const planToUse = await resolvePlanForOneTimeCheckoutExternal({
            priceId,
            metadataPlanId: session.metadata?.planId,
            findPlanByPriceIdentifier: this.findPlanByPriceIdentifier.bind(this),
        });
        if (!planToUse) return;

        await this.consumeCouponRedemptionFromMetadata(session.metadata);

        const now = new Date();
        const periodMs = PaymentService.computePlanPeriodMs(planToUse);
        const {
            resolvedAmountCents,
            resolvedSubtotalCents,
            resolvedDiscountCents,
            couponCode,
        } = resolveOneTimeCheckoutPricingExternal({
            session,
            planToUse,
        });

        // Prefer transactionId for providers like Paystack that use numeric IDs for dashboard URLs
        const finalPaymentIntent: string | undefined = session.transactionId || session.paymentIntentId;

        await expirePriorActiveSubscriptionsForOneTimeCheckoutExternal(userId);

        const { latestActive, mode } = await resolveOneTimeCheckoutDispositionExternal({
            userId,
            now,
            planSupportsOrganizations: planToUse.supportsOrganizations === true,
        });

        if (mode === 'extend_non_recurring' && latestActive) {
            await processOneTimeNonRecurringExtensionExternal({
                latestActive,
                userId,
                planToUse,
                periodMs,
                organizationContext,
                resolvedAmountCents,
                resolvedSubtotalCents,
                resolvedDiscountCents,
                couponCode,
                session,
                finalPaymentIntent,
                ...this.getOneTimeSharedDeps(),
            });
        } else if (mode === 'topup_recurring') {
            await processOneTimeRecurringTopupExternal({
                userId,
                planToUse,
                resolvedAmountCents,
                resolvedSubtotalCents,
                resolvedDiscountCents,
                couponCode,
                session,
                finalPaymentIntent,
                ...this.getOneTimeRecurringTopupDeps(),
            });
        }
        else {
            if (mode === 'replace_non_recurring' && latestActive) {
                const cancellationTime = new Date();
                await prisma.subscription.update({
                    where: { id: latestActive.id },
                    data: this.buildImmediateCancellationData(cancellationTime),
                });

                Logger.info('Replaced active one-time subscription due to plan-family mismatch', {
                    userId,
                    previousSubscriptionId: latestActive.id,
                    previousSupportsOrganizations: latestActive.plan?.supportsOrganizations === true,
                    nextPlanId: planToUse.id,
                    nextSupportsOrganizations: planToUse.supportsOrganizations === true,
                });
            }

            await processOneTimeSubscriptionCreationExternal({
                userId,
                planToUse,
                now,
                periodMs,
                organizationContext,
                resolvedAmountCents,
                resolvedSubtotalCents,
                resolvedDiscountCents,
                couponCode,
                session,
                finalPaymentIntent,
                ...this.getOneTimeSharedDeps(),
            });
        }
    }

    private getOneTimeSharedDeps() {
        return this.getProviderIdentityDeps();
    }

    private getOneTimeRecurringTopupDeps() {
        return {
            ...this.getProviderIdentityDeps(),
            ...this.getOrganizationResolutionDeps(),
        };
    }

    private getProviderIdentityDeps() {
        return {
            providerKey: this.providerKey,
            ...this.getMergeIdMapDeps(),
        };
    }

    private getMergeIdMapDeps() {
        return {
            mergeIdMap: this.mergeIdMap.bind(this),
        };
    }

    private getOrganizationResolutionDeps(activeOrganizationId?: string | null) {
        return {
            resolveOrganizationContext: (userId: string, explicitActiveOrganizationId?: string | null) =>
                this.resolveOrganizationContext(userId, explicitActiveOrganizationId ?? activeOrganizationId ?? null),
        };
    }

    private async resolveOrganizationContext(userId: string, activeOrganizationId?: string | null) {
        return resolveOrganizationContextExternal(userId, activeOrganizationId ?? null);
    }

    private async findRecentNotificationByExactMessage(
        userId: string,
        title: string,
        message: string,
        lookbackMs: number
    ) {
        return findRecentNotificationByExactMessageExternal(userId, title, message, lookbackMs);
    }

    private async findRecentNotificationByTitles(
        userId: string,
        titles: string[],
        lookbackMs: number
    ) {
        return findRecentNotificationByTitlesExternal(userId, titles, lookbackMs);
    }

    private async findRecentCancelledRecurringSubscription(
        userId: string,
        lookbackMs: number,
        excludeSubscriptionId?: string
    ) {
        return findRecentCancelledRecurringSubscriptionExternal(userId, lookbackMs, excludeSubscriptionId);
    }

    private getPendingSubscriptionLookbackDate(): Date {
        return getPendingSubscriptionLookbackDateExternal(PAYSTACK_PENDING_SUBSCRIPTION_LOOKBACK_MS);
    }

    private buildImmediateCancellationData(cancellationTime: Date) {
        return buildImmediateCancellationDataExternal(cancellationTime);
    }

    private async markSubscriptionActive(dbSubscriptionId: string, expiresAt?: Date) {
        await markSubscriptionActiveExternal(dbSubscriptionId, expiresAt);
    }

    private async refreshSubscriptionExpiryFromProvider(opts: {
        dbSubscriptionId: string;
        providerSubscriptionId: string;
        wasLocallyExpired: boolean;
        resurrectOnlyIfFuture: boolean;
        warnMessage: string;
    }): Promise<{ refreshedPeriodEnd: Date | null; resurrected: boolean }> {
        return refreshSubscriptionExpiryFromProviderExternal({
            ...opts,
            provider: this.provider,
            markSubscriptionActive: this.markSubscriptionActive.bind(this),
        });
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
                dbSub = await resolveSubscriptionCreatedRecordWithRetryExternal({
                    subscriptionId,
                    providerKey: this.providerKey,
                    subscription,
                    ensureProviderBackedSubscription: this.ensureProviderBackedSubscription.bind(this),
                });

                if (!dbSub) {
                    Logger.warn('Failed to create subscription from subscription.created event', { subscriptionId });
                    return;
                }

                const status = subscription.status;

                if (this.providerKey === 'paystack' && dbSub.plan.autoRenew === true && isProviderSubscriptionActiveStatusExternal(status)) {
                    await this.cancelSupersededOneTimeSubscriptions(dbSub.userId, dbSub.id);
                }

                // Link pending payment and grant access for new subscriptions
                if (isProviderSubscriptionActiveStatusExternal(status)) {
                    // Link the pending payment to this subscription.
                    // Tokens and notifications were already granted immediately when
                    // the pending payment was created in handlePendingSubscriptionPayment,
                    // so we only sync organization eligibility here.
                    await this.processSubscriptionCreatedPendingPaymentLink(
                        subscriptionId,
                        dbSub,
                        'Processed subscription.created linking',
                    );
                }

                Logger.info('Successfully created subscription from subscription.created event', {
                    subscriptionId,
                    dbSubscriptionId: dbSub.id,
                    userId: dbSub.userId
                });
                return;
            }

            await processSubscriptionCreatedExistingRecordExternal({
                subscriptionId,
                providerKey: this.providerKey,
                dbSub,
                subscription: {
                    status: subscription.status,
                    currentPeriodEnd: subscription.currentPeriodEnd,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                    canceledAt: subscription.canceledAt,
                },
            }, this.getSubscriptionCreatedExistingRecordDeps());
        } catch (err) {
            Logger.error('Error handling subscription.created', { subscriptionId, error: toError(err).message });
        }
    }

    private getSubscriptionCreatedExistingRecordDeps() {
        return {
            deriveSubscriptionWebhookState: deriveSubscriptionWebhookStateExternal,
            applySubscriptionCreatedExistingRecordUpdate: applySubscriptionCreatedExistingRecordUpdateExternal,
            isProviderSubscriptionActiveStatus: isProviderSubscriptionActiveStatusExternal,
            handlePaystackActiveSubscriptionPostProcessing: this.handlePaystackActiveSubscriptionPostProcessing.bind(this),
            processSubscriptionCreatedPendingPaymentLink: processSubscriptionCreatedPendingPaymentLinkExternal,
            linkPendingPaymentToSubscription: this.linkPendingPaymentToSubscription.bind(this),
            syncOrganizationEligibilityForUser,
        };
    }

    private async handleSubscriptionUpdated(subscription: StandardizedSubscription) {
        const subscriptionId = subscription.id;
        const status = subscription.status;
        const currentPeriodEnd = subscription.currentPeriodEnd;

        try {
            const updateState = await resolveAndApplySubscriptionUpdatedStateExternal<SubscriptionWithPlan>({
                subscriptionId,
                status,
                currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                canceledAt: subscription.canceledAt,
                priceId: subscription.priceId,
                metadataPlanId: subscription.metadata?.planId,
                providerKey: this.providerKey,
            }, this.getSubscriptionUpdatedStateResolutionDeps(subscription));

            if (updateState.shouldSkip || !updateState.dbSub) {
                return;
            }

            let { dbSub } = updateState;
            const {
                isNewlyCreated,
                previousStatus,
                previousPlan,
                normalizedStatus,
                effectiveStatus,
            } = updateState;

            dbSub = await this.processSubscriptionUpdatedPostMutation({
                dbSub,
                subscriptionId,
                status,
                effectiveStatus,
                normalizedStatus,
                isNewlyCreated,
                previousStatus,
                previousPlan,
            });

            // Fallback consumption path for providers/flows where the initial subscription
            // purchase may not emit a `checkout.completed` event (e.g. Stripe Elements
            // subscription intents). Safe to call repeatedly (idempotent).
            if (isProviderSubscriptionActiveStatusExternal(status)) {
                await this.consumeCouponRedemptionFromMetadata(subscription.metadata);
            }

            Logger.info('Processed subscription update', { subscriptionId, status, isNewlyCreated });

        } catch (err) {
            Logger.error('Error handling subscription update', { subscriptionId, error: toError(err).message });
        }
    }

    private async processSubscriptionUpdatedPostMutation(params: {
        dbSub: SubscriptionWithPlan;
        subscriptionId: string;
        status: string;
        effectiveStatus: string;
        normalizedStatus: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PENDING';
        isNewlyCreated: boolean;
        previousStatus: string;
        previousPlan: { id: string; priceCents: number } | null;
    }): Promise<SubscriptionWithPlan> {
        return processSubscriptionUpdatedPostMutationSideEffectsExternal({
            dbSub: params.dbSub,
            subscriptionId: params.subscriptionId,
            status: params.status,
            providerKey: this.providerKey,
            effectiveStatus: params.effectiveStatus,
            normalizedStatus: params.normalizedStatus,
            isNewlyCreated: params.isNewlyCreated,
            previousStatus: params.previousStatus,
            previousPlan: params.previousPlan,
        }, this.getSubscriptionUpdatedPostMutationDeps(params.status));
    }

    private getSubscriptionUpdatedPostMutationDeps(status: string) {
        return {
            resolveSubscriptionUpdateActivationChange: resolveSubscriptionUpdateActivationChangeExternal,
            sendActivationNotificationsFromSubscriptionUpdate: sendActivationNotificationsFromSubscriptionUpdateExternal,
            findRecentNotificationByTitles: this.findRecentNotificationByTitles.bind(this),
            ensureRazorpayFallbackSubscriptionPaymentOnUpdate: this.ensureRazorpayFallbackSubscriptionPaymentOnUpdate.bind(this),
            processPaystackSubscriptionUpdatedPostProcessing: this.processPaystackSubscriptionUpdatedPostProcessing.bind(this),
            handleNewlyCreatedActiveSubscriptionUpdate: (currentSub: SubscriptionWithPlan, currentSubscriptionId: string) => this.handleNewlyCreatedActiveSubscriptionUpdate(currentSub, currentSubscriptionId, status),
        };
    }

    private getSubscriptionUpdatedStateResolutionDeps(subscription: StandardizedSubscription) {
        return {
            ...this.getSubscriptionLookupDeps(),
            ensureProviderBackedSubscription: (id: string) => this.ensureProviderBackedSubscription(id, { subscription }),
            findPlanByPriceIdentifier: this.findPlanByPriceIdentifier.bind(this),
            syncOrganizationEligibilityForUser,
        };
    }

    private async ensureRazorpayFallbackSubscriptionPaymentOnUpdate(
        dbSub: SubscriptionWithPlan,
        subscriptionId: string,
    ): Promise<void> {
        await ensureRazorpayFallbackSubscriptionPaymentOnUpdateExternal(dbSub, subscriptionId, this.getProviderIdentityDeps());
    }

    private async processPaystackSubscriptionUpdatedPostProcessing(params: {
        dbSub: SubscriptionWithPlan;
        effectiveStatus: string;
        providerKey: string;
        isNewlyCreated: boolean;
        subscriptionId: string;
    }): Promise<void> {
        await processPaystackSubscriptionUpdatedPostProcessingExternal(
            params,
            {
                handlePaystackActiveSubscriptionPostProcessing: (currentSub, source) => this.handlePaystackActiveSubscriptionPostProcessing(currentSub as SubscriptionWithPlan, source),
            },
        );
    }

    private async handlePaystackActiveSubscriptionPostProcessing(
        dbSub: SubscriptionWithPlan,
        source: 'subscription.created' | 'subscription.updated',
    ): Promise<boolean> {
        return handlePaystackActiveSubscriptionPostProcessingExternal(dbSub, source, this.getPaystackActiveSubscriptionPostProcessingDeps());
    }

    private async linkPendingPaymentToSubscription(dbSub: SubscriptionWithPlan): Promise<boolean> {
        return linkPendingPaymentToSubscriptionExternal(dbSub, {
            getPendingSubscriptionLookbackDate: this.getPendingSubscriptionLookbackDate.bind(this),
        });
    }

    private async processSubscriptionCreatedPendingPaymentLink(
        subscriptionId: string,
        dbSub: SubscriptionWithPlan,
        logMessage: string,
    ): Promise<boolean> {
        return processSubscriptionCreatedPendingPaymentLinkExternal(
            {
                subscriptionId,
                dbSub,
                logMessage,
            },
            this.getSubscriptionCreatedPendingPaymentLinkDeps(),
        );
    }

    private getPaystackActiveSubscriptionPostProcessingDeps() {
        return {
            cancelSupersededOneTimeSubscriptions: this.cancelSupersededOneTimeSubscriptions.bind(this),
            linkPendingPaymentToSubscription: this.linkPendingPaymentToSubscription.bind(this),
        };
    }

    private getSubscriptionCreatedPendingPaymentLinkDeps() {
        return {
            linkPendingPaymentToSubscription: this.linkPendingPaymentToSubscription.bind(this),
            syncOrganizationEligibilityForUser,
        };
    }

    private async handleNewlyCreatedActiveSubscriptionUpdate(
        dbSub: SubscriptionWithPlan,
        subscriptionId: string,
        status: string,
    ): Promise<{ linked: boolean; demoted: boolean }> {
        return handleNewlyCreatedActiveSubscriptionUpdateExternal(dbSub, subscriptionId, {
            providerKey: this.providerKey,
            status,
            cancelSupersededOneTimeSubscriptions: this.cancelSupersededOneTimeSubscriptions.bind(this),
            getPendingSubscriptionLookbackDate: this.getPendingSubscriptionLookbackDate.bind(this),
            syncOrganizationEligibilityForUser,
        });
    }

    private async cancelSupersededOneTimeSubscriptions(userId: string, replacementSubscriptionId: string): Promise<void> {
        await cancelSupersededOneTimeSubscriptionsExternal({
            userId,
            replacementSubscriptionId,
            providerKey: this.providerKey,
            buildImmediateCancellationData: this.buildImmediateCancellationData.bind(this),
        });
    }

    private async handleInvoicePaid(invoice: StandardizedInvoice) {
        const activeOrganizationId = resolveActiveProviderOrganizationIdFromMetadata(invoice.metadata);
        await processInvoicePaidEventExternal<SubscriptionWithPlan>({
            invoice,
            ...this.getInvoicePaidEventDeps(activeOrganizationId),
        });
    }

    private getInvoicePaidEventDeps(activeOrganizationId?: string | null) {
        return {
            ...this.getProviderIdentityDeps(),
            ...this.getSubscriptionLookupDeps(),
            ensureProviderBackedSubscription: this.ensureProviderBackedSubscription.bind(this),
            ...this.getOrganizationResolutionDeps(activeOrganizationId),
            shouldClearPaidTokensOnRenewal: shouldClearPaidTokensOnRenewalExternal,
            refreshSubscriptionExpiryFromProvider: this.refreshSubscriptionExpiryFromProvider.bind(this),
            findRecentNotificationByTitles: this.findRecentNotificationByTitles.bind(this),
            findRecentNotificationByExactMessage: this.findRecentNotificationByExactMessage.bind(this),
        };
    }

    /**
     * Handle invoice.created webhook (Paystack).
     * This fires BEFORE the charge attempt. We use this to implement
     * cancel-at-period-end for providers that don't support it natively.
     * If the subscription is marked with cancelAtPeriodEnd=true in our DB,
     * we disable it now to prevent the charge.
     */
    private async handleInvoiceCreated(invoice: StandardizedInvoice) {
        await handleInvoiceCreatedCancellationExternal({
            invoice,
            getProviderForRecord: this.getProviderForRecord.bind(this),
        });
    }

    private async handleInvoiceUpcoming(invoice: StandardizedInvoice) {
        await handleInvoiceUpcomingReminderExternal({
            invoice,
            ensureProviderBackedSubscription: this.ensureProviderBackedSubscription.bind(this),
        });
    }

    private async handlePaymentFailed(payload: import('./types').StandardizedPaymentFailed) {
        await handlePaymentFailureEventExternal({
            payload,
            ...this.getPaymentFailureEventDeps(),
        });
    }

    private async handleInvoicePaymentFailed(invoice: StandardizedInvoice) {
        await handleInvoicePaymentFailureEventExternal({
            invoice,
            ...this.getPaymentFailureEventDeps(),
        });
    }

    private getPaymentFailureEventDeps() {
        return {
            resolveUserByCustomerId: this.resolveUserByCustomerId.bind(this),
            ...this.getSubscriptionLookupDeps(),
        };
    }

    private async handleRefundProcessed(refund: import('./types').StandardizedRefund) {
        await handleRefundProcessedEventExternal(refund);
    }

    private async handleDispute(
        dispute: import('./types').StandardizedDispute,
        eventType: 'dispute.created' | 'dispute.updated'
    ) {
        await handleDisputeEventExternal(dispute, eventType);
    }

    private async ensureProviderBackedSubscription(
        subscriptionId: string,
        context: { invoice?: StandardizedInvoice; subscription?: StandardizedSubscription } = {}
    ): Promise<SubscriptionWithPlan | null> {
        return ensureProviderBackedSubscriptionRecordExternal({
            subscriptionId,
            context,
            ...this.getEnsureProviderBackedSubscriptionDeps(),
        });
    }

    private getEnsureProviderBackedSubscriptionDeps() {
        return {
            ...this.getSubscriptionLookupDeps(),
            getProviderSubscription: this.provider.getSubscription.bind(this.provider),
            findPlanByPriceIdentifier: this.findPlanByPriceIdentifier.bind(this),
            resolveUserByCustomerId: this.resolveUserByCustomerId.bind(this),
            getPendingSubscriptionLookbackDate: this.getPendingSubscriptionLookbackDate.bind(this),
            ...this.getProviderIdentityDeps(),
        };
    }

    private getSubscriptionLookupDeps() {
        return {
            findSubscriptionByProviderId: this.findSubscriptionByProviderId.bind(this),
        };
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
