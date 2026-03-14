import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PaddlePaymentProvider } from '../lib/payment/providers/paddle';

type FetchUrl = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type MockJsonResponse = {
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
};

function installFetch(handler: (url: FetchUrl, init?: FetchInit) => Promise<MockJsonResponse>) {
	global.fetch = vi.fn((url: FetchUrl, init?: FetchInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('Paddle customer dedupe', () => {
	const apiKey = 'pdl_test_dummy';

	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('returns existing customer id when Paddle reports customer_already_exists', async () => {
		installFetch(async (url, init) => {
			if (String(url).includes('/customers') && init?.method === 'POST') {
				return {
					ok: false,
					status: 400,
					json: async () => ({
						error: {
							type: 'request_error',
							code: 'customer_already_exists',
							detail: 'customer email conflicts with customer of id ctm_01kdks69gav2cbxvgebhg2wz96',
						},
					}),
				};
			}
			throw new Error(`Unexpected fetch call: ${String(url)}`);
		});

		const provider = new PaddlePaymentProvider(apiKey);
		const id = await provider.createCustomer('user_1', 'test@example.com');
		expect(id).toBe('ctm_01kdks69gav2cbxvgebhg2wz96');
	});

	it('still throws when customer_already_exists error lacks a customer id', async () => {
		installFetch(async (url, init) => {
			if (String(url).includes('/customers') && init?.method === 'POST') {
				return {
					ok: false,
					status: 400,
					json: async () => ({
						error: {
							type: 'request_error',
							code: 'customer_already_exists',
							detail: 'customer already exists',
						},
					}),
				};
			}
			throw new Error(`Unexpected fetch call: ${String(url)}`);
		});

		const provider = new PaddlePaymentProvider(apiKey);
		await expect(provider.createCustomer('user_1', 'test@example.com')).rejects.toThrow(
			/Failed to create Paddle customer/i,
		);
	});
});
