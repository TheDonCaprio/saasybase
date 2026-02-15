/**
 * Paystack Payment Provider Implementation
 *
 * Paystack is popular across Africa (Nigeria, Ghana, South Africa, Kenya).
 * API docs: https://paystack.com/docs/api/
 */

import crypto from 'crypto';
import {
    CheckoutOptions,
    CheckoutSessionDetails,
    CheckoutSessionResult,
    CreateCouponOptions,
    CreatePriceOptions,
    CreateProductOptions,
    CreatePromotionCodeOptions,
    PaymentIntentDetails,
    PaymentProvider,
    PaymentProviderFeature,
    PriceDetails,
    ProrationPreviewResult,
    StandardizedCheckoutSession,
    StandardizedInvoice,
    StandardizedSubscription,
    StandardizedWebhookEvent,
    SubscriptionDetails,
    SubscriptionResult,
    SubscriptionUpdateResult,
    UpdateProductOptions,
} from '../types';
import { ConfigurationError, PaymentProviderError, WebhookSignatureVerificationError } from '../errors';
import { prisma } from '../../prisma';

// Paystack response envelopes
interface PaystackResponse<T> {
    status: boolean;
    message: string;
    data: T;
}

interface PaystackTransaction {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: 'success' | 'failed' | 'abandoned' | 'pending';
    gateway_response: string;
    paid_at: string | null;
    created_at: string;
    channel: string;
    customer: {
        id: number;
        customer_code: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
    };
    authorization?: {
        authorization_code: string;
        card_type: string;
        last4: string;
        exp_month: string;
        exp_year: string;
        channel?: string;
        brand?: string;
        bank?: string;
        reusable: boolean;
    };
    metadata?: Record<string, unknown>;
    plan?: {
        id: number;
        plan_code: string;
        name: string;
    };
    subscription?: {
        subscription_code: string;
    };
}

interface PaystackCustomer {
    id: number;
    customer_code: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    metadata?: Record<string, unknown>;
}

interface PaystackPlan {
    id: number;
    plan_code: string;
    name: string;
    description: string | null;
    amount: number;
    interval: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually';
    currency: string;
}

interface PaystackSubscriptionData {
    id: number;
    subscription_code: string;
    email_token: string;
    status: 'active' | 'non-renewing' | 'attention' | 'completed' | 'cancelled';
    amount: number;
    plan: PaystackPlan;
    customer: {
        customer_code: string;
        email: string;
    };
    next_payment_date: string | null;
    created_at: string;
    cancelled_at?: string | null;
    cron_expression: string;
}

interface PaystackProduct {
    id: number;
    product_code: string;
    name: string;
    description: string | null;
    currency: string;
    price: number;
}

interface PaystackRefund {
    id: number;
    transaction: number; // numeric transaction ID
    transaction_reference: string;
    amount: number;
    currency: string;
    status: 'pending' | 'processed' | 'failed';
    created_at: string;
}

interface PaystackWebhookEvent {
    event: string;
    data: PaystackTransaction | PaystackSubscriptionData | Record<string, unknown>;
}

export class PaystackPaymentProvider implements PaymentProvider {
    name = 'paystack';
    /** Default currency for Paystack - can be overridden per-request */
    static readonly DEFAULT_CURRENCY = 'NGN';
    private secretKey: string;
    private baseUrl = 'https://api.paystack.co';

    constructor(secretKey: string) {
        if (!secretKey) {
            throw new ConfigurationError('Paystack secret key is missing');
        }
        this.secretKey = secretKey;
    }

    getWebhookSignatureHeader(): string {
        return 'x-paystack-signature';
    }

    supportsFeature(feature: PaymentProviderFeature): boolean {
        // Paystack has limited feature support compared to Stripe
        const supportedFeatures: PaymentProviderFeature[] = [
            'refunds',
            'webhooks',
            'elements',
            // Paystack supports a hosted subscription management page (update card/cancel)
            // via GET /subscription/:code/manage/link.
            'customer_portal',
            // Note: These are NOT supported natively:
            // - coupons (must be handled in-app)
            // - promotion_codes
            // - proration (must cancel + recreate)
            // - cancel_at_period_end (we work around via invoice.created webhook)
            // - subscription_updates (must cancel + recreate)
            // - disputes (not exposed via API)
            // - trial_periods
        ];
        return supportedFeatures.includes(feature);
    }

    // Helper method for API requests
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<PaystackResponse<T>> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const data = await response.json() as PaystackResponse<T>;

        if (!response.ok || !data.status) {
            throw new PaymentProviderError(data.message || 'Paystack API error');
        }

        return data;
    }

    private generateReference(): string {
        return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    private async initializeWithRetry<T extends Record<string, unknown>, R extends { reference: string }>(payload: T): Promise<R> {
        try {
            const response = await this.request<R>(
                '/transaction/initialize',
                {
                    method: 'POST',
                    body: JSON.stringify(payload),
                },
            );

            return response.data;
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            const isDuplicateReference = /duplicate transaction reference/i.test(message);

            if (!isDuplicateReference) {
                throw err;
            }

            // Retry once with a fresh reference to avoid Paystack reference collisions.
            const retryPayload = {
                ...payload,
                reference: this.generateReference(),
            } as T;

            const retryResponse = await this.request<R>(
                '/transaction/initialize',
                {
                    method: 'POST',
                    body: JSON.stringify(retryPayload),
                },
            );

            return retryResponse.data;
        }
    }

    // ============== Checkout ==============

    async createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult> {
        if (!opts.amount && !opts.priceId) {
            throw new PaymentProviderError('Either amount or priceId must be provided');
        }

        const reference = opts.dedupeKey || this.generateReference();

        const payload: {
            email?: string;
            amount?: number;
            reference: string;
            callback_url?: string;
            metadata: Record<string, unknown>;
            currency?: string;
            plan?: string;
            customer?: string;
        } = {
            email: opts.customerEmail,
            amount: opts.amount, // Smallest unit
            reference,
            callback_url: opts.successUrl,
            metadata: {
                userId: opts.userId,
                cancel_action: opts.cancelUrl,
                // Store mode and priceId in metadata for webhook processing
                // Paystack may not include plan object in charge.success webhook
                checkoutMode: opts.mode || 'payment',
                planCode: opts.mode === 'subscription' ? opts.priceId : undefined,
                ...opts.metadata,
            },
        };

        if (opts.currency) payload.currency = opts.currency.toUpperCase();
        if (opts.mode === 'subscription' && opts.priceId) payload.plan = opts.priceId;
        if (opts.customerId) payload.customer = opts.customerId;

        // Debug logging for subscription checkout
        if (opts.mode === 'subscription') {
            console.log('[Paystack] Creating subscription checkout:', {
                mode: opts.mode,
                priceId: opts.priceId,
                planInPayload: payload.plan,
                hasAmount: !!payload.amount,
                reference,
            });
        }

        const response = await this.initializeWithRetry<typeof payload, { authorization_url: string; access_code: string; reference: string }>(payload);

        return {
            url: response.authorization_url,
            id: response.reference,
        };
    }

    async getCheckoutSession(reference: string): Promise<CheckoutSessionDetails> {
        const response = await this.request<PaystackTransaction>(
            `/transaction/verify/${encodeURIComponent(reference)}`,
        );

        const tx = response.data;

        return {
            id: tx.reference,
            clientReferenceId: tx.metadata?.userId as string | undefined,
            metadata: tx.metadata as Record<string, string> | undefined,
            paymentIntentId: tx.reference,
            subscriptionId: tx.subscription?.subscription_code,
            amountTotal: tx.amount,
            paymentStatus: tx.status === 'success' ? 'paid' : 'unpaid',
            lineItems: tx.plan ? [{ priceId: tx.plan.plan_code }] : undefined,
        };
    }

    // ============== Customer Management ==============

    async createCustomer(userId: string, email: string, name?: string): Promise<string> {
        const [firstName, ...lastNameParts] = (name || '').split(' ');

        const response = await this.request<PaystackCustomer>(
            '/customer',
            {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    first_name: firstName || undefined,
                    last_name: lastNameParts.join(' ') || undefined,
                    metadata: { userId },
                }),
            },
        );

        return response.data.customer_code;
    }

    async updateCustomer(customerId: string, data: { email?: string; name?: string }): Promise<void> {
        const [firstName, ...lastNameParts] = (data.name || '').split(' ');
        const payload: Record<string, unknown> = {};

        if (data.email) payload.email = data.email;
        if (firstName) payload.first_name = firstName;
        if (lastNameParts.length) payload.last_name = lastNameParts.join(' ');

        await this.request<PaystackCustomer>(
            `/customer/${encodeURIComponent(customerId)}`,
            {
                method: 'PUT',
                body: JSON.stringify(payload),
            },
        );
    }

    async createCustomerPortalSession(customerId: string, returnUrl: string): Promise<string> {
        void returnUrl;
        // Paystack's "portal" is actually a hosted subscription management page.
        // It requires a subscription code like SUB_xxx (not a customer code).
        if (!customerId || !customerId.startsWith('SUB_')) {
            throw new PaymentProviderError('Paystack customer portal requires an active subscription code');
        }

        const response = await this.request<{ link: string }>(
            `/subscription/${encodeURIComponent(customerId)}/manage/link`,
            { method: 'GET' },
        );

        const url = response.data?.link;
        if (!url) {
            throw new PaymentProviderError('Paystack did not return a subscription management link');
        }

        return url;
    }

    // ============== Subscription Management ==============

    async cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult> {
        // Fetch full subscription data including email_token (required for disable/enable)
        const response = await this.request<PaystackSubscriptionData>(
            `/subscription/${encodeURIComponent(subscriptionId)}`,
        );
        const subData = response.data;

        const nextPayment = subData.next_payment_date ? new Date(subData.next_payment_date) : new Date();

        // Paystack lacks native "cancel_at_period_end" API like Stripe.
        // We MUST call /subscription/disable to prevent future charges.
        // The difference between schedule vs force cancel is handled in the local DB:
        // - Schedule cancel: expiresAt = currentPeriodEnd (user keeps access until then)
        // - Force cancel: expiresAt = now() (immediate access revocation)
        //
        // Paystack's disable sets status to "non-renewing" (user keeps access),
        // then becomes "cancelled" on the next payment date.

        // Always disable to prevent future charges
        await this.request<{ status: boolean }>(
            '/subscription/disable',
            {
                method: 'POST',
                body: JSON.stringify({
                    code: subscriptionId,
                    token: subData.email_token,
                }),
            },
        );

        if (immediately === false) {
            // Schedule cancel: subscription disabled at provider, but user keeps local access until period end
            return {
                id: subData.subscription_code,
                status: 'active', // Still active locally until period end
                canceledAt: new Date(), // Mark when cancellation was requested
                expiresAt: nextPayment,
                currentPeriodEnd: nextPayment,
            };
        }

        // Immediate/force cancellation - also update status immediately
        const updatedSub = await this.getSubscription(subscriptionId);

        return {
            id: updatedSub.id,
            status: updatedSub.status,
            canceledAt: updatedSub.canceledAt || new Date(),
            expiresAt: updatedSub.currentPeriodEnd,
            currentPeriodEnd: updatedSub.currentPeriodEnd,
        };
    }

    async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
        // Fetch subscription to get email_token (required for enable API)
        const response = await this.request<PaystackSubscriptionData>(
            `/subscription/${encodeURIComponent(subscriptionId)}`,
        );
        const subData = response.data;

        // Paystack cannot re-enable a subscription once it reaches the terminal cancelled/completed state.
        // Fail fast with a clearer error so callers can return a friendly 409 instead of a 500.
        if (subData.status === 'cancelled' || subData.status === 'completed') {
            throw new PaymentProviderError('Subscription has been cancelled, and cannot be reactivated');
        }

        await this.request<{ status: boolean }>(
            '/subscription/enable',
            {
                method: 'POST',
                body: JSON.stringify({
                    code: subscriptionId,
                    token: subData.email_token, // ✅ Use the actual email_token
                }),
            },
        );

        const sub = await this.getSubscription(subscriptionId);

        return {
            id: sub.id,
            status: sub.status,
            canceledAt: null,
            expiresAt: sub.currentPeriodEnd,
        };
    }

    async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
        const response = await this.request<PaystackSubscriptionData>(
            `/subscription/${encodeURIComponent(subscriptionId)}`,
        );

        const sub = response.data;
        const nextPayment = sub.next_payment_date ? new Date(sub.next_payment_date) : new Date();
        const createdAt = new Date(sub.created_at);

        return {
            id: sub.subscription_code,
            status: this.mapSubscriptionStatus(sub.status),
            currentPeriodEnd: nextPayment,
            currentPeriodStart: createdAt,
            cancelAtPeriodEnd: sub.status === 'non-renewing',
            canceledAt: sub.cancelled_at ? new Date(sub.cancelled_at) : null,
            metadata: {},
            priceId: sub.plan.plan_code,
            customerId: sub.customer.customer_code,
            latestInvoice: null,
        };
    }

    /**
     * Pay-at-renewal plan switching for Paystack:
     * - Disable the current subscription so it will not renew
     * - Create a new subscription for the target plan with start_date = current period end
     *
     * This avoids charging the customer immediately (aligns provider+DB boundaries at renewal).
     */
    async scheduleSubscriptionPlanChange(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
        // Load current subscription details for customer_code and renewal boundary.
        const current = await this.getSubscription(subscriptionId);
        const customerCode = current.customerId;
        if (!customerCode) {
            throw new PaymentProviderError('PAYSTACK_CUSTOMER_MISSING');
        }

        // Require a reusable authorization so Paystack can debit at the scheduled start_date.
        const authorization = await prisma.paymentAuthorization.findFirst({
            where: {
                userId,
                provider: 'paystack',
                reusable: true,
                OR: [{ customerId: customerCode }, { customerId: null }],
            },
            orderBy: { updatedAt: 'desc' },
            select: { authorizationCode: true },
        });

        if (!authorization?.authorizationCode) {
            throw new PaymentProviderError('PAYSTACK_AUTHORIZATION_REQUIRED');
        }

        // Disable current subscription first; if creation fails, we attempt to roll back by re-enabling.
        const cancelResult = await this.cancelSubscription(subscriptionId, false);
        const startDate = cancelResult.currentPeriodEnd ?? current.currentPeriodEnd;

        try {
            await this.request<Record<string, unknown>>(
                '/subscription',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        customer: customerCode,
                        plan: newPriceId,
                        authorization: authorization.authorizationCode,
                        start_date: startDate.toISOString(),
                    }),
                },
            );
        } catch (err) {
            try {
                await this.undoCancelSubscription(subscriptionId);
            } catch (rollbackErr) {
                // Rollback also failed — the user may have NO active subscription.
                // Log prominently so admins can intervene.
                console.error('[Paystack] CRITICAL: Scheduled plan change failed AND rollback failed. User may have no active subscription.', {
                    subscriptionId,
                    userId,
                    originalError: err instanceof Error ? err.message : String(err),
                    rollbackError: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
                });
            }

            void err;
            throw new PaymentProviderError('PAYSTACK_SCHEDULE_FAILED');
        }

        return { success: true, newPeriodEnd: startDate };
    }

    private mapSubscriptionStatus(status: PaystackSubscriptionData['status']): string {
        switch (status) {
            case 'active':
                return 'active';
            case 'non-renewing':
                return 'active';
            case 'attention':
                return 'past_due';
            case 'completed':
            case 'cancelled':
                return 'canceled';
            default:
                return status;
        }
    }

    private safeParseDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    // ============== Webhooks ==============

    async constructWebhookEvent(requestBody: Buffer, signature: string, secret?: string): Promise<StandardizedWebhookEvent> {
        const signingSecret = secret || this.secretKey;
        const hash = crypto.createHmac('sha512', signingSecret).update(requestBody).digest('hex');

        if (hash !== signature) {
            throw new WebhookSignatureVerificationError('Invalid webhook signature');
        }

        const event = JSON.parse(requestBody.toString()) as PaystackWebhookEvent;
        return this.normalizeEvent(event);
    }

    private async normalizeEvent(event: PaystackWebhookEvent): Promise<StandardizedWebhookEvent> {
        switch (event.event) {
            case 'charge.success': {
                let tx = event.data as PaystackTransaction;
                
                // Debug: Log the full transaction data to see what Paystack actually sends
                console.log('[Paystack] charge.success webhook received:', {
                    reference: tx.reference,
                    hasPlan: !!tx.plan,
                    planObject: tx.plan, // Log the entire plan object to see its structure
                    planCode: tx.plan?.plan_code,
                    hasSubscription: !!tx.subscription,
                    subscriptionCode: tx.subscription?.subscription_code,
                    // CRITICAL: Check if authorization is reusable - subscriptions ONLY work with reusable=true
                    authorizationReusable: tx.authorization?.reusable,
                    authorizationCode: tx.authorization?.authorization_code,
                    metadata: tx.metadata,
                    metadataCheckoutMode: tx.metadata?.checkoutMode,
                    metadataPlanCode: tx.metadata?.planCode,
                    metadataPriceId: tx.metadata?.priceId,
                });
                
                // IMPORTANT: If authorization is not reusable, Paystack will NOT create a subscription
                // even if a plan was passed to /transaction/initialize
                if (tx.authorization && !tx.authorization.reusable) {
                    console.warn('[Paystack] WARNING: Authorization is NOT reusable - subscription will NOT be created by Paystack');
                }
                
                // Determine mode: first from tx.plan, then from metadata (stored during checkout creation)
                // Paystack doesn't always include the plan object in charge.success webhook
                const metadataMode = tx.metadata?.checkoutMode as 'subscription' | 'payment' | undefined;
                const mode = tx.plan ? 'subscription' : (metadataMode || 'payment');
                
                // Get plan code from tx.plan, or from metadata if not present
                // Check planCode first (our explicit field), then priceId (embedded checkout passes this)
                let planCode = tx.plan?.plan_code || (tx.metadata?.planCode as string | undefined) || (tx.metadata?.priceId as string | undefined);

                // Fallback: webhook may omit plan/subscription. Re-verify transaction to hydrate missing fields.
                if ((!planCode || !tx.subscription?.subscription_code) && tx.reference) {
                    try {
                        const verify = await this.request<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(tx.reference)}`);
                        tx = verify.data;
                        planCode = planCode || tx.plan?.plan_code || (tx.metadata?.planCode as string | undefined) || (tx.metadata?.priceId as string | undefined);
                        console.log('[Paystack] verify transaction hydrate', {
                            reference: tx.reference,
                            hydratedPlan: tx.plan,
                            hydratedPlanCode: tx.plan?.plan_code,
                            hydratedSubscription: tx.subscription,
                        });
                    } catch (err) {
                        console.warn('[Paystack] Failed to verify transaction for missing plan/subscription', {
                            reference: tx.reference,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                }
                
                console.log('[Paystack] Normalized values:', { mode, planCode });
                
                const session: StandardizedCheckoutSession = {
                    id: tx.reference,
                    userId: tx.metadata?.userId as string | undefined,
                    userEmail: tx.customer.email,
                    customerId: tx.customer?.customer_code,
                    customerIdsByProvider: tx.customer?.customer_code ? { paystack: tx.customer.customer_code } : undefined,
                    mode,
                    subscriptionId: tx.subscription?.subscription_code,
                    metadata: tx.metadata as Record<string, string> | undefined,
                    authorization: tx.authorization?.authorization_code
                        ? {
                            code: tx.authorization.authorization_code,
                            reusable: tx.authorization.reusable,
                            channel: tx.authorization.channel,
                            brand: tx.authorization.brand,
                            bank: tx.authorization.bank,
                            last4: tx.authorization.last4,
                            expMonth: tx.authorization.exp_month,
                            expYear: tx.authorization.exp_year,
                        }
                        : undefined,
                    paymentIntentId: tx.reference,
                    // Store numeric Paystack transaction ID for dashboard URLs
                    transactionId: String(tx.id),
                    amountTotal: tx.amount,
                    currency: tx.currency,
                    paymentStatus: 'paid',
                    lineItems: planCode ? [{ priceId: planCode, quantity: 1 }] : undefined,
                };

                return {
                    type: 'checkout.completed',
                    payload: session,
                    originalEvent: event,
                };
            }

            case 'charge.failed': {
                const tx = event.data as PaystackTransaction;
                return {
                    type: 'payment.failed',
                    payload: {
                        id: tx.reference,
                        amount: tx.amount,
                        currency: tx.currency,
                        status: 'failed',
                        errorMessage: tx.gateway_response || 'Payment failed',
                        customerId: tx.customer?.customer_code,
                        metadata: tx.metadata as Record<string, string> | undefined,
                        userId: tx.metadata?.userId as string | undefined
                    },
                    originalEvent: event,
                };
            }

            case 'subscription.create': {
                // Paystack subscription.create - fires after initial charge.success
                const sub = event.data as PaystackSubscriptionData;
                console.log('[Paystack] subscription.create webhook received:', sub);

                const nextPayment = this.safeParseDate(sub.next_payment_date) ?? new Date();
                const createdAt = this.safeParseDate(sub.created_at) ?? new Date();
                const rawStartDate = (sub as unknown as { start_date?: string | null }).start_date;
                const startDate = this.safeParseDate(rawStartDate) ?? createdAt;
                const cancelledAt = this.safeParseDate(sub.cancelled_at);

                const standardSub: StandardizedSubscription = {
                    id: sub.subscription_code,
                    status: this.mapSubscriptionStatus(sub.status),
                    currentPeriodStart: startDate,
                    currentPeriodEnd: nextPayment,
                    canceledAt: cancelledAt,
                    cancelAtPeriodEnd: sub.status === 'non-renewing',
                    customerId: sub.customer.customer_code,
                    priceId: sub.plan.plan_code,
                    metadata: {},
                };

                return {
                    type: 'subscription.created',
                    payload: standardSub,
                    originalEvent: event,
                };
            }

            case 'subscription.not_renew':
            case 'subscription.disable': {
                const sub = event.data as PaystackSubscriptionData;
                const nextPayment = this.safeParseDate(sub.next_payment_date) ?? new Date();
                const createdAt = this.safeParseDate(sub.created_at) ?? new Date();
                const cancelledAt = this.safeParseDate(sub.cancelled_at);

                const standardSub: StandardizedSubscription = {
                    id: sub.subscription_code,
                    status: this.mapSubscriptionStatus(sub.status),
                    currentPeriodStart: createdAt,
                    currentPeriodEnd: nextPayment,
                    canceledAt: cancelledAt,
                    cancelAtPeriodEnd: sub.status === 'non-renewing',
                    customerId: sub.customer.customer_code,
                    priceId: sub.plan.plan_code,
                    metadata: {},
                };

                return {
                    type: 'subscription.updated',
                    payload: standardSub,
                    originalEvent: event,
                };
            }

            case 'invoice.create': {
                // invoice.create fires BEFORE payment - used for cancel-at-period-end logic
                const invoiceData = event.data as Record<string, unknown>;
                const invoice: StandardizedInvoice = {
                    id: (invoiceData.invoice_code as string) || '',
                    amountPaid: 0, // Not paid yet
                    amountDue: (invoiceData.amount as number) || 0,
                    amountDiscount: 0,
                    subtotal: (invoiceData.amount as number) || 0,
                    total: (invoiceData.amount as number) || 0,
                    currency: (invoiceData.currency as string) || PaystackPaymentProvider.DEFAULT_CURRENCY,
                    status: 'draft', // Invoice created but not charged yet
                    subscriptionId: (invoiceData.subscription as { subscription_code?: string })?.subscription_code,
                    customerId: (invoiceData.customer as { customer_code?: string })?.customer_code,
                    metadata: {},
                };

                return {
                    type: 'invoice.created',
                    payload: invoice,
                    originalEvent: event,
                };
            }

            case 'invoice.payment_failed':
            case 'invoice.update': {
                const invoiceData = event.data as Record<string, unknown>;
                const invoiceCode = (invoiceData.invoice_code as string) || '';
                const transaction = invoiceData.transaction as
                    | { reference?: string; id?: string | number }
                    | number
                    | undefined;
                const transactionRef =
                    (invoiceData.transaction_reference as string | undefined) ||
                    (invoiceData.reference as string | undefined) ||
                    (typeof transaction === 'object' ? transaction?.reference : undefined);
                const paymentIntentId = transactionRef || invoiceCode || undefined;

                const amount = (invoiceData.amount as number) || 0;
                const isFailed = event.event === 'invoice.payment_failed';
                const invoice: StandardizedInvoice = {
                    id: invoiceCode,
                    amountPaid: amount,
                    amountDue: isFailed ? amount : 0,
                    amountDiscount: 0,
                    subtotal: amount,
                    total: amount,
                    currency: (invoiceData.currency as string) || PaystackPaymentProvider.DEFAULT_CURRENCY,
                    status: isFailed ? 'unpaid' : 'paid',
                    paymentIntentId,
                    subscriptionId: (invoiceData.subscription as { subscription_code?: string })?.subscription_code,
                    customerId: (invoiceData.customer as { customer_code?: string })?.customer_code,
                    metadata: {},
                };

                if (isFailed) {
                    return {
                        type: 'invoice.payment_failed',
                        payload: invoice,
                        originalEvent: event,
                    };
                }

                return {
                    type: 'invoice.payment_succeeded',
                    payload: invoice,
                    originalEvent: event,
                };
            }

            case 'refund.processed':
            case 'refund.pending': {
                const refundData = event.data as Record<string, unknown>;

                // IMPORTANT: our app's internal handler for `refund.processed` immediately
                // marks the local payment record as REFUNDED. Therefore we only emit
                // `refund.processed` for finalized refunds.
                if (event.event !== 'refund.processed') {
                    return {
                        type: 'ignored',
                        payload: refundData,
                        originalEvent: event,
                    };
                }

                // Paystack sends transaction_reference as a string field, not a nested object
                const transactionRef = refundData.transaction_reference as string | undefined;
                return {
                    type: 'refund.processed',
                    payload: {
                        id: String(refundData.id || ''),
                        paymentIntentId: transactionRef,
                        amount: (refundData.amount as number) || 0,
                        currency: (refundData.currency as string) || PaystackPaymentProvider.DEFAULT_CURRENCY,
                        status: 'succeeded',
                        reason: (refundData.merchant_note as string) || undefined,
                        metadata: {}
                    },
                    originalEvent: event,
                };
            }

            case 'paymentrequest.pending':
            case 'paymentrequest.success':
            case 'transfer.success':
            case 'transfer.failed':
            case 'transfer.reversed':
                return {
                    type: 'ignored',
                    payload: event.data as Record<string, unknown>,
                    originalEvent: event,
                };

            default:
                return {
                    type: 'other',
                    payload: event.data as Record<string, unknown>,
                    originalEvent: event,
                };
        }
    }

    // ============== Product & Price Management ==============

    /**
     * Create a product in Paystack.
     * Note: For subscriptions, Paystack plans are self-contained (no separate product needed).
     * This method is primarily for one-time payment products, but Paystack requires a price > 0.
     * For subscription plans, we return a placeholder and let createPrice handle everything.
     */
    async createProduct(options: CreateProductOptions): Promise<string> {
        // For Paystack, products are only really needed for one-time payments.
        // Subscription plans are self-contained. We'll create a placeholder product code
        // that will be replaced by the plan_code when createPrice is called.
        // This avoids the "Price is required" error when price is 0.
        
        // Try to create a real product only if we have metadata indicating this is for one-time
        // Otherwise, return a placeholder that will be overwritten by createPrice
        try {
            const response = await this.request<PaystackProduct>(
                '/product',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name: options.name,
                        description: options.description || options.name,
                        price: 100, // Minimum price in kobo (1 unit) - Paystack requires non-zero
                        currency: PaystackPaymentProvider.DEFAULT_CURRENCY,
                    }),
                },
            );
            return response.data.product_code;
        } catch {
            // If product creation fails, return a placeholder.
            // For subscriptions, createPrice will create the plan which acts as product+price.
            return `pending_${Date.now()}`;
        }
    }

    async updateProduct(productId: string, options: UpdateProductOptions): Promise<void> {
        await this.request<PaystackProduct>(
            `/product/${encodeURIComponent(productId)}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    name: options.name,
                    description: options.description,
                }),
            },
        );
    }

    async findProduct(name: string): Promise<string | null> {
        try {
            const response = await this.request<PaystackProduct[]>(
                '/product',
            );
            const product = response.data.find(p => p.name === name);
            return product?.product_code || null;
        } catch {
            return null;
        }
    }

    async createPrice(options: CreatePriceOptions): Promise<PriceDetails> {
        const intervalMap: Record<string, string> = {
            day: 'daily',
            week: 'weekly',
            month: 'monthly',
            year: 'annually',
        };

        const recurringInterval = options.recurring?.interval;
        const intervalCount = Math.max(1, Math.floor(options.recurring?.intervalCount || 1));

        let paystackInterval = recurringInterval ? (intervalMap[recurringInterval] || 'monthly') : 'monthly';
        if (recurringInterval === 'month') {
            if (intervalCount === 3) paystackInterval = 'quarterly';
            else if (intervalCount === 6) paystackInterval = 'biannually';
            else if (intervalCount !== 1) {
                console.warn(`[Paystack] intervalCount=${intervalCount} months not supported; falling back to monthly.`);
                paystackInterval = 'monthly';
            }
        } else if (recurringInterval && intervalCount !== 1) {
            // Paystack does not support interval counts for daily/weekly/annually via plan creation.
            console.warn(`[Paystack] intervalCount=${intervalCount} ignored for interval=${recurringInterval}; using ${paystackInterval}.`);
        }

        const response = await this.request<PaystackPlan>(
            '/plan',
            {
                method: 'POST',
                body: JSON.stringify({
                    name: options.metadata?.name || 'Plan',
                    amount: options.unitAmount,
                    interval: options.recurring ? paystackInterval : 'monthly',
                    currency: options.currency.toUpperCase(),
                }),
            },
        );

        return {
            id: response.data.plan_code,
            unitAmount: response.data.amount,
            currency: response.data.currency,
            recurring: options.recurring
                ? {
                    interval: options.recurring.interval,
                    intervalCount: options.recurring.intervalCount || 1,
                }
                : null,
            productId: response.data.plan_code,
            type: options.recurring ? 'recurring' : 'one_time',
        };
    }

    async verifyPrice(priceId: string): Promise<PriceDetails> {
        const response = await this.request<PaystackPlan>(
            `/plan/${encodeURIComponent(priceId)}`,
        );

        const plan = response.data;
        const intervalMap: Record<string, 'day' | 'week' | 'month' | 'year'> = {
            daily: 'day',
            weekly: 'week',
            monthly: 'month',
            quarterly: 'month',
            biannually: 'month',
            annually: 'year',
        };

        return {
            id: plan.plan_code,
            unitAmount: plan.amount,
            currency: plan.currency,
            recurring: {
                interval: intervalMap[plan.interval] || 'month',
                intervalCount: plan.interval === 'quarterly' ? 3 : plan.interval === 'biannually' ? 6 : 1,
            },
            productId: plan.plan_code,
            type: 'recurring',
        };
    }

    async archivePrice(priceId: string): Promise<void> {
        console.warn(`Paystack does not support archiving plans. Plan ${priceId} cannot be archived.`);
    }

    async createCoupon(opts: CreateCouponOptions): Promise<string> {
        void opts;
        throw new PaymentProviderError('Paystack does not support native coupons. Handle discounts in-app.');
    }

    async deleteCoupon(couponId: string): Promise<void> {
        void couponId;
        throw new PaymentProviderError('Paystack does not support native coupons.');
    }

    async createPromotionCode(opts: CreatePromotionCodeOptions): Promise<string> {
        void opts;
        throw new PaymentProviderError('Paystack does not support promotion codes.');
    }

    async updatePromotionCode(id: string, active: boolean): Promise<void> {
        void id;
        void active;
        throw new PaymentProviderError('Paystack does not support promotion codes.');
    }

    // ============== Proration & Updates ==============

    /**
     * Get proration preview for Paystack.
     * Paystack doesn't support native proration or inline plan updates,
     * so we do not attempt any credit estimation.
     */
    async getProrationPreview(subscriptionId: string, newPriceId: string, userId: string): Promise<ProrationPreviewResult> {
        void subscriptionId;
        void newPriceId;
        void userId;
        return {
            prorationEnabled: false,
            amountDue: 0,
            currency: PaystackPaymentProvider.DEFAULT_CURRENCY,
            lineItems: [],
            message: 'Plan change requires new checkout.',
        };
    }

    /**
     * Update subscription plan for Paystack.
     * This is not natively supported - caller should use cancel + new checkout flow.
     */
    async updateSubscriptionPlan(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
        void subscriptionId;
        void newPriceId;
        void userId;
        throw new PaymentProviderError('Paystack does not support inline plan changes. Use cancel + new checkout.');
    }

    // ============== Billing & Refunds ==============

    async refundPayment(paymentId: string, amount?: number, reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }> {
        // paymentId can be either a transaction reference (string like "re4lyvq3s3") 
        // or a numeric transaction ID (string like "4099260516")
        // - /transaction/verify/:reference only accepts reference strings
        // - /transaction/:id only accepts numeric IDs
        // - /refund accepts either reference or id
        const isNumericId = /^\d+$/.test(paymentId);
        
        // Verify transaction exists using the appropriate endpoint
        if (isNumericId) {
            // Use fetch endpoint for numeric IDs
            await this.request<PaystackTransaction>(
                `/transaction/${encodeURIComponent(paymentId)}`,
            );
        } else {
            // Use verify endpoint for reference strings
            await this.request<PaystackTransaction>(
                `/transaction/verify/${encodeURIComponent(paymentId)}`,
            );
        }

        const response = await this.request<PaystackRefund>(
            '/refund',
            {
                method: 'POST',
                body: JSON.stringify({
                    transaction: paymentId,
                    amount,
                    merchant_note: reason,
                }),
            },
        );

        return {
            id: response.data.id.toString(),
            amount: response.data.amount,
            status: response.data.status,
            created: new Date(response.data.created_at),
        };
    }

    async getRefundDetails(paymentId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null> {
        try {
            const response = await this.request<PaystackRefund[]>(
                '/refund',
            );
            
            // paymentId can be either a numeric transaction ID or a reference string
            const isNumericId = /^\d+$/.test(paymentId);
            const refund = response.data.find(r => 
                isNumericId 
                    ? r.transaction.toString() === paymentId
                    : r.transaction_reference === paymentId
            );

            if (!refund) return null;

            return {
                id: refund.id.toString(),
                amount: refund.amount,
                status: refund.status,
                created: new Date(refund.created_at),
            };
        } catch {
            return null;
        }
    }

    async getPaymentReceiptUrl(paymentId: string): Promise<string | null> {
        void paymentId;
        return null;
    }

    async getInvoiceUrl(invoiceId: string): Promise<string | null> {
        void invoiceId;
        return null;
    }

    getDashboardUrl(type: 'payment' | 'subscription' | 'customer', id: string): string {
        const baseUrl = 'https://dashboard.paystack.com';
        switch (type) {
            case 'payment':
                // Paystack dashboard uses numeric transaction ID with /analytics suffix
                return `${baseUrl}/#/transactions/${id}/analytics`;
            case 'subscription':
                return `${baseUrl}/#/subscriptions/${id}`;
            case 'customer':
                return `${baseUrl}/#/customers/${id}`;
            default:
                return baseUrl;
        }
    }

    // ============== Elements / Embedded Checkout ==============

    async createPaymentIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }> {
        const reference = opts.dedupeKey || this.generateReference();

        const payload = {
            email: opts.customerEmail,
            amount: opts.amount,
            reference,
            callback_url: opts.successUrl,
            metadata: {
                userId: opts.userId,
                ...opts.metadata,
            },
        };

        const response = await this.initializeWithRetry<typeof payload, { access_code: string; reference: string }>(payload);

        return {
            clientSecret: response.access_code,
            paymentIntentId: response.reference,
        };
    }

    async createSubscriptionIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }> {
        if (!opts.priceId) {
            throw new PaymentProviderError('Plan code (priceId) is required for subscription');
        }

        const reference = opts.dedupeKey || this.generateReference();

        const payload = {
            email: opts.customerEmail,
            amount: opts.amount,
            plan: opts.priceId,
            reference,
            callback_url: opts.successUrl,
            metadata: {
                userId: opts.userId,
                // Store mode and priceId in metadata for webhook processing
                // Paystack may not include plan object in charge.success webhook
                checkoutMode: 'subscription',
                planCode: opts.priceId,
                // Spread both metadata and subscriptionMetadata (embedded checkout uses metadata)
                ...opts.metadata,
                ...opts.subscriptionMetadata,
            },
        };

        // Debug logging for subscription intent
        console.log('[Paystack] Creating subscription intent:', {
            priceId: opts.priceId,
            planInPayload: payload.plan,
            reference,
        });

        const response = await this.initializeWithRetry<typeof payload, { access_code: string; reference: string }>(payload);

        return {
            clientSecret: response.access_code,
            subscriptionId: response.reference,
        };
    }

    async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentDetails> {
        const response = await this.request<PaystackTransaction>(
            `/transaction/verify/${encodeURIComponent(paymentIntentId)}`,
        );

        const tx = response.data;

        return {
            id: tx.reference,
            status: tx.status === 'success'
                ? 'succeeded'
                : tx.status === 'pending'
                    ? 'processing'
                    : 'requires_payment_method',
            amount: tx.amount,
            currency: tx.currency,
            metadata: tx.metadata as Record<string, string> | undefined,
            subscriptionId: tx.subscription?.subscription_code,
        };
    }
}
