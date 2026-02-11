// Map of provider -> identifier (supports multi-provider integrations)
export type ProviderIdMap = Record<string, string>;

export interface CheckoutOptions {
    priceId?: string; // Optional if amount/currency provided
    priceIdsByProvider?: ProviderIdMap; // Provider-specific price mapping (preferred when available)
    amount?: number; // Ad-hoc pricing (in cents)
    currency?: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
    mode: 'payment' | 'subscription';
    provider?: string; // Explicit provider hint when multiple are enabled
    promotionCodeId?: string;
    metadata?: Record<string, string>;
    subscriptionMetadata?: Record<string, string>;
    customerId?: string;
    customerIdsByProvider?: ProviderIdMap;
    customerEmail?: string;
    dedupeKey?: string;
}

export interface CheckoutSessionResult {
    url: string | null;
    id: string;
}

export interface SubscriptionResult {
    id: string;
    status: string;
    canceledAt?: Date | null;
    expiresAt?: Date | null;
    currentPeriodEnd?: Date | null;
}

export interface StandardizedWebhookEvent {
    type:
    | 'checkout.completed'
    | 'subscription.created'
    | 'subscription.updated'
    | 'payment.succeeded'
    | 'payment.failed'
    | 'invoice.created'
    | 'invoice.payment_succeeded'
    | 'invoice.payment_failed'
    | 'invoice.upcoming'
    | 'refund.processed'
    | 'dispute.created'
    | 'dispute.updated'
    | 'ignored'
    | 'other';
    payload: StandardizedCheckoutSession | StandardizedSubscription | StandardizedInvoice | StandardizedPayment | StandardizedPaymentFailed | StandardizedRefund | StandardizedDispute | Record<string, unknown>;
    originalEvent: unknown; // Raw provider event
}

export interface StandardizedPayment {
    id: string;
    amount: number;
    currency: string;
    status: string;
    providerId?: string;
    metadata?: Record<string, string>;
    userId?: string;
}

export interface StandardizedPaymentFailed {
    id: string;
    amount?: number;
    currency?: string;
    status: string;
    errorMessage?: string;
    errorCode?: string;
    customerId?: string;
    subscriptionId?: string;
    metadata?: Record<string, string>;
    userId?: string;
}

export interface StandardizedRefund {
    id: string;
    paymentIntentId?: string;
    chargeId?: string;
    amount: number;
    currency: string;
    status: string;
    reason?: string;
    metadata?: Record<string, string>;
}

export interface StandardizedDispute {
    id: string;
    paymentIntentId?: string;
    chargeId?: string;
    amount: number;
    currency: string;
    status: 'warning_needs_response' | 'warning_under_review' | 'warning_closed' | 'needs_response' | 'under_review' | 'charge_refunded' | 'won' | 'lost';
    reason: string;
    evidenceDueBy?: Date;
    metadata?: Record<string, string>;
}

export interface StandardizedCheckoutSession {
    id: string;
    userId?: string;
    userEmail?: string;
    customerId?: string;
    customerIdsByProvider?: ProviderIdMap;
    mode: 'payment' | 'subscription' | string;
    providerId?: string;
    subscriptionId?: string;
    metadata?: Record<string, string>;
    /** Optional payment authorization details (e.g., Paystack authorization_code) */
    authorization?: {
        code: string;
        reusable?: boolean;
        channel?: string;
        brand?: string;
        bank?: string;
        last4?: string;
        expMonth?: string;
        expYear?: string;
    };
    paymentIntentId?: string;
    /** Numeric transaction ID (e.g., Paystack's tx.id) for dashboard URLs */
    transactionId?: string;
    amountTotal?: number;
    amountSubtotal?: number;
    currency?: string;
    paymentStatus: string;
    lineItems?: {
        priceId?: string;
        priceIdsByProvider?: ProviderIdMap;
        quantity?: number;
    }[];
}

export interface StandardizedSubscription {
    id: string;
    status: string;
    providerId?: string;
    subscriptionIdsByProvider?: ProviderIdMap;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    canceledAt?: Date | null;
    cancelAtPeriodEnd: boolean;
    customerId?: string;
    customerIdsByProvider?: ProviderIdMap;
    priceId?: string;
    priceIdsByProvider?: ProviderIdMap;
    metadata?: Record<string, string>;
    latestInvoice?: StandardizedInvoice;
}

export interface StandardizedInvoice {
    id: string;
    providerId?: string;
    invoiceIdsByProvider?: ProviderIdMap;
    amountPaid: number;
    amountDue: number;
    amountDiscount: number;
    subtotal: number;
    total: number;
    currency: string;
    status: string;
    paymentIntentId?: string;
    subscriptionId?: string;
    customerId?: string;
    userEmail?: string;
    metadata?: Record<string, string>;
    lineItems?: {
        priceId?: string;
        priceIdsByProvider?: ProviderIdMap;
        amount: number;
        description?: string;
    }[];
    billingReason?: string;
    nextPaymentAttempt?: Date | null;
}

export interface CheckoutSessionDetails {
    id: string;
    clientReferenceId?: string;
    metadata?: Record<string, string>;
    paymentIntentId?: string;
    subscriptionId?: string;
    amountTotal?: number;
    amountSubtotal?: number;
    amountDiscount?: number;
    paymentStatus: string;
    lineItems?: {
        priceId?: string;
    }[];
    paymentIntent?: {
        amount?: number;
        amountReceived?: number;
    };

}

export interface CreatePriceOptions {
    productId: string;
    unitAmount: number;
    currency: string;
    /**
     * Quantity limits for this price (primarily used by Paddle overlay checkout).
     * If omitted, providers may apply their own defaults.
     */
    quantity?: {
        minimum: number;
        maximum: number;
    };
    recurring?: {
        interval: 'day' | 'week' | 'month' | 'year';
        intervalCount?: number;
    };
    metadata?: Record<string, string>;
}

export interface CreateProductOptions {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
}

export interface UpdateProductOptions {
    name?: string;
    description?: string;
    metadata?: Record<string, string>;
}

export interface PriceDetails {
    id: string;
    unitAmount: number | null;
    currency: string | null;
    recurring: {
        interval: string;
        intervalCount: number;
    } | null;
    productId: string | null;
    type: string | null;
}

export interface CreateCouponOptions {
    duration: 'once' | 'repeating' | 'forever';
    /**
     * Optional provider-side code. Some providers (e.g. Lemon Squeezy) require
     * the code at discount creation time.
     */
    code?: string;
    percentOff?: number;
    amountOff?: number;
    currency?: string;
    durationInMonths?: number;
    /**
     * Optional provider-side expiry. Some providers only allow setting this at creation.
     */
    expiresAt?: Date;
}

export interface CreatePromotionCodeOptions {
    couponId: string;
    code: string;
    active?: boolean;
    expiresAt?: Date;
    metadata?: Record<string, string>;
}

/**
 * Features that payment providers may or may not support.
 * Used with supportsFeature() for runtime capability checks.
 */
export type PaymentProviderFeature =
    | 'coupons'              // Native coupon/discount support
    | 'promotion_codes'      // Promotion code support
    | 'proration'            // Inline subscription proration
    | 'cancel_at_period_end' // Native cancel-at-period-end
    | 'customer_portal'      // Self-service customer portal
    | 'invoices'             // Invoice generation
    | 'receipts'             // Payment receipt URLs
    | 'refunds'              // Refund processing
    | 'disputes'             // Dispute/chargeback handling
    | 'webhooks'             // Webhook support
    | 'elements'             // Embedded checkout elements
    | 'subscription_updates' // Inline subscription plan changes
    | 'trial_periods';       // Trial period support

export interface PaymentProvider {
    name: string;

    // Provider-specific configuration
    getWebhookSignatureHeader(): string; // e.g., 'stripe-signature', 'paystack-signature'

    /**
     * Check if this provider supports a specific feature.
     * Useful for conditional logic based on provider capabilities.
     */
    supportsFeature(feature: PaymentProviderFeature): boolean;

    // Checkout
    createCheckoutSession(opts: CheckoutOptions): Promise<CheckoutSessionResult>;
    getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails>;

    // Customer Management
    createCustomer(userId: string, email: string, name?: string): Promise<string>;
    updateCustomer(customerId: string, data: { email?: string; name?: string }): Promise<void>;
    createCustomerPortalSession(customerId: string, returnUrl: string): Promise<string>;

    // Subscription Management
    cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<SubscriptionResult>;
    undoCancelSubscription(subscriptionId: string): Promise<SubscriptionResult>;
    getSubscription(subscriptionId: string): Promise<SubscriptionDetails>;

    // Webhooks
    constructWebhookEvent(requestBody: Buffer, signature: string, secret: string): Promise<StandardizedWebhookEvent>;

    // Admin / Product Management
    createProduct(options: CreateProductOptions): Promise<string>;
    updateProduct(productId: string, options: UpdateProductOptions): Promise<void>;
    findProduct(name: string): Promise<string | null>;
    createPrice(options: CreatePriceOptions): Promise<PriceDetails>;
    verifyPrice(priceId: string): Promise<PriceDetails>;
    archivePrice(priceId: string): Promise<void>;
    createCoupon(opts: CreateCouponOptions): Promise<string>;
    deleteCoupon(couponId: string): Promise<void>;
    createPromotionCode(opts: CreatePromotionCodeOptions): Promise<string>;
    updatePromotionCode(id: string, active: boolean): Promise<void>;

    // Proration & Updates
    getProrationPreview(subscriptionId: string, newPriceId: string, userId: string): Promise<ProrationPreviewResult>;
    updateSubscriptionPlan(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult>;
    /**
     * Optional: schedule a subscription plan change to take effect at the end of the current billing cycle.
     * Only implemented by providers that support a true cycle-end update.
     */
    scheduleSubscriptionPlanChange?(subscriptionId: string, newPriceId: string, userId: string): Promise<SubscriptionUpdateResult>;

    // Billing & Refunds
    refundPayment(paymentId: string, amount?: number, reason?: string): Promise<{ id: string; amount: number; status: string; created: Date }>;
    getRefundDetails(paymentId: string): Promise<{ id: string; amount: number; status: string; created: Date } | null>;
    getPaymentReceiptUrl(paymentId: string): Promise<string | null>;
    getInvoiceUrl(invoiceId: string): Promise<string | null>;
    getDashboardUrl(type: 'payment' | 'subscription' | 'customer', id: string): string;

    // Elements / Embedded Checkout
    createPaymentIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; paymentIntentId: string }>;
    createSubscriptionIntent(opts: CheckoutOptions): Promise<{ clientSecret: string; subscriptionId: string }>;

    // Payment Intent retrieval (for embedded checkout confirmation)
    getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentDetails>;
}

export interface ProrationPreviewResult {
    prorationEnabled: boolean;
    amountDue: number;
    currency: string;
    /** Credit amount for unused subscription time (optional, for providers without native proration) */
    credit?: number;
    /** Human-readable message explaining proration status or next steps */
    message?: string;
    nextPaymentAttempt?: number | null;
    lineItems: {
        description: string | null;
        amount: number;
        proration?: boolean;
    }[];
}

export interface SubscriptionUpdateResult {
    success: boolean;
    newPeriodEnd?: Date;
    invoiceId?: string;
    amountPaid?: number;
}

export interface SubscriptionDetails {
    id: string;
    status: string;
    providerId?: string;
    subscriptionIdsByProvider?: ProviderIdMap;
    currentPeriodEnd: Date;
    currentPeriodStart: Date;
    cancelAtPeriodEnd: boolean;
    canceledAt?: Date | null;
    metadata?: Record<string, string>;
    priceId?: string;
    priceIdsByProvider?: ProviderIdMap;
    customerId?: string;
    customerIdsByProvider?: ProviderIdMap;
    latestInvoice?: {
        id: string;
        providerId?: string;
        invoiceIdsByProvider?: ProviderIdMap;
        amountPaid: number;
        amountDue: number;
        status: string;
        paymentIntentId?: string;
        subtotal?: number;
        total?: number;
        amountDiscount?: number;
    } | null;
}

export interface PaymentIntentDetails {
    id: string;
    status: 'succeeded' | 'processing' | 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'canceled' | string;
    amount: number;
    currency: string;
    providerId?: string;
    paymentIntentIdsByProvider?: ProviderIdMap;
    metadata?: Record<string, string>;
    invoiceId?: string;
    invoiceIdsByProvider?: ProviderIdMap;
    subscriptionId?: string;
    subscriptionIdsByProvider?: ProviderIdMap;
}
