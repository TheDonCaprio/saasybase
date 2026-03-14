import crypto from 'crypto';
import { describe, it, expect } from 'vitest';

import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';
import type { StandardizedCheckoutSession, StandardizedInvoice } from '../lib/payment/types';

describe('paddle-renewal-webhook', () => {
	const apiKey = 'pdl_test_dummy';
	const webhookSecret = 'whsec_test_dummy';

	function paddleSignatureHeader(body: Buffer, secret: string, ts = `${Math.floor(Date.now() / 1000)}`) {
		const h1 = crypto
			.createHmac('sha256', secret)
			.update(ts, 'utf8')
			.update(':', 'utf8')
			.update(body)
			.digest('hex');
		return `ts=${ts}; h1=${h1}`;
	}

	it('normalizes recurring transaction.completed as invoice.payment_succeeded', async () => {
		const provider = new PaddlePaymentProvider(apiKey);
		const evt = {
			event_id: 'evt_1',
			event_type: 'transaction.completed',
			occurred_at: '2026-03-08T00:00:00Z',
			data: {
				id: 'txn_renew_1',
				status: 'completed',
				origin: 'subscription_recurring',
				customer_id: 'ctm_123',
				subscription_id: 'sub_123',
				invoice_id: 'inv_123',
				currency_code: 'USD',
				custom_data: { userId: 'user_123', planId: 'plan_pro' },
				items: [{ price_id: 'pri_123', quantity: 1 }],
				details: {
					totals: { total: '1299', subtotal: '1299', discount: '0' },
					line_items: [{ price: { id: 'pri_123' }, quantity: 1, totals: { total: '1299' } }],
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = paddleSignatureHeader(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('invoice.payment_succeeded');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.id).toBe('inv_123');
		expect(payload.paymentIntentId).toBe('txn_renew_1');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.customerId).toBe('ctm_123');
		expect(payload.amountPaid).toBe(1299);
		expect(payload.amountDue).toBe(0);
		expect(payload.billingReason).toBe('subscription_recurring');
		expect(payload.lineItems?.[0]?.priceId).toBe('pri_123');
	});

	it('normalizes recurring transaction.payment_failed as invoice.payment_failed', async () => {
		const provider = new PaddlePaymentProvider(apiKey);
		const evt = {
			event_id: 'evt_2',
			event_type: 'transaction.payment_failed',
			occurred_at: '2026-03-08T00:00:00Z',
			data: {
				id: 'txn_renew_failed_1',
				status: 'past_due',
				origin: 'subscription_recurring',
				customer_id: 'ctm_123',
				subscription_id: 'sub_123',
				invoice_id: 'inv_124',
				currency_code: 'USD',
				custom_data: { userId: 'user_123' },
				details: {
					totals: { total: '1299', subtotal: '1299', discount: '0' },
					line_items: [{ price: { id: 'pri_123' }, quantity: 1, totals: { total: '1299' } }],
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = paddleSignatureHeader(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('invoice.payment_failed');
		const payload = normalized.payload as StandardizedInvoice;
		expect(payload.id).toBe('inv_124');
		expect(payload.paymentIntentId).toBe('txn_renew_failed_1');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.amountPaid).toBe(0);
		expect(payload.amountDue).toBe(1299);
		expect(payload.billingReason).toBe('subscription_recurring');
	});

	it('keeps initial subscription transaction.completed on checkout path', async () => {
		const provider = new PaddlePaymentProvider(apiKey);
		const evt = {
			event_id: 'evt_3',
			event_type: 'transaction.completed',
			occurred_at: '2026-03-08T00:00:00Z',
			data: {
				id: 'txn_initial_1',
				status: 'completed',
				origin: 'web',
				customer_id: 'ctm_123',
				subscription_id: 'sub_123',
				currency_code: 'USD',
				custom_data: { userId: 'user_123', checkoutMode: 'subscription', planId: 'plan_pro' },
				items: [{ price_id: 'pri_123', quantity: 1 }],
				details: {
					totals: { total: '1299', subtotal: '1299', discount: '0' },
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = paddleSignatureHeader(body, webhookSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, webhookSecret);

		expect(normalized.type).toBe('checkout.completed');
		const payload = normalized.payload as StandardizedCheckoutSession;
		expect(payload.mode).toBe('subscription');
		expect(payload.subscriptionId).toBe('sub_123');
		expect(payload.paymentIntentId).toBe('txn_initial_1');
	});

	it('rejects stale signed webhooks', async () => {
		const provider = new PaddlePaymentProvider(apiKey);
		const evt = {
			event_id: 'evt_stale_1',
			event_type: 'transaction.completed',
			occurred_at: '2026-03-08T00:00:00Z',
			data: {
				id: 'txn_stale_1',
				status: 'completed',
				origin: 'web',
				customer_id: 'ctm_123',
				currency_code: 'USD',
				custom_data: { userId: 'user_123' },
				items: [{ price_id: 'pri_123', quantity: 1 }],
				details: {
					totals: { total: '1299', subtotal: '1299', discount: '0' },
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const oldTs = `${Math.floor(Date.now() / 1000) - 3600}`;
		const sig = paddleSignatureHeader(body, webhookSecret, oldTs);

		await expect(provider.constructWebhookEvent(body, sig, webhookSecret))
			.rejects.toThrow('Expired Paddle webhook signature');
	});
});