/**
 * Paystack Subscription Flow Tests
 * 
 * Tests the Paystack subscription flow where:
 * 1. charge.success fires first (when payment completes)
 * 2. subscription.create fires after (when Paystack creates the subscription)
 * 
 * This tests the normalization of webhooks and the pending subscription payment flow.
 */

import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaystackPaymentProvider } from '../lib/payment/providers/paystack';
import type { StandardizedCheckoutSession, StandardizedInvoice, StandardizedSubscription } from '../lib/payment/types';

const TEST_SECRET_KEY = 'sk_test_xxxxxxxxxxxxx';

describe('Paystack Subscription Flow', () => {
    let provider: PaystackPaymentProvider;

    beforeEach(() => {
        provider = new PaystackPaymentProvider(TEST_SECRET_KEY);
    });

    it('falls back to valid dates when recent subscription lookup receives malformed timestamps', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                status: true,
                message: 'ok',
                data: [
                    {
                        id: 1,
                        subscription_code: 'SUB_bad_dates',
                        email_token: 'email_token',
                        status: 'active',
                        amount: 500000,
                        plan: {
                            id: 10,
                            plan_code: 'PLN_test_plan_monthly',
                            name: 'Monthly Plan',
                            description: null,
                            amount: 500000,
                            interval: 'monthly',
                            currency: 'NGN',
                        },
                        customer: {
                            customer_code: 'CUS_xxxxx',
                            email: 'test@example.com',
                        },
                        next_payment_date: '2027-05-12T10:53:00.000Z',
                        created_at: 'not-a-date',
                        cancelled_at: 'also-not-a-date',
                        cron_expression: '0 0 1 * *',
                    },
                ],
            }),
        });

        vi.stubGlobal('fetch', fetchMock);

        const subscription = await provider.findRecentSubscriptionByCustomerAndPriceId('CUS_xxxxx', 'PLN_test_plan_monthly');

        expect(subscription).not.toBeNull();
        expect(subscription?.id).toBe('SUB_bad_dates');
        expect(subscription?.currentPeriodEnd.toISOString()).toBe('2027-05-12T10:53:00.000Z');
        expect(subscription?.currentPeriodStart.getTime()).toBe(subscription?.currentPeriodEnd.getTime());
        expect(subscription?.canceledAt).toBeNull();
    });

    describe('charge.success webhook normalization', () => {
        it('should set mode to "subscription" when tx.plan is present', async () => {
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_123',
                    amount: 500000, // 5000 NGN in kobo
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789'
                    },
                    // This is the key field - when a plan code was passed to transaction/initialize
                    plan: {
                        id: 123,
                        plan_code: 'PLN_test_plan_monthly',
                        name: 'Monthly Plan'
                    },
                    // NOTE: subscription may NOT be present yet at charge.success time!
                    // subscription: { subscription_code: 'SUB_xxxxx' }
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('subscription');
            expect(session.lineItems).toBeDefined();
            expect(session.lineItems).toHaveLength(1);
            expect(session.lineItems![0].priceId).toBe('PLN_test_plan_monthly');
        });

        it('should set mode to "payment" when tx.plan is NOT present', async () => {
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_456',
                    amount: 100000,
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789'
                    }
                    // No plan field = one-time payment
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('payment');
            expect(session.lineItems).toBeUndefined();
        });

        it('should handle plan object with plan_code present', async () => {
            // Simulate what Paystack actually sends based on their docs
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_789',
                    amount: 500000,
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789',
                        planId: 'internal_plan_id' // Our internal plan ID
                    },
                    plan: {
                        id: 123,
                        plan_code: 'PLN_monthly_sub',
                        name: 'Monthly Subscription'
                    },
                    // Subscription may or may not be present
                    subscription: {
                        subscription_code: 'SUB_test_subscription'
                    }
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('subscription');
            expect(session.subscriptionId).toBe('SUB_test_subscription');
            expect(session.lineItems?.[0]?.priceId).toBe('PLN_monthly_sub');
            expect(session.userId).toBe('user_123456789');
        });

        it('should still have mode=subscription even without subscription_code', async () => {
            // This is the critical case - charge.success fires BEFORE subscription.create
            // So subscription_code may not be available yet
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_no_sub_yet',
                    amount: 500000,
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789'
                    },
                    plan: {
                        id: 123,
                        plan_code: 'PLN_monthly_sub',
                        name: 'Monthly Subscription'
                    }
                    // NO subscription field yet - Paystack hasn't created it
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('subscription');
            expect(session.subscriptionId).toBeUndefined(); // Not available yet
            expect(session.lineItems?.[0]?.priceId).toBe('PLN_monthly_sub');
        });

        it('should use metadata checkoutMode and planCode when tx.plan is missing', async () => {
            // CRITICAL FIX: Paystack doesn't always include tx.plan in charge.success
            // We store checkoutMode and planCode in metadata during checkout creation
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_metadata_fallback',
                    amount: 500000,
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789',
                        // These are stored by our createCheckoutSession method
                        checkoutMode: 'subscription',
                        planCode: 'PLN_monthly_sub'
                    }
                    // NO plan field - this is what Paystack actually sends!
                    // NO subscription field yet - Paystack hasn't created it
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('subscription'); // Falls back to metadata
            expect(session.subscriptionId).toBeUndefined(); // Not available yet
            expect(session.lineItems).toBeDefined();
            expect(session.lineItems?.[0]?.priceId).toBe('PLN_monthly_sub'); // Falls back to metadata
        });

        it('should use metadata.priceId as fallback when planCode is missing (embedded checkout)', async () => {
            // This simulates what embedded checkout sends - priceId in metadata instead of planCode
            const chargeSuccessEvent = {
                event: 'charge.success',
                data: {
                    id: 123456789,
                    reference: 'test_ref_embedded_fallback',
                    amount: 500000,
                    currency: 'NGN',
                    status: 'success',
                    gateway_response: 'Successful',
                    paid_at: '2025-12-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:50.000Z',
                    channel: 'card',
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    metadata: {
                        userId: 'user_123456789',
                        planId: 'internal_plan_id',
                        priceId: 'PLN_monthly_sub', // Embedded checkout passes priceId, not planCode
                        checkoutMode: 'subscription'
                    }
                    // NO plan field - this is what Paystack sends for embedded checkout
                }
            };

            const body = Buffer.from(JSON.stringify(chargeSuccessEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const session = result.payload as StandardizedCheckoutSession;

            expect(result.type).toBe('checkout.completed');
            expect(session.mode).toBe('subscription');
            expect(session.lineItems).toBeDefined();
            expect(session.lineItems?.[0]?.priceId).toBe('PLN_monthly_sub'); // Falls back to metadata.priceId
        });
    });

    describe('subscription.create webhook normalization', () => {
        it('should correctly normalize subscription.create event', async () => {
            const subscriptionCreateEvent = {
                event: 'subscription.create',
                data: {
                    id: 456789,
                    subscription_code: 'SUB_test_subscription',
                    email_token: 'xxx',
                    status: 'active',
                    amount: 500000,
                    currency: 'NGN',
                    next_payment_date: '2026-01-19T11:19:57.000Z',
                    created_at: '2025-12-19T11:19:57.000Z',
                    cancelled_at: null,
                    customer: {
                        id: 12345,
                        customer_code: 'CUS_xxxxx',
                        email: 'test@example.com',
                        first_name: 'Test',
                        last_name: 'User'
                    },
                    plan: {
                        id: 123,
                        plan_code: 'PLN_monthly_sub',
                        name: 'Monthly Subscription',
                        amount: 500000,
                        interval: 'monthly',
                        currency: 'NGN'
                    }
                }
            };

            const body = Buffer.from(JSON.stringify(subscriptionCreateEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const subscription = result.payload as StandardizedSubscription;

            expect(result.type).toBe('subscription.created');
            expect(subscription.id).toBe('SUB_test_subscription');
            expect(subscription.status).toBe('active');
            expect(subscription.priceId).toBe('PLN_monthly_sub');
            expect(subscription.customerId).toBe('CUS_xxxxx');
        });
    });

    describe('invoice.update webhook normalization', () => {
        it('should populate paymentIntentId from transaction reference when present', async () => {
            const invoiceUpdateEvent = {
                event: 'invoice.update',
                data: {
                    invoice_code: 'INV_test_invoice',
                    amount: 500000,
                    currency: 'NGN',
                    subscription: { subscription_code: 'SUB_test_subscription' },
                    customer: { customer_code: 'CUS_xxxxx' },
                    transaction: { reference: 'test_ref_renewal_123' }
                }
            };

            const body = Buffer.from(JSON.stringify(invoiceUpdateEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const invoice = result.payload as StandardizedInvoice;

            expect(result.type).toBe('invoice.payment_succeeded');
            expect(invoice.id).toBe('INV_test_invoice');
            expect(invoice.subscriptionId).toBe('SUB_test_subscription');
            expect(invoice.paymentIntentId).toBe('test_ref_renewal_123');
        });

        it('should fall back to invoice_code when transaction reference is missing', async () => {
            const invoiceUpdateEvent = {
                event: 'invoice.update',
                data: {
                    invoice_code: 'INV_test_invoice_fallback',
                    amount: 500000,
                    currency: 'NGN',
                    subscription: { subscription_code: 'SUB_test_subscription' },
                    customer: { customer_code: 'CUS_xxxxx' }
                }
            };

            const body = Buffer.from(JSON.stringify(invoiceUpdateEvent));
            const signature = createHmacSignature(body, TEST_SECRET_KEY);

            const result = await provider.constructWebhookEvent(body, signature);
            const invoice = result.payload as StandardizedInvoice;

            expect(result.type).toBe('invoice.payment_succeeded');
            expect(invoice.paymentIntentId).toBe('INV_test_invoice_fallback');
        });
    });
});

// Helper to create HMAC signature like Paystack does
function createHmacSignature(body: Buffer, secret: string): string {
    return crypto.createHmac('sha512', secret).update(body).digest('hex');
}
