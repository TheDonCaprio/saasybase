import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LemonSqueezyPaymentProvider } from '../lib/payment/providers/lemonsqueezy';

type FetchUrl = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type MockResponse = Pick<Response, 'ok' | 'status' | 'json'>;

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): MockResponse {
	return {
		ok: init?.ok ?? true,
		status: init?.status ?? 200,
		json: async () => body,
	};
}

function installFetch(handler: (url: FetchUrl, init?: FetchInit) => Promise<MockResponse>) {
	global.fetch = vi.fn((url: FetchUrl, init?: FetchInit) => handler(url, init)) as unknown as typeof fetch;
}

function getFetchCalls(): Array<[FetchUrl, FetchInit?]> {
	return vi.mocked(global.fetch).mock.calls as Array<[FetchUrl, FetchInit?]>;
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

		installFetch(async (url, init) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/products') && method === 'GET') {
				return jsonResponse({
					data: [
						{ type: 'products', id: 'p_1', attributes: { name: 'Pro', slug: 'plan-cml25rym4000k3kqfp3dgq4iw' } },
					],
				});
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		});

		const productId = await provider.createProduct({
			name: 'Pro',
			description: 'Pro plan',
			metadata: { planId: 'cml25rym4000k3kqfp3dgq4iw' },
		});

		expect(productId).toBe('p_1');
		expect(getFetchCalls().length).toBe(1);
	});

	it('createProduct POSTs when missing', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		installFetch(async (url, init) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/products') && method === 'GET') {
				return jsonResponse({ data: [] });
			}
			if (String(url).endsWith('/products') && method === 'POST') {
				return jsonResponse({ data: { type: 'products', id: 'p_created', attributes: {} } }, { status: 201 });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		});

		const productId = await provider.createProduct({
			name: 'Pro',
			description: 'Pro plan',
			metadata: { planId: 'cml25rym4000k3kqfp3dgq4iw' },
		});

		expect(productId).toBe('p_created');
		const calls = getFetchCalls();
		expect(calls.map(([, init]) => (init?.method || 'GET').toUpperCase())).toEqual(['GET', 'POST']);
	});

	it('createPrice reuses existing variant and returns its id as the price id', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		installFetch(async (url, init) => {
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
		});

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

		installFetch(async (url, init) => {
			const method = (init?.method || 'GET').toUpperCase();
			if (String(url).includes('/variants/777') && method === 'PATCH') {
				return jsonResponse({ data: { type: 'variants', id: '777', attributes: { status: 'draft' } } });
			}
			throw new Error('Unexpected fetch: ' + method + ' ' + String(url));
		});

		await provider.archivePrice('777');

		expect(getFetchCalls().length).toBe(1);
		const [url, init] = getFetchCalls()[0];
		expect(String(url)).toContain('/variants/777');
		expect(init?.method).toBe('PATCH');
	});
});
