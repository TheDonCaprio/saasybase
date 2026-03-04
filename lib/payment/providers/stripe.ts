import Stripe from 'stripe';
import {
    PaymentProvider,
    PaymentProviderFeature,
    CheckoutOptions,
    CheckoutSessionResult,
    SubscriptionResult,
    StandardizedWebhookEvent,
    SubscriptionDetails,
    CheckoutSessionDetails,
    CreatePriceOptions,
    CreateCouponOptions,
    CreatePromotionCodeOptions,
    CreateProductOptions,
    UpdateProductOptions,
    PriceDetails,
    ProrationPreviewResult,
    SubscriptionUpdateResult,
    PaymentIntentDetails
} from '../types';
import { PaymentProviderError, WebhookSignatureVerificationError, ConfigurationError } from '../errors';
import { toError } from '../../runtime-guards';

export class StripePaymentProvider implements PaymentProvider {
    name = 'stripe';
    private stripe: Stripe;
    private priceCache = new Map<string, Stripe.Price>();

    constructor(secretKey: string) {
        if (!secretKey) {
            throw new ConfigurationError('Stripe secret key is missing');
        }
        this.stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    }

    getWebhookSignatureHeader(): string {
        return 'stripe-signature';
    }

    supportsFeature(feature: PaymentProviderFeature): boolean {
        // Stripe supports all features
        const supportedFeatures: PaymentProviderFeature[] = [
            'coupons',
            'promotion_codes',
            'proration',
            'cancel_at_period_end',
            'customer_portal',
            'invoices',
            'receipts',
            'refunds',
            'disputes',
            'webhooks',
            'elements',
            'subscription_updates',
            'trial_periods',
        ];
        return supportedFeatures.includes(feature);
    }

    private async getPriceWithCache(priceId: string): Promise<Stripe.Price> {
        const cached = this.priceCache.get(priceId);
        if (cached) return cached;
        try {
            const price = await this.stripe.prices.retrieve(priceId);
            this.priceCache.set(priceId, price);
            return price;
        } catch (err) {
            throw new PaymentProviderError(`Failed to retrieve price ${priceId}`, err);
        }
    }

    async createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult> {
        if (!opts.priceId && !opts.amount) {
            throw new PaymentProviderError('Either priceId or amount must be provided for checkout');
        }

        try {
            const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

            if (opts.priceId) {
                line_items.push({
                    price: opts.priceId,
                    quantity: 1,
                });
            } else if (opts.amount) {
                line_items.push({
                    price_data: {
                        currency: opts.currency || 'usd',
                        product_data: {
                            name: 'Payment',
                        },
                        unit_amount: opts.amount,
                    },
                    quantity: 1,
                });
            }

            const sessionParams: Stripe.Checkout.SessionCreateParams = {
                line_items,
                mode: opts.mode,
                success_url: opts.successUrl,
                cancel_url: opts.cancelUrl,
                client_reference_id: opts.userId,
                metadata: opts.metadata,
                discounts: opts.promotionCodeId ? [{ promotion_code: opts.promotionCodeId }] : undefined,
            };

            if (opts.mode === 'subscription') {
                if (!opts.priceId) {
                    throw new PaymentProviderError('Subscription checkout requires a priceId');
                }

                const price = await this.getPriceWithCache(opts.priceId);
                if (price.type !== 'recurring' || !price.recurring) {
                    throw new PaymentProviderError('Price must be recurring for subscription checkouts');
                }

                sessionParams.subscription_data = {
                    metadata: opts.subscriptionMetadata
                };
            }

            const session = await this.stripe.checkout.sessions.create(sessionParams);

            return {
                url: session.url,
                id: session.id
            };
        } catch (err) {
            if (err instanceof PaymentProviderError) throw err;
            throw new PaymentProviderError('Failed to create checkout session', err);
        }
    }

    async getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
        try {
            const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['line_items.data.price', 'payment_intent']
            });

            const paymentIntent = typeof session.payment_intent === 'object' ? session.payment_intent : null;

            return {
                id: session.id,
                clientReferenceId: session.client_reference_id || undefined,
                metadata: session.metadata || undefined,
                paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : paymentIntent?.id,
                subscriptionId: typeof session.subscription === 'string' ? session.subscription : (session.subscription as Stripe.Subscription)?.id,
                amountTotal: session.amount_total || undefined,
                amountSubtotal: session.amount_subtotal || undefined,
                amountDiscount: session.total_details?.amount_discount || undefined,
                paymentStatus: session.payment_status,
                lineItems: session.line_items?.data.map(item => ({
                    priceId: item.price?.id
                })),
                paymentIntent: paymentIntent ? {
                    amount: paymentIntent.amount,
                    amountReceived: paymentIntent.amount_received
                } : undefined
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to retrieve checkout session', err);
        }
    }

    async createCustomer(userId: string, email: string, name?: string): Promise<string> {
        try {
            const params: Stripe.CustomerCreateParams = {
                email,
                metadata: { userId }
            };
            if (name) params.name = name;

            const customer = await this.stripe.customers.create(params);
            return customer.id;
        } catch (err) {
            throw new PaymentProviderError('Failed to create customer', err);
        }
    }

    async updateCustomer(customerId: string, data: { email?: string; name?: string }): Promise<void> {
        try {
            const params: Stripe.CustomerUpdateParams = {};
            if (data.email) params.email = data.email;
            if (data.name) params.name = data.name;

            if (Object.keys(params).length > 0) {
                await this.stripe.customers.update(customerId, params);
            }
        } catch (err) {
            throw new PaymentProviderError(`Failed to update customer ${customerId}`, err);
        }
    }

    async createCustomerPortalSession(customerId: string, returnUrl: string): Promise<string> {
        try {
            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return session.url;
        } catch (err) {
            throw new PaymentProviderError('Failed to create customer portal session', err);
        }
    }

    async cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult> {
        try {
            let subscription: Stripe.Subscription;
            if (immediately) {
                subscription = await this.stripe.subscriptions.cancel(subscriptionId);
            } else {
                subscription = await this.stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
            }

            return {
                id: subscription.id,
                status: subscription.status,
                canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
                expiresAt: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
                currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to cancel subscription', err);
        }
    }

    async undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
        try {
            const sub = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false,
            });
            return {
                id: sub.id,
                status: sub.status,
                canceledAt: null,
                expiresAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to undo subscription cancellation', err);
        }
    }

    async getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
        try {
            const sub = await this.stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price', 'latest_invoice']
            });

            const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;

            return {
                id: sub.id,
                status: sub.status,
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
                currentPeriodStart: new Date(sub.current_period_start * 1000),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
                metadata: sub.metadata,
                priceId: sub.items.data[0]?.price.id,
                customerId: typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id,
                latestInvoice: latestInvoice ? {
                    id: latestInvoice.id,
                    amountPaid: latestInvoice.amount_paid,
                    amountDue: latestInvoice.amount_due,
                    status: latestInvoice.status || 'unknown',
                    paymentIntentId: typeof latestInvoice.payment_intent === 'string' ? latestInvoice.payment_intent : (latestInvoice.payment_intent as Stripe.PaymentIntent)?.id,
                    subtotal: latestInvoice.subtotal,
                    total: latestInvoice.total,
                    amountDiscount: latestInvoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0
                } : null
            };
        } catch (err) {
            throw new PaymentProviderError(`Failed to retrieve subscription ${subscriptionId}`, err);
        }
    }

    async constructWebhookEvent(requestBody: Buffer, signature: string, secret: string): Promise<StandardizedWebhookEvent> {
        let event: Stripe.Event;
        try {
            event = this.stripe.webhooks.constructEvent(requestBody, signature, secret);
        } catch (err) {
            throw new WebhookSignatureVerificationError((err as Error).message);
        }

        return await this.normalizeEvent(event);
    }

    private async normalizeEvent(event: Stripe.Event): Promise<StandardizedWebhookEvent> {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as Stripe.Checkout.Session;
                return {
                    type: 'checkout.completed',
                    payload: {
                        id: session.id,
                        userId: session.client_reference_id || (session.metadata?.userId),
                        userEmail: session.customer_details?.email || session.customer_email || undefined,
                        mode: session.mode,
                        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
                        metadata: session.metadata || undefined,
                        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
                        amountTotal: session.amount_total || undefined,
                        amountSubtotal: session.amount_subtotal || undefined,
                        currency: session.currency || undefined,
                        paymentStatus: session.payment_status,
                        lineItems: session.line_items?.data.map(item => ({
                            priceId: item.price?.id,
                            quantity: item.quantity || undefined
                        }))
                    },
                    originalEvent: event,
                };
            }
            case 'checkout.session.async_payment_failed': {
                const session = event.data.object as Stripe.Checkout.Session;
                return {
                    type: 'payment.failed',
                    payload: {
                        id: session.id,
                        status: 'failed',
                        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
                        subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
                        metadata: session.metadata || undefined,
                        userId: session.client_reference_id || session.metadata?.userId
                    },
                    originalEvent: event,
                };
            }
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
            case 'customer.subscription.created': {
                const sub = event.data.object as Stripe.Subscription;
                const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;
                return {
                    type: 'subscription.updated',
                    payload: {
                        id: sub.id,
                        status: sub.status,
                        currentPeriodStart: new Date(sub.current_period_start * 1000),
                        currentPeriodEnd: new Date(sub.current_period_end * 1000),
                        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
                        cancelAtPeriodEnd: sub.cancel_at_period_end,
                        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
                        priceId: sub.items.data[0]?.price.id,
                        metadata: sub.metadata,
                        latestInvoice: latestInvoice ? {
                            id: latestInvoice.id,
                            amountPaid: latestInvoice.amount_paid,
                            amountDue: latestInvoice.amount_due,
                            amountDiscount: latestInvoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0,
                            subtotal: latestInvoice.subtotal,
                            total: latestInvoice.total,
                            currency: latestInvoice.currency,
                            status: latestInvoice.status || 'unknown',
                            paymentIntentId: typeof latestInvoice.payment_intent === 'string' ? latestInvoice.payment_intent : latestInvoice.payment_intent?.id,
                            subscriptionId: typeof latestInvoice.subscription === 'string' ? latestInvoice.subscription : latestInvoice.subscription?.id,
                            customerId: typeof latestInvoice.customer === 'string' ? latestInvoice.customer : latestInvoice.customer?.id,
                            userEmail: latestInvoice.customer_email || undefined,
                            metadata: latestInvoice.metadata || undefined
                        } : undefined
                    },
                    originalEvent: event,
                };
            }
            case 'payment_intent.created':
            case 'payment_intent.processing':
            case 'charge.succeeded':
            case 'invoice.finalized':
                return {
                    type: 'ignored',
                    payload: event.data.object as unknown as Record<string, unknown>,
                    originalEvent: event,
                };
            case 'charge.refunded': {
                const charge = event.data.object as Stripe.Charge;
                const refund = charge.refunds?.data?.[0];
                return {
                    type: 'refund.processed',
                    payload: {
                        id: refund?.id || `refund_${charge.id}`,
                        paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id,
                        chargeId: charge.id,
                        amount: charge.amount_refunded,
                        currency: charge.currency,
                        status: refund?.status || 'succeeded',
                        reason: refund?.reason || undefined,
                        metadata: refund?.metadata || undefined
                    },
                    originalEvent: event,
                };
            }
            case 'invoice.upcoming': {
                const invoice = event.data.object as Stripe.Invoice;
                return {
                    type: 'invoice.upcoming',
                    payload: {
                        id: invoice.id,
                        amountPaid: invoice.amount_paid ?? 0,
                        amountDue: invoice.amount_due ?? 0,
                        amountDiscount: invoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0,
                        subtotal: invoice.subtotal ?? 0,
                        total: invoice.total ?? 0,
                        currency: invoice.currency || 'usd',
                        status: invoice.status || 'draft',
                        paymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : undefined,
                        subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
                        customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
                        userEmail: invoice.customer_email || undefined,
                        metadata: invoice.metadata || undefined,
                        lineItems: invoice.lines?.data?.map((line) => ({
                            priceId: line.price?.id,
                            amount: line.amount ?? 0,
                            description: line.description || undefined
                        })),
                        billingReason: invoice.billing_reason,
                        nextPaymentAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null
                    },
                    originalEvent: event,
                };
            }
            case 'payment_intent.succeeded':
                // If this PaymentIntent is attached to an Invoice, load the Invoice and
                // normalize to invoice.payment_succeeded so the existing invoice handler
                // can process recurring and related flows. Otherwise, return payment.succeeded.
                try {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const invoiceId = typeof pi.invoice === 'string' ? pi.invoice : undefined;
                    if (invoiceId) {
                        const invoice = await this.stripe.invoices.retrieve(invoiceId);
                        return {
                            type: 'invoice.payment_succeeded',
                            payload: {
                                id: invoice.id,
                                amountPaid: invoice.amount_paid,
                                amountDue: invoice.amount_due,
                                amountDiscount: invoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0,
                                subtotal: invoice.subtotal,
                                total: invoice.total,
                                currency: invoice.currency,
                                status: invoice.status || 'unknown',
                                paymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
                                subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
                                customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
                                userEmail: invoice.customer_email || undefined,
                                metadata: invoice.metadata || undefined,
                                lineItems: invoice.lines.data.map(line => ({
                                    priceId: line.price?.id,
                                    amount: line.amount,
                                    description: line.description || undefined
                                })),
                                billingReason: invoice.billing_reason || undefined,
                                nextPaymentAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null
                            },
                            originalEvent: event,
                        };
                    }
                } catch {
                    // Fall back to generic payment succeeded if invoice retrieval fails
                    // (do not block webhook processing)
                }

                const pi = event.data.object as Stripe.PaymentIntent;
                return {
                    type: 'payment.succeeded',
                    payload: {
                        id: pi.id,
                        amount: pi.amount,
                        currency: pi.currency,
                        status: pi.status,
                        metadata: pi.metadata,
                        userId: pi.metadata?.userId
                    },
                    originalEvent: event,
                };
            case 'payment_intent.payment_failed': {
                const pi = event.data.object as Stripe.PaymentIntent;
                const lastError = pi.last_payment_error;
                return {
                    type: 'payment.failed',
                    payload: {
                        id: pi.id,
                        amount: pi.amount,
                        currency: pi.currency,
                        status: pi.status,
                        errorMessage: lastError?.message || 'Payment failed',
                        errorCode: lastError?.code || undefined,
                        customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id,
                        metadata: pi.metadata || undefined,
                        userId: pi.metadata?.userId
                    },
                    originalEvent: event,
                };
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                return {
                    type: 'invoice.payment_succeeded',
                    payload: {
                        id: invoice.id,
                        amountPaid: invoice.amount_paid,
                        amountDue: invoice.amount_due,
                        amountDiscount: invoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0,
                        subtotal: invoice.subtotal,
                        total: invoice.total,
                        currency: invoice.currency,
                        status: invoice.status || 'unknown',
                        paymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
                        subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
                        customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
                        userEmail: invoice.customer_email || undefined,
                        metadata: invoice.metadata || undefined,
                        lineItems: invoice.lines.data.map(line => ({
                            priceId: line.price?.id,
                            amount: line.amount,
                            description: line.description || undefined
                        })),
                        billingReason: invoice.billing_reason || undefined
                    },
                    originalEvent: event,
                };
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                return {
                    type: 'invoice.payment_failed',
                    payload: {
                        id: invoice.id,
                        amountPaid: invoice.amount_paid,
                        amountDue: invoice.amount_due,
                        amountDiscount: invoice.total_discount_amounts?.reduce((sum, item) => sum + item.amount, 0) || 0,
                        subtotal: invoice.subtotal,
                        total: invoice.total,
                        currency: invoice.currency,
                        status: invoice.status || 'unpaid',
                        paymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id,
                        subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id,
                        customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
                        userEmail: invoice.customer_email || undefined,
                        metadata: invoice.metadata || undefined
                    },
                    originalEvent: event,
                };
            }
            case 'charge.dispute.created':
            case 'charge.dispute.updated':
            case 'charge.dispute.closed': {
                const dispute = event.data.object as Stripe.Dispute;
                return {
                    type: event.type === 'charge.dispute.created' ? 'dispute.created' : 'dispute.updated',
                    payload: {
                        id: dispute.id,
                        chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
                        paymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id,
                        amount: dispute.amount,
                        currency: dispute.currency,
                        status: dispute.status as import('../types').StandardizedDispute['status'],
                        reason: dispute.reason,
                        evidenceDueBy: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : undefined,
                        metadata: dispute.metadata || undefined
                    },
                    originalEvent: event,
                };
            }
            default:
                return {
                    type: 'other',
                    payload: event.data.object as unknown as Record<string, unknown>,
                    originalEvent: event,
                } as StandardizedWebhookEvent;
        }
    }

    // Admin / Product Management
    async createProduct(options: CreateProductOptions): Promise<string> {
        try {
            const params: Stripe.ProductCreateParams = {
                name: options.name,
                metadata: options.metadata
            };
            if (options.description) params.description = options.description;
            const product = await this.stripe.products.create(params);
            return product.id;
        } catch (err) {
            throw new PaymentProviderError('Failed to create product', err);
        }
    }

    async updateProduct(productId: string, options: UpdateProductOptions): Promise<void> {
        try {
            const params: Stripe.ProductUpdateParams = {};
            if (options.name) params.name = options.name;
            if (options.description) params.description = options.description;
            if (options.metadata) params.metadata = options.metadata;
            await this.stripe.products.update(productId, params);
        } catch (err) {
            throw new PaymentProviderError('Failed to update product', err);
        }
    }

    async findProduct(name: string): Promise<string | null> {
        try {
            const result = await this.stripe.products.search({
                query: `name:"${name}"`,
                limit: 1
            });
            return result.data.length > 0 ? result.data[0].id : null;
        } catch (err) {
            throw new PaymentProviderError('Failed to search for product', err);
        }
    }

    async createPrice(opts: CreatePriceOptions): Promise<PriceDetails> {
        try {
            const params: Stripe.PriceCreateParams = {
                unit_amount: opts.unitAmount,
                currency: opts.currency,
                product: opts.productId,
                metadata: opts.metadata
            };
            if (opts.recurring) {
                params.recurring = {
                    interval: opts.recurring.interval,
                    interval_count: opts.recurring.intervalCount
                };
            }
            const price = await this.stripe.prices.create(params);
            return {
                id: price.id,
                unitAmount: price.unit_amount,
                currency: price.currency,
                recurring: price.recurring ? {
                    interval: price.recurring.interval,
                    intervalCount: price.recurring.interval_count || 1
                } : null,
                productId: typeof price.product === 'string' ? price.product : (price.product as Stripe.Product).id,
                type: price.type
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to create price', err);
        }
    }

    async verifyPrice(priceId: string): Promise<PriceDetails> {
        try {
            const price = await this.stripe.prices.retrieve(priceId);
            return {
                id: price.id,
                unitAmount: price.unit_amount,
                currency: price.currency,
                recurring: price.recurring ? {
                    interval: price.recurring.interval,
                    intervalCount: price.recurring.interval_count || 1
                } : null,
                productId: typeof price.product === 'string' ? price.product : (price.product as Stripe.Product).id,
                type: price.type
            };
        } catch (err) {
            throw new PaymentProviderError(`Failed to verify price ${priceId}`, err);
        }
    }

    async archivePrice(priceId: string): Promise<void> {
        try {
            await this.stripe.prices.update(priceId, { active: false });
        } catch (err) {
            throw new PaymentProviderError(`Failed to archive price ${priceId}`, err);
        }
    }

    async createCoupon(opts: CreateCouponOptions): Promise<string> {
        try {
            const params: Stripe.CouponCreateParams = { duration: opts.duration };
            if (opts.percentOff) params.percent_off = opts.percentOff;
            if (opts.amountOff) {
                params.amount_off = opts.amountOff;
                params.currency = opts.currency || 'usd';
            }
            if (opts.durationInMonths) params.duration_in_months = opts.durationInMonths;

            const coupon = await this.stripe.coupons.create(params);
            return coupon.id;
        } catch (err) {
            throw new PaymentProviderError('Failed to create coupon', err);
        }
    }

    async deleteCoupon(couponId: string): Promise<void> {
        try {
            await this.stripe.coupons.del(couponId);
        } catch (err) {
            throw new PaymentProviderError(`Failed to delete coupon ${couponId}`, err);
        }
    }
    async createPromotionCode(opts: CreatePromotionCodeOptions): Promise<string> {
        try {
            const params: Stripe.PromotionCodeCreateParams = {
                coupon: opts.couponId,
                code: opts.code,
                active: opts.active,
                metadata: opts.metadata,
            };
            if (opts.expiresAt) {
                params.expires_at = Math.floor(opts.expiresAt.getTime() / 1000);
            }
            const promo = await this.stripe.promotionCodes.create(params);
            return promo.id;
        } catch (err: unknown) {
            const error = toError(err);
            throw new PaymentProviderError(`Failed to create promotion code: ${error.message}`, error);
        }
    }

    async updatePromotionCode(id: string, active: boolean): Promise<void> {
        try {
            await this.stripe.promotionCodes.update(id, { active });
        } catch (err) {
            throw new PaymentProviderError('Failed to update promotion code', err);
        }
    }

    getDashboardUrl(type: 'payment' | 'subscription' | 'customer', id: string): string {
        switch (type) {
            case 'payment':
                return `https://dashboard.stripe.com/payments/${id}`;
            case 'subscription':
                return `https://dashboard.stripe.com/subscriptions/${id}`;
            case 'customer':
                return `https://dashboard.stripe.com/customers/${id}`;
            default:
                return 'https://dashboard.stripe.com';
        }
    }

    // Proration & Updates
    async getProrationPreview(subscriptionId: string, newPriceId: string, userId: string): Promise<ProrationPreviewResult> {
        void userId;
        try {
            const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
            const items = sub.items.data;
            const primaryItem = items.find(item => item.price.recurring) || items[0];

            if (!primaryItem) throw new Error('No subscription items found');

            const upcoming = await this.stripe.invoices.retrieveUpcoming({
                customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
                subscription: subscriptionId,
                subscription_items: [{
                    id: primaryItem.id,
                    price: newPriceId,
                }],
                subscription_proration_behavior: 'always_invoice',
            });

            return {
                prorationEnabled: true,
                amountDue: upcoming.amount_due,
                currency: upcoming.currency,
                nextPaymentAttempt: upcoming.next_payment_attempt,
                lineItems: upcoming.lines.data.map(line => ({
                    description: line.description,
                    amount: line.amount,
                    proration: line.proration,
                }))
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to get proration preview', err);
        }
    }

    async updateSubscriptionPlan(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
        void userId;
        try {
            const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
            const items = sub.items.data;
            const primaryItem = items.find(item => item.price.recurring) || items[0];

            if (!primaryItem) throw new Error('No subscription items found');

            const updated = await this.stripe.subscriptions.update(subscriptionId, {
                items: [{
                    id: primaryItem.id,
                    price: newPriceId,
                }],
                proration_behavior: 'always_invoice',
                cancel_at_period_end: false,
                expand: ['latest_invoice.payment_intent']
            });

            const latestInvoice = updated.latest_invoice as Stripe.Invoice | null;
            const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

            // Detect SCA / 3D Secure requirement on the proration invoice.
            if (paymentIntent?.status === 'requires_action' || paymentIntent?.status === 'requires_confirmation') {
                return {
                    success: true,
                    requiresAction: true,
                    clientSecret: paymentIntent.client_secret ?? undefined,
                    newPeriodEnd: new Date(updated.current_period_end * 1000),
                    invoiceId: latestInvoice?.id,
                    amountPaid: latestInvoice?.amount_paid,
                };
            }

            return {
                success: true,
                newPeriodEnd: new Date(updated.current_period_end * 1000),
                invoiceId: latestInvoice?.id,
                amountPaid: latestInvoice?.amount_paid
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to update subscription plan', err);
        }
    }

    async scheduleSubscriptionPlanChange(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult> {
        void userId;
        try {
            const hasStringId = (value: unknown): value is { id: string } => {
                if (!value || typeof value !== 'object') return false;
                const rec = value as Record<string, unknown>;
                return typeof rec.id === 'string' && rec.id.length > 0;
            };

            // Retrieve subscription and determine the primary recurring item.
            const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
            const items = sub.items.data;
            const primaryItem = items.find(item => item.price.recurring) || items[0];

            if (!primaryItem) throw new Error('No subscription items found');

            const currentPriceId = primaryItem.price?.id;
            if (!currentPriceId) throw new Error('Missing current subscription item price');

            // Preserve all existing subscription items when scheduling.
            // Stripe schedule phases define the full set of items for that phase.
            const currentPhaseItems = items.map((item) => {
                const priceId = item.price?.id;
                if (!priceId) throw new Error('Missing subscription item price id');
                const q = typeof item.quantity === 'number' ? item.quantity : 1;
                return { price: priceId, quantity: q };
            });

            const nextPhaseItems = items.map((item) => {
                const priceId = item.id === primaryItem.id ? newPriceId : item.price?.id;
                if (!priceId) throw new Error('Missing subscription item price id');
                const q = typeof item.quantity === 'number' ? item.quantity : 1;
                return { price: priceId, quantity: q };
            });

            // Ensure the target price is recurring so we can derive a duration.
            const targetPrice = await this.getPriceWithCache(newPriceId);
            if (targetPrice.type !== 'recurring' || !targetPrice.recurring) {
                throw new PaymentProviderError('Stripe scheduled plan change requires a recurring price');
            }

            // Get or create a subscription schedule attached to this subscription.
            const scheduleRef: unknown = (sub as unknown as { schedule?: unknown }).schedule;
            const existingScheduleId = typeof scheduleRef === 'string'
                ? scheduleRef
                : (hasStringId(scheduleRef) ? scheduleRef.id : null);

            let scheduleId = existingScheduleId;
            if (scheduleId) {
                // Validate the existing schedule is still usable.
                const existingSchedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId);
                const scheduleStatus = existingSchedule.status as string;
                if (scheduleStatus === 'canceled' || scheduleStatus === 'released') {
                    // Stale schedule — create a fresh one instead of trying to update it.
                    scheduleId = null;
                }
            }
            if (!scheduleId) {
                scheduleId = (await this.stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })).id;
            }

            const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId);

            const currentPhase = schedule.current_phase;
            const currentPeriodStart = currentPhase?.start_date ?? sub.current_period_start;
            const currentPeriodEnd = currentPhase?.end_date ?? sub.current_period_end;
            if (typeof currentPeriodStart !== 'number' || typeof currentPeriodEnd !== 'number') {
                throw new PaymentProviderError('Stripe schedule is missing current phase dates');
            }

            // Update schedule to apply the new price exactly at the period boundary.
            await this.stripe.subscriptionSchedules.update(scheduleId, {
                end_behavior: 'release',
                proration_behavior: 'none',
                phases: [
                    {
                        start_date: currentPeriodStart,
                        end_date: currentPeriodEnd,
                        items: currentPhaseItems,
                        proration_behavior: 'none',
                    },
                    {
                        start_date: currentPeriodEnd,
                        items: nextPhaseItems,
                        proration_behavior: 'none',
                        // Run the new plan for one billing interval, then release the schedule.
                        // After release, Stripe keeps the subscription on the last phase's items.
                        iterations: 1,
                    },
                ],
            });

            return {
                success: true,
                // For UI purposes, return the current period end (when the change takes effect).
                newPeriodEnd: new Date(sub.current_period_end * 1000),
            };
        } catch (err) {
            if (err instanceof PaymentProviderError) throw err;
            throw new PaymentProviderError('Failed to schedule Stripe subscription plan change', err);
        }
    }

    // Billing & Refunds
    async refundPayment(paymentId: string, amount?: number, reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }> {
        try {
            const refundParams: Stripe.RefundCreateParams = {
                payment_intent: paymentId,
                amount: amount
            };
            if (reason) {
                refundParams.reason = reason as Stripe.RefundCreateParams['reason'];
            }
            const refund = await this.stripe.refunds.create(refundParams);
            return {
                id: refund.id,
                amount: refund.amount,
                status: refund.status || 'unknown',
                created: new Date(refund.created * 1000)
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to refund payment', err);
        }
    }

    async getRefundDetails(paymentId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null> {
        try {
            const refunds = await this.stripe.refunds.list({ payment_intent: paymentId, limit: 1 });
            const first = refunds.data[0];
            if (first) {
                return {
                    id: first.id,
                    amount: first.amount,
                    status: first.status || 'unknown',
                    created: new Date(first.created * 1000)
                };
            }
            return null;
        } catch (err) {
            // If the error implies the ID is invalid (e.g. not a PI ID), return null or rethrow?
            // For now, rethrow as provider error.
            throw new PaymentProviderError('Failed to retrieve refund details', err);
        }
    }

    async getPaymentReceiptUrl(paymentId: string): Promise<string | null> {
        try {
            const pi = await this.stripe.paymentIntents.retrieve(paymentId);
            if (pi.latest_charge) {
                const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id;
                const charge = await this.stripe.charges.retrieve(chargeId);
                return charge.receipt_url;
            }
            return null;
        } catch (err) {
            void err;
            // PaymentIntent might not exist if it was a checkout session without PI expansion, but usually we store PI ID.
            // If it fails, return null.
            return null;
        }
    }

    async getInvoiceUrl(invoiceId: string): Promise<string | null> {
        try {
            const invoice = await this.stripe.invoices.retrieve(invoiceId);
            return invoice.hosted_invoice_url ?? null;
        } catch (err) {
            throw new PaymentProviderError('Failed to get invoice URL', err);
        }
    }

    // Helper to get the underlying Stripe instance if needed (escape hatch)
    getSdk(): Stripe {
        return this.stripe;
    }

    async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentDetails> {
        try {
            const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
                expand: ['invoice', 'invoice.subscription']
            });

            let invoiceId: string | undefined;
            let subscriptionId: string | undefined;

            if (pi.invoice) {
                const invoice = typeof pi.invoice === 'string' ? pi.invoice : pi.invoice.id;
                invoiceId = invoice;

                if (typeof pi.invoice === 'object' && pi.invoice.subscription) {
                    const sub = pi.invoice.subscription;
                    subscriptionId = typeof sub === 'string' ? sub : sub.id;
                }
            }

            return {
                id: pi.id,
                status: pi.status,
                amount: pi.amount,
                currency: pi.currency,
                metadata: pi.metadata as Record<string, string>,
                invoiceId,
                subscriptionId
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to retrieve payment intent', err);
        }
    }

    // Elements / Embedded Checkout
    async createPaymentIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }> {
        if (!opts.amount && !opts.priceId) {
            throw new PaymentProviderError('Amount or priceId required for payment intent');
        }

        try {
            let amount = opts.amount;
            if (opts.priceId && !amount) {
                const price = await this.getPriceWithCache(opts.priceId);
                if (!price.unit_amount) throw new PaymentProviderError('Price does not have a unit amount');
                amount = price.unit_amount;
            }

            if (!amount) throw new PaymentProviderError('Could not determine amount for payment intent');

            const params: Stripe.PaymentIntentCreateParams = {
                amount,
                currency: opts.currency || 'usd',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    userId: opts.userId,
                    ...opts.metadata
                },
            };

            if (opts.userId) {
                // Try to find or create customer to attach
                // Note: In a real flow we might want to ensure customer exists first or pass it in.
                // For now, we'll leave it optional or handle it if we have email.
            }

            const paymentIntent = await this.stripe.paymentIntents.create(params, opts.dedupeKey ? { idempotencyKey: opts.dedupeKey } : undefined);

            if (!paymentIntent.client_secret) {
                throw new PaymentProviderError('Failed to generate client secret for payment intent');
            }

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            };
        } catch (err) {
            throw new PaymentProviderError('Failed to create payment intent', err);
        }
    }

    async createSubscriptionIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }> {
        if (!opts.priceId) {
            throw new PaymentProviderError('Price ID required for subscription intent');
        }

        try {
            // We need a customer for subscriptions
            // For this flow, we might need to create one if it doesn't exist, or expect one.
            // Since CheckoutOptions has userId, we can try to find the customer or create one if we had email.
            // But CheckoutOptions doesn't guarantee email.
            // However, usually we have a user.
            // For simplicity in this step, let's assume we create a customer or use an existing one if we can map it.
            // But wait, `createCustomer` is a separate method.
            // The caller should ideally ensure customer exists.
            // But `CheckoutOptions` doesn't pass customerId.
            // Let's assume we create a customer on the fly if needed, but we need email.
            // If we don't have email in opts, we might be stuck.
            // Let's check `CheckoutOptions` again. It has `userId`.
            // We might need to fetch the user to get email, but we are in the provider.
            // The provider shouldn't depend on user service.
            // Let's assume the caller passes `customer` in metadata or we create a guest customer?
            // No, subscriptions require a customer.
            // Let's look at `createCheckoutSession`. It uses `client_reference_id`.
            // Stripe Checkout handles customer creation.
            // For Elements, we must create the customer first.
            // We should probably update `CheckoutOptions` to include `email` or `customerId` if we want to be robust.
            // But `CheckoutOptions` has `userId`.
            // Let's look at `createCustomer` method in this class. It takes `userId` and `email`.
            // We can't call it without email.
            // Maybe we should throw if we can't get a customer?
            // Or maybe we update `CheckoutOptions`?
            // Let's check `CheckoutOptions` definition in `types.ts`.
            // It has `userId`.
            // It doesn't have `email` or `customerId`.
            // I will update `CheckoutOptions` to include optional `email` and `customerId`.

            // Wait, I can't update `CheckoutOptions` right now without breaking other things potentially.
            // Actually, `createCheckoutSession` uses `customer_email` if provided?
            // No, it uses `client_reference_id`.
            // For `createSubscriptionIntent`, we MUST have a customer.
            // Let's assume the caller will create the customer and pass the ID in `metadata` or we add `customerId` to `CheckoutOptions`.
            // Adding `customerId` to `CheckoutOptions` seems best.
            // But for now, let's see if we can get away with just creating a customer if email is in metadata?
            // Or better, let's add `customerEmail` to `CheckoutOptions`.

            // Actually, let's look at `createCheckoutSession` again.
            // It doesn't take email.
            // It seems `StripePaymentProvider` doesn't have a way to look up user email.

            // I will add `customerEmail` and `customerId` to `CheckoutOptions` in `types.ts` first.
            // But I already edited `types.ts`.
            // Let's do it in a separate step if needed.
            // For now, let's implement `createPaymentIntent` fully and `createSubscriptionIntent` assuming we can get a customer.

            // Actually, for `createSubscriptionIntent`, if we don't have a customer, we can't create a subscription.
            // So we definitely need `customerId`.

            // Let's pause and update `types.ts` to include `customerId` and `customerEmail` in `CheckoutOptions`.
            // This is a safe addition.

            // Wait, I can't pause this tool call.
            // I will implement `createPaymentIntent` now.
            // And for `createSubscriptionIntent`, I will throw if `customerId` is missing from `opts` (I'll cast it or check metadata).
            // Actually, I'll update `types.ts` in the next step.
            // So here I will assume `opts` has `customerId` (I'll add it to the interface next).

            const customerId = opts.customerId; // Will add this to interface
            if (!customerId) {
                throw new PaymentProviderError('Customer ID required for subscription intent');
            }

            const subscription = await this.stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: opts.priceId }],
                discounts: opts.promotionCodeId ? [{ promotion_code: opts.promotionCodeId }] : undefined,
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                expand: ['latest_invoice.payment_intent'],
                metadata: {
                    userId: opts.userId,
                    ...opts.subscriptionMetadata
                }
            }, opts.dedupeKey ? { idempotencyKey: opts.dedupeKey } : undefined);

            const invoice = subscription.latest_invoice as Stripe.Invoice;
            const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent | null;

            // When customer credit covers the entire invoice (e.g. after a force-cancelled
            // subscription with remaining credit), Stripe auto-pays the invoice and the
            // PaymentIntent is null.  In that case the subscription is already active and
            // there is nothing for the customer to confirm. Return a sentinel client secret
            // so the frontend can detect this and redirect to success.
            if (!paymentIntent?.client_secret) {
                if (subscription.status === 'active' || subscription.status === 'trialing') {
                    return {
                        clientSecret: '__instant_activation__',
                        subscriptionId: subscription.id,
                    };
                }
                throw new PaymentProviderError('Failed to generate client secret for subscription intent');
            }

            return {
                clientSecret: paymentIntent.client_secret,
                subscriptionId: subscription.id
            };
        } catch (err) {
            const underlying = toError(err);
            throw new PaymentProviderError(`Failed to create subscription intent: ${underlying.message}`, err);
        }
    }
}
