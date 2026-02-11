import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import { LemonSqueezyPaymentProvider } from '../lib/payment/providers/lemonsqueezy';
import { WebhookSignatureVerificationError } from '../lib/payment/errors';

describe('lemonsqueezy-webhook', () => {
	const apiKey = 'ls_test_dummy_api_key';
	const signingSecret = 'whsec_test_dummy';

	function sign(body: Buffer, secret: string) {
		return crypto.createHmac('sha256', secret).update(body).digest('hex');
	}

	it('verifies X-Signature and normalizes order_created', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);
		const evt = {
			meta: {
				event_name: 'order_created',
				custom_data: { userId: 'user_123' },
			},
			data: {
				type: 'orders',
				id: '1',
				attributes: {
					customer_id: 25,
					user_email: 'test@example.com',
					currency: 'USD',
					subtotal: 999,
					total: 1199,
					status: 'paid',
					first_order_item: { variant_id: 42 },
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, signingSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, signingSecret);

		expect(normalized.type).toBe('checkout.completed');
		const payload = normalized.payload as any;
		expect(payload.userId).toBe('user_123');
		expect(payload.amountTotal).toBe(1199);
		expect(payload.lineItems?.[0]?.priceId).toBe('42');
	});

	it('rejects invalid signature', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);
		const evt = { meta: { event_name: 'order_created' }, data: { type: 'orders', id: '1' } };
		const body = Buffer.from(JSON.stringify(evt));

		await expect(provider.constructWebhookEvent(body, 'bad_signature', signingSecret))
			.rejects
			.toBeInstanceOf(WebhookSignatureVerificationError);
	});

	it('normalizes subscription_updated with variant_id as priceId', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);
		const evt = {
			meta: {
				event_name: 'subscription_updated',
				custom_data: { userId: 'user_123' },
			},
			data: {
				type: 'subscriptions',
				id: 'sub_1',
				attributes: {
					status: 'active',
					variant_id: 777,
					customer_id: 25,
					renews_at: '2026-02-15T00:00:00.000Z',
					created_at: '2026-01-15T00:00:00.000Z',
				},
			},
		};

		const body = Buffer.from(JSON.stringify(evt));
		const sig = sign(body, signingSecret);
		const normalized = await provider.constructWebhookEvent(body, sig, signingSecret);

		expect(normalized.type).toBe('subscription.updated');
		const payload = normalized.payload as any;
		expect(payload.id).toBe('sub_1');
		expect(payload.priceId).toBe('777');
	});
});
