import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LemonSqueezyPaymentProvider } from '../lib/payment/providers/lemonsqueezy';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
	return {
		ok: init?.ok ?? true,
		status: init?.status ?? 200,
		json: async () => body,
	} as any;
}

describe('lemonsqueezy-catalog-sync', () => {
	const apiKey = 'ls_test_dummy_api_key';
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
		process.env.LEMONSQUEEZY_STORE_ID = '123';
	});

	afterEach(() => {
		global.fetch = originalFetch;
		delete process.env.LEMONSQUEEZY_STORE_ID;
	});

	it('createProduct reuses existing product by slug', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/products') && method === 'GET') {
				return jsonResponse({
					data: [
						{ type: 'products', id: 'p_1', attributes: { name: 'Pro', slug: 'plan-cml25rym4000k3kqfp3dgq4iw' } },
					],
				});
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const productId = await provider.createProduct({
			name: 'Pro',
			description: 'Pro plan',
			metadata: { planId: 'cml25rym4000k3kqfp3dgq4iw' },
		});

		expect(productId).toBe('p_1');
		expect((global.fetch as any).mock.calls.length).toBe(1);
	});

	it('createProduct POSTs when missing', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/products') && method === 'GET') {
				return jsonResponse({ data: [] });
			}
			if (String(url).endsWith('/products') && method === 'POST') {
				return jsonResponse({ data: { type: 'products', id: 'p_created', attributes: {} } }, { status: 201 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const productId = await provider.createProduct({
			name: 'Pro',
			description: 'Pro plan',
			metadata: { planId: 'cml25rym4000k3kqfp3dgq4iw' },
		});

		expect(productId).toBe('p_created');
		const calls = (global.fetch as any).mock.calls;
		expect(calls.map((c: any[]) => (c[1]?.method || 'GET').toUpperCase())).toEqual(['GET', 'POST']);
	});

	it('createPrice reuses existing variant and returns its id as the price id', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/variants') && method === 'GET') {
				return jsonResponse({
					data: [
						{
							type: 'variants',
							id: '777',
							attributes: {
								name: 'Pro',
								slug: 'plan-cml25rym4000k3kqfp3dgq4iw',
								price: 999,
								is_subscription: true,
								interval: 'month',
								interval_count: 1,
							},
						},
					],
				});
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		const price = await provider.createPrice({
			productId: 'p_1',
			unitAmount: 999,
			currency: 'USD',
			recurring: { interval: 'month' },
			metadata: { planId: 'cml25rym4000k3kqfp3dgq4iw', name: 'Pro' },
		});

		expect(price.id).toBe('777');
		expect(price.type).toBe('recurring');
	});

	it('archivePrice PATCHes the variant status to draft', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		global.fetch = vi.fn(async (url: any, init?: any) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/variants/777') && method === 'PATCH') {
				return jsonResponse({ data: { type: 'variants', id: '777', attributes: { status: 'draft' } } });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		}) as any;

		await provider.archivePrice('777');

		expect((global.fetch as any).mock.calls.length).toBe(1);
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(String(url)).toContain('/variants/777');
		expect(init?.method).toBe('PATCH');
	});
});
