import { describe, it, expect, afterEach, vi } from 'vitest';
import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';

type FetchUrl = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type MockJsonResponse = {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
};
type SeenCall = { url: string; method: string; body?: Record<string, unknown> };

function installFetch(handler: (url: FetchUrl, init?: FetchInit) => Promise<MockJsonResponse>) {
	global.fetch = vi.fn((url: FetchUrl, init?: FetchInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('Paddle price quantity limits', () => {
	const apiKey = 'pdl_test_dummy';
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it('locks overlay checkout quantity by default (min=max=1)', async () => {
		const seen: SeenCall[] = [];

		installFetch(async (url, init) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
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
		});

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
		const seen: SeenCall[] = [];

		installFetch(async (url, init) => {
			const u = String(url);
			const method = String(init?.method || 'GET').toUpperCase();
			const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
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
		});

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
