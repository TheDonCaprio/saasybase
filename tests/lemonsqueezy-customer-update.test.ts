import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LemonSqueezyPaymentProvider } from '../lib/payment/providers/lemonsqueezy';

type FetchUrl = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type MockResponse = Pick<Response, 'ok' | 'status' | 'json'>;

function installFetch(handler: (url: FetchUrl, init?: FetchInit) => Promise<MockResponse>) {
	const fetchMock = vi.fn((url: FetchUrl, init?: FetchInit) => handler(url, init));
	vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
	return fetchMock;
}

describe('lemonsqueezy-customer-update', () => {
	const apiKey = 'ls_test_dummy_api_key';

	beforeEach(() => {
		vi.restoreAllMocks();
		process.env.LEMONSQUEEZY_STORE_ID = '123';
	});

	afterEach(() => {
		delete process.env.LEMONSQUEEZY_STORE_ID;
	});

	it('PATCHes customer name/email when provided', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);

		const fetchMock = installFetch(async () => {
			return {
				ok: true,
				status: 200,
				json: async () => ({ data: { id: 'ctm_123', type: 'customers', attributes: {} } }),
			};
		});

		await provider.updateCustomer('ctm_123', { email: 'new@example.com', name: 'New Name' });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/customers/ctm_123');
		expect(init?.method).toBe('PATCH');
	});

	it('no-ops when no fields are provided', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);
		const fetchMock = installFetch(async () => {
			throw new Error('fetch should not be called');
		});

		await provider.updateCustomer('ctm_123', {});
		await provider.updateCustomer('ctm_123', { email: undefined, name: undefined });

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
