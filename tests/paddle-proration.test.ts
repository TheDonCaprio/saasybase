import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';

describe('Paddle proration', () => {
	const apiKey = 'pdl_test_dummy';
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('uses prorated_immediately preview totals and swaps the first subscription item price', async () => {
		const seen: Array<{ url: string; method: string; body?: any }> = [];

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			seen.push({ url: u, method, body });

			if (u.includes('/subscriptions/sub_123') && method === 'GET') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_123',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							items: [
								{ quantity: 1, price: { id: 'pri_old' } },
								{ quantity: 2, price: { id: 'pri_addon' } },
							],
						},
					}),
				};
			}

			if (u.includes('/subscriptions/sub_123/preview') && method === 'PATCH') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							currency_code: 'USD',
							immediate_transaction: {
								details: {
									totals: { total: '1080' },
									line_items: [
										{ description: 'Proration charge', totals: { total: '1080' }, proration: { rate: '0.5' } },
									],
								},
							},
						},
					}),
				};
			}

			throw new Error(`Unexpected fetch call: ${u} ${method}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		const preview = await provider.getProrationPreview('sub_123', 'pri_new', 'user_1');

		expect(preview.prorationEnabled).toBe(true);
		expect(preview.amountDue).toBe(1080);
		expect(preview.currency).toBe('USD');
		expect(preview.lineItems[0]?.amount).toBe(1080);
		expect(preview.lineItems[0]?.proration).toBe(true);

		const previewCall = seen.find((c) => c.url.includes('/subscriptions/sub_123/preview'));
		expect(previewCall?.body?.proration_billing_mode).toBe('prorated_immediately');
		expect(previewCall?.body?.items).toEqual([{ price_id: 'pri_new', quantity: 1 }]);
	});

	it('updates subscription with prorated_immediately and returns new period end + expected amount', async () => {
		const seen: Array<{ url: string; method: string; body?: any }> = [];

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			seen.push({ url: u, method, body });

			if (u.includes('/subscriptions/sub_123') && !u.includes('/preview') && method === 'GET') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_123',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							items: [{ quantity: 1, price: { id: 'pri_old' } }],
						},
					}),
				};
			}

			if (u.includes('/subscriptions/sub_123/preview') && method === 'PATCH') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							currency_code: 'USD',
							immediate_transaction: {
								details: { totals: { total: '500' }, line_items: [] },
							},
						},
					}),
				};
			}

			if (u.includes('/subscriptions/sub_123') && !u.includes('/preview') && method === 'PATCH') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_123',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							current_billing_period: {
								starts_at: '2026-01-01T00:00:00Z',
								ends_at: '2026-02-01T00:00:00Z',
							},
							items: [{ quantity: 1, price: { id: 'pri_new' } }],
						},
					}),
				};
			}

			throw new Error(`Unexpected fetch call: ${u} ${method}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		const result = await provider.updateSubscriptionPlan('sub_123', 'pri_new', 'user_1');

		expect(result.success).toBe(true);
		expect(result.amountPaid).toBe(500);
		expect(result.newPeriodEnd?.toISOString()).toBe('2026-02-01T00:00:00.000Z');

		const updateCall = seen.find((c) => c.url.includes('/subscriptions/sub_123') && c.method === 'PATCH' && !c.url.includes('/preview'));
		expect(updateCall?.body?.proration_billing_mode).toBe('prorated_immediately');
		expect(updateCall?.body?.items).toEqual([{ price_id: 'pri_new', quantity: 1 }]);
		expect(updateCall?.body?.on_payment_failure).toBe('prevent_change');
	});

	it('schedules subscription update for next billing period with full_next_billing_period', async () => {
		const seen: Array<{ url: string; method: string; body?: any }> = [];

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			seen.push({ url: u, method, body });

			if (u.includes('/subscriptions/sub_123') && !u.includes('/preview') && method === 'GET') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_123',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							items: [{ quantity: 1, price: { id: 'pri_old' } }],
						},
					}),
				};
			}

			if (u.includes('/subscriptions/sub_123') && !u.includes('/preview') && method === 'PATCH') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_123',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							current_billing_period: {
								starts_at: '2026-01-01T00:00:00Z',
								ends_at: '2026-02-01T00:00:00Z',
							},
							scheduled_change: {
								action: 'update',
								effective_at: '2026-02-01T00:00:00Z',
							},
							items: [{ quantity: 1, price: { id: 'pri_new' } }],
						},
					}),
				};
			}

			throw new Error(`Unexpected fetch call: ${u} ${method}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		const result = await provider.scheduleSubscriptionPlanChange?.('sub_123', 'pri_new', 'user_1');

		expect(result?.success).toBe(true);
		expect(result?.newPeriodEnd?.toISOString()).toBe('2026-02-01T00:00:00.000Z');

		const updateCall = seen.find((c) => c.url.includes('/subscriptions/sub_123') && c.method === 'PATCH' && !c.url.includes('/preview'));
		expect(updateCall?.body?.proration_billing_mode).toBe('do_not_bill');
		expect(updateCall?.body?.items).toEqual([{ price_id: 'pri_new', quantity: 1 }]);
		expect(updateCall?.body?.on_payment_failure).toBe('prevent_change');
	});

	it('getSubscription does NOT set cancelAtPeriodEnd when scheduled_change action is update', async () => {
		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();

			if (u.includes('/subscriptions/sub_plan_change') && method === 'GET') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_plan_change',
							status: 'active',
							customer_id: 'ctm_123',
							currency_code: 'USD',
							current_billing_period: {
								starts_at: '2026-01-01T00:00:00Z',
								ends_at: '2026-02-01T00:00:00Z',
							},
							scheduled_change: {
								action: 'update',
								effective_at: '2026-02-01T00:00:00Z',
							},
							items: [{ quantity: 1, price: { id: 'pri_next' } }],
						},
					}),
				};
			}
			throw new Error(`Unexpected fetch: ${u}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		const sub = await provider.getSubscription('sub_plan_change');

		// A scheduled plan change should NOT be reported as a pending cancellation.
		expect(sub.cancelAtPeriodEnd).toBe(false);
	});

	it('getSubscription DOES set cancelAtPeriodEnd when scheduled_change action is cancel', async () => {
		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();

			if (u.includes('/subscriptions/sub_pending_cancel') && method === 'GET') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'sub_pending_cancel',
							status: 'active',
							customer_id: 'ctm_456',
							currency_code: 'USD',
							current_billing_period: {
								starts_at: '2026-01-01T00:00:00Z',
								ends_at: '2026-02-01T00:00:00Z',
							},
							scheduled_change: {
								action: 'cancel',
								effective_at: '2026-02-01T00:00:00Z',
							},
							items: [{ quantity: 1, price: { id: 'pri_old' } }],
						},
					}),
				};
			}
			throw new Error(`Unexpected fetch: ${u}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		const sub = await provider.getSubscription('sub_pending_cancel');

		// A scheduled cancellation SHOULD be reported as cancelAtPeriodEnd.
		expect(sub.cancelAtPeriodEnd).toBe(true);
	});
});
