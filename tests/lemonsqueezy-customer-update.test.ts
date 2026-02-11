import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LemonSqueezyPaymentProvider } from '../lib/payment/providers/lemonsqueezy';

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

		const fetchMock = vi.fn(async (..._args: any[]) => {
			return {
				ok: true,
				status: 200,
				json: async () => ({ data: { id: 'ctm_123', type: 'customers', attributes: {} } }),
			} as any;
		});

		vi.stubGlobal('fetch', fetchMock as any);

		await provider.updateCustomer('ctm_123', { email: 'new@example.com', name: 'New Name' });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('/customers/ctm_123');
		expect(init?.method).toBe('PATCH');
	});

	it('no-ops when no fields are provided', async () => {
		const provider = new LemonSqueezyPaymentProvider(apiKey);
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock as any);

		await provider.updateCustomer('ctm_123', {});
		await provider.updateCustomer('ctm_123', { email: undefined, name: undefined });

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
