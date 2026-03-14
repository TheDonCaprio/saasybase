import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';

import { StripePaymentProvider } from '../lib/payment/providers/stripe';
import type { StandardizedInvoice } from '../lib/payment/types';

describe('stripe-webhook', () => {
	const stripeSecretKey = 'sk_test_123';
	const webhookSecret = 'whsec_test_123';
	const mockPrice = { id: 'price_123' } as unknown as Stripe.Price;
	const mockLineItem = (id: string) => ({
		id,
		object: 'line_item',
		amount: 2500,
		description: 'Pro renewal',
		price: mockPrice,
	}) as unknown as Stripe.InvoiceLineItem;

	function sign(body: string) {
		return Stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });
	}

	it('normalizes invoice.payment_succeeded for recurring renewals', async () => {
		const provider = new StripePaymentProvider(stripeSecretKey);
		const evt = {
			id: 'evt_renew_1',
			object: 'event',
			type: 'invoice.payment_succeeded',
			data: {
				object: {
					id: 'in_123',
					object: 'invoice',
					amount_paid: 2500,
					amount_due: 0,
					total_discount_amounts: [],
					subtotal: 2500,
					total: 2500,
					currency: 'usd',
					status: 'paid',
					payment_intent: 'pi_123',
					subscription: 'sub_123',
					customer: 'cus_123',
					customer_email: 'test@example.com',
					metadata: { userId: 'user_123' },
					billing_reason: 'subscription_cycle',
					lines: {
						object: 'list',
						data: [mockLineItem('il_1')],
						has_more: false,
						url: '/v1/invoices/in_123/lines',
					},
				},
			},
		} as unknown as Stripe.Event;

		const body = JSON.stringify(evt);
		const normalized = await provider.constructWebhookEvent(Buffer.from(body), sign(body), webhookSecret);

		expect(normalized.type).toBe('invoice.payment_succeeded');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.id).toBe('in_123');
		expect(payload.paymentIntentId).toBe('pi_123');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.amountPaid).toBe(2500);
		expect(payload.billingReason).toBe('subscription_cycle');
	});

	it('normalizes invoice.payment_failed for recurring renewals', async () => {
		const provider = new StripePaymentProvider(stripeSecretKey);
		const evt = {
			id: 'evt_renew_fail_1',
			object: 'event',
			type: 'invoice.payment_failed',
			data: {
				object: {
					id: 'in_124',
					object: 'invoice',
					amount_paid: 0,
					amount_due: 2500,
					total_discount_amounts: [],
					subtotal: 2500,
					total: 2500,
					currency: 'usd',
					status: 'open',
					payment_intent: 'pi_124',
					subscription: 'sub_123',
					customer: 'cus_123',
					customer_email: 'test@example.com',
					metadata: { userId: 'user_123' },
					billing_reason: 'subscription_cycle',
					lines: {
						object: 'list',
						data: [mockLineItem('il_2')],
						has_more: false,
						url: '/v1/invoices/in_124/lines',
					},
				},
			},
		} as unknown as Stripe.Event;

		const body = JSON.stringify(evt);
		const normalized = await provider.constructWebhookEvent(Buffer.from(body), sign(body), webhookSecret);

		expect(normalized.type).toBe('invoice.payment_failed');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.id).toBe('in_124');
		expect(payload.paymentIntentId).toBe('pi_124');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.amountDue).toBe(2500);
		expect(payload.billingReason).toBe('subscription_cycle');
	});
});
