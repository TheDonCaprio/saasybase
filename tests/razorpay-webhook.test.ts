import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import { RazorpayPaymentProvider } from '../lib/payment/providers/razorpay';
import { WebhookSignatureVerificationError } from '../lib/payment/errors';
import type { StandardizedCheckoutSession, StandardizedInvoice } from '../lib/payment/types';

describe('razorpay-webhook', () => {
	const keyId = 'rzp_test_keyid';
	const keySecret = 'rzp_test_keysecret';
	const webhookSecret = 'whsec_test';

	function sign(body: Buffer, secret: string) {
		return crypto.createHmac('sha256', secret).update(body).digest('hex');
	}

	it('verifies X-Razorpay-Signature and normalizes payment_link.paid as checkout.completed', async () => {
		process.env.RAZORPAY_KEY_ID = keyId;
		const provider = new RazorpayPaymentProvider(keySecret);

		const evt = {
			event: 'payment_link.paid',
			payload: {
				payment_link: {
					entity: {
						id: 'plink_123',
						amount: 999,
						currency: 'INR',
						status: 'paid',
						notes: { userId: 'user_123', priceId: 'plan_abc', checkoutMode: 'payment' },
						customer: { email: 'test@example.com' },
					},
				},
				payment: {
					entity: {
						id: 'pay_123',
						customer_id: 'cust_1',
						notes: { userId: 'user_123' },
					},
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('checkout.completed');
		const payload = normalized.payload as StandardizedCheckoutSession;
		expect(payload.id).toBe('plink_123');
		expect(payload.userId).toBe('user_123');
		expect(payload.paymentStatus).toBe('paid');
		expect(payload.amountTotal).toBe(999);
		expect(payload.currency).toBe('INR');
	});

	it('rejects invalid signature', async () => {
		process.env.RAZORPAY_KEY_ID = keyId;
		const provider = new RazorpayPaymentProvider(keySecret);
		const evt = { event: 'payment_link.paid', payload: {} };
		const body = Buffer.from(JSON.stringify(evt));

		await expect(provider.constructWebhookEvent(body, 'bad_signature', webhookSecret))
			.rejects
			.toBeInstanceOf(WebhookSignatureVerificationError);
	});

	it('normalizes subscription.activated as checkout.completed(subscription)', async () => {
		process.env.RAZORPAY_KEY_ID = keyId;
		const provider = new RazorpayPaymentProvider(keySecret);

		const evt = {
			event: 'subscription.activated',
			payload: {
				subscription: {
					entity: {
						id: 'sub_123',
						plan_id: 'plan_abc',
						status: 'active',
						notes: { userId: 'user_123', priceId: 'plan_abc', checkoutMode: 'subscription' },
					},
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('checkout.completed');
		const payload = normalized.payload as StandardizedCheckoutSession;
		expect(payload.mode).toBe('subscription');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.lineItems?.[0]?.priceId).toBe('plan_abc');
	});

	it('normalizes subscription renewal payment.captured as invoice.payment_succeeded (even without notes)', async () => {
		process.env.RAZORPAY_KEY_ID = keyId;
		const provider = new RazorpayPaymentProvider(keySecret);

		const evt = {
			event: 'payment.captured',
			payload: {
				payment: {
					entity: {
						id: 'pay_renewal_1',
						amount: 12900,
						currency: 'INR',
						subscription_id: 'sub_123',
						customer_id: 'cust_1',
						// notes intentionally missing: this is the renewal case that broke.
					},
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('invoice.payment_succeeded');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.paymentIntentId).toBe('pay_renewal_1');
		expect(payload.amountPaid).toBe(12900);
		expect(payload.currency).toBe('INR');
	});

	it('normalizes subscription renewal payment.failed as invoice.payment_failed (even without notes)', async () => {
		process.env.RAZORPAY_KEY_ID = keyId;
		const provider = new RazorpayPaymentProvider(keySecret);

		const evt = {
			event: 'payment.failed',
			payload: {
				payment: {
					entity: {
						id: 'pay_renewal_failed_1',
						amount: 12900,
						currency: 'INR',
						subscription_id: 'sub_123',
						customer_id: 'cust_1',
						// notes intentionally missing.
					},
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('invoice.payment_failed');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.paymentIntentId).toBe('pay_renewal_failed_1');
		expect(payload.amountDue).toBe(12900);
		expect(payload.amountPaid).toBe(0);
	});
});
