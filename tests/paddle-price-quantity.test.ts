import { describe, it, expect, afterEach, vi } from 'vitest';
import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';

describe('Paddle price quantity limits', () => {
	const apiKey = 'pdl_test_dummy';
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('locks overlay checkout quantity by default (min=max=1)', async () => {
		const seen: Array<{ url: string; method: string; body?: any }> = [];

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			seen.push({ url: u, method, body });

			if (u.includes('/prices') && method === 'POST') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'pri_test',
							product_id: 'pro_test',
							unit_price: { amount: '1000', currency_code: 'USD' },
							billing_cycle: null,
						},
					}),
				};
			}

			throw new Error(`Unexpected fetch call: ${u} ${method}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		await provider.createPrice({
			productId: 'pro_test',
			unitAmount: 1000,
			currency: 'USD',
			metadata: { name: 'Test price' },
		});

		const call = seen.find(c => c.method === 'POST' && c.url.includes('/prices'));
		expect(call?.body?.quantity).toEqual({ minimum: 1, maximum: 1 });
	});

	it('allows overriding quantity limits when provided', async () => {
		const seen: Array<{ url: string; method: string; body?: any }> = [];

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) : undefined;
			seen.push({ url: u, method, body });

			if (u.includes('/prices') && method === 'POST') {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: {
							id: 'pri_test',
							product_id: 'pro_test',
							unit_price: { amount: '1000', currency_code: 'USD' },
							billing_cycle: null,
						},
					}),
				};
			}

			throw new Error(`Unexpected fetch call: ${u} ${method}`);
		}) as any;

		const provider = new PaddlePaymentProvider(apiKey);
		await provider.createPrice({
			productId: 'pro_test',
			unitAmount: 1000,
			currency: 'USD',
			quantity: { minimum: 2, maximum: 5 },
		});

		const call = seen.find(c => c.method === 'POST' && c.url.includes('/prices'));
		expect(call?.body?.quantity).toEqual({ minimum: 2, maximum: 5 });
	});
});
