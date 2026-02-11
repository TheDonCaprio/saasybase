import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RazorpayPaymentProvider } from '../lib/payment/providers/razorpay';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
	return {
		ok: init?.ok ?? true,
		status: init?.status ?? 200,
		json: async () => body,
	} as any;
}

describe('razorpay-provider (minimum working)', () => {
	const keyId = 'rzp_test_keyid';
	const keySecret = 'rzp_test_keysecret';
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
		process.env.RAZORPAY_KEY_ID = keyId;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		delete process.env.RAZORPAY_KEY_ID;
		delete process.env.RAZORPAY_ENABLE_OFFERS;
	});

	it('createCheckoutSession (payment) creates a payment link and returns short_url', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).endsWith('/payment_links') && method === 'POST') {
				return jsonResponse({ id: 'plink_123', short_url: 'https://rzp.io/i/abc', status: 'created' }, { status: 200 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const session = await provider.createCheckoutSession({
			userId: 'user_1',
			mode: 'payment',
			amount: 999,
			currency: 'INR',
			successUrl: 'https://example.com/success',
			cancelUrl: 'https://example.com/cancel',
			customerEmail: 'test@example.com',
		});

		expect(session.id).toBe('plink_123');
		expect(session.url).toBe('https://rzp.io/i/abc');
	});

	it('createCheckoutSession (subscription) creates subscription and returns short_url', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).endsWith('/subscriptions') && method === 'POST') {
				return jsonResponse({ id: 'sub_123', short_url: 'https://rzp.io/i/sub', status: 'created', plan_id: 'plan_abc' }, { status: 200 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const session = await provider.createCheckoutSession({
			userId: 'user_1',
			mode: 'subscription',
			priceId: 'plan_abc',
			successUrl: 'https://example.com/success',
			cancelUrl: 'https://example.com/cancel',
			customerEmail: 'test@example.com',
		});

		expect(session.id).toBe('sub_123');
		expect(session.url).toBe('https://rzp.io/i/sub');
	});

	it('cancelSubscription maps immediately=false to cancel_at_cycle_end', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/subscriptions/sub_123/cancel') && method === 'POST') {
				const body = JSON.parse(init?.body || '{}');
				expect(body.cancel_at_cycle_end).toBe(1);
				return jsonResponse({ id: 'sub_123', status: 'active', current_end: Math.floor(Date.now() / 1000) + 3600 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const res = await provider.cancelSubscription('sub_123', false);
		expect(res.id).toBe('sub_123');
	});

	it('createCustomerPortalSession returns subscription short_url', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/subscriptions/sub_123') && method === 'GET') {
				return jsonResponse({ id: 'sub_123', status: 'active', short_url: 'https://rzp.io/i/manage' }, { status: 200 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const url = await provider.createCustomerPortalSession('sub_123', 'https://example.com/return');
		expect(url).toBe('https://rzp.io/i/manage');
	});

	it('updateSubscriptionPlan PATCHes /subscriptions/:id with schedule_change_at=now', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);
		expect(provider.supportsFeature('subscription_updates')).toBe(true);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/subscriptions/sub_123') && method === 'PATCH') {
				const body = JSON.parse(init?.body || '{}');
				expect(body.plan_id).toBe('plan_new');
				expect(body.schedule_change_at).toBe('now');
				return jsonResponse({
					id: 'sub_123',
					status: 'active',
					plan_id: 'plan_new',
					current_end: Math.floor(Date.now() / 1000) + 86400,
				});
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const res = await provider.updateSubscriptionPlan('sub_123', 'plan_new', 'user_1');
		expect(res.success).toBe(true);
		expect(res.newPeriodEnd instanceof Date).toBe(true);
	});

	it('scheduleSubscriptionPlanChange PATCHes /subscriptions/:id with schedule_change_at=cycle_end', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/subscriptions/sub_123') && method === 'PATCH') {
				const body = JSON.parse(init?.body || '{}');
				expect(body.plan_id).toBe('plan_next');
				expect(body.schedule_change_at).toBe('cycle_end');
				return jsonResponse({
					id: 'sub_123',
					status: 'active',
					has_scheduled_changes: true,
					current_end: Math.floor(Date.now() / 1000) + 86400,
				});
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const res = await provider.scheduleSubscriptionPlanChange?.('sub_123', 'plan_next', 'user_1');
		expect(res?.success).toBe(true);
	});

	it('refundPayment POSTs /payments/:id/refund', async () => {
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/payments/pay_123/refund') && method === 'POST') {
				return jsonResponse({ id: 'rfnd_1', amount: 500, status: 'processed', created_at: Math.floor(Date.now() / 1000) });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const refund = await provider.refundPayment('pay_123', 500);
		expect(refund.id).toBe('rfnd_1');
		expect(refund.amount).toBe(500);
	});

	it('createCheckoutSession (payment) includes offer_id when RAZORPAY_ENABLE_OFFERS=true', async () => {
		process.env.RAZORPAY_ENABLE_OFFERS = 'true';
		const provider = new RazorpayPaymentProvider(keySecret);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).endsWith('/payment_links') && method === 'POST') {
				const body = JSON.parse(init?.body || '{}');
				expect(body.offer_id).toBe('offer_abc123');
				return jsonResponse({ id: 'plink_456', short_url: 'https://rzp.io/i/offer', status: 'created' }, { status: 200 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const session = await provider.createCheckoutSession({
			userId: 'user_1',
			mode: 'payment',
			amount: 1999,
			currency: 'INR',
			successUrl: 'https://example.com/success',
			cancelUrl: 'https://example.com/cancel',
			customerEmail: 'test@example.com',
			metadata: { razorpayOfferId: 'offer_abc123' },
		});

		expect(session.id).toBe('plink_456');
		expect(session.url).toBe('https://rzp.io/i/offer');
	});

	it('createCheckoutSession (payment) falls back when Razorpay rejects offer_id field', async () => {
		process.env.RAZORPAY_ENABLE_OFFERS = 'true';
		const provider = new RazorpayPaymentProvider(keySecret);

		let call = 0;
		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).endsWith('/payment_links') && method === 'POST') {
				call += 1;
				const body = JSON.parse(init?.body || '{}');
				if (call === 1) {
					expect(body.offer_id).toBe('offer_badfield');
					return jsonResponse(
						{ error: { description: 'offer_id is not allowed' } },
						{ ok: false, status: 400 }
					);
				}
				expect(body.offer_id).toBeUndefined();
				return jsonResponse({ id: 'plink_789', short_url: 'https://rzp.io/i/fallback', status: 'created' }, { status: 200 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const session = await provider.createCheckoutSession({
			userId: 'user_1',
			mode: 'payment',
			amount: 2500,
			currency: 'INR',
			successUrl: 'https://example.com/success',
			cancelUrl: 'https://example.com/cancel',
			customerEmail: 'test@example.com',
			metadata: { razorpayOfferId: 'offer_badfield' },
		});

		expect(session.id).toBe('plink_789');
		expect(session.url).toBe('https://rzp.io/i/fallback');
		expect(call).toBe(2);
	});
});
