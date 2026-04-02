import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaystackPaymentProvider } from '../lib/payment/providers/paystack';

const TEST_SECRET_KEY = 'sk_test_paystack_product_update';

describe('Paystack product updates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves product codes to numeric ids before updating', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          message: 'ok',
          data: [
            {
              id: 42,
              product_code: 'PROD_test_product',
              name: 'Yearly Pro',
              description: 'Original',
              currency: 'NGN',
              price: 100,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          message: 'ok',
          data: {
            id: 42,
            product_code: 'PROD_test_product',
            name: 'Yearly Pro',
            description: 'Updated description',
            currency: 'NGN',
            price: 100,
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const provider = new PaystackPaymentProvider(TEST_SECRET_KEY);

    await provider.updateProduct('PROD_test_product', {
      description: 'Updated description',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.paystack.co/product',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_SECRET_KEY}`,
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.paystack.co/product/42',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: undefined,
          description: 'Updated description',
        }),
      })
    );
  });

  it('updates recurring Paystack plans directly by plan code', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: true,
        message: 'ok',
        data: {
          id: 12,
          plan_code: 'PLN_test_plan',
          name: 'Yearly Pro',
          description: 'Updated description',
          amount: 500000,
          interval: 'annually',
          currency: 'NGN',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const provider = new PaystackPaymentProvider(TEST_SECRET_KEY);

    await provider.updateProduct('PLN_test_plan', {
      description: 'Updated description',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/plan/PLN_test_plan',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: undefined,
          description: 'Updated description',
        }),
      })
    );
  });

  it('omits empty descriptions when creating Paystack plans', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: true,
        message: 'ok',
        data: {
          id: 12,
          plan_code: 'PLN_new_plan',
          name: 'Monthly Pro',
          description: null,
          amount: 500000,
          interval: 'monthly',
          currency: 'NGN',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const provider = new PaystackPaymentProvider(TEST_SECRET_KEY);

    await provider.createPrice({
      unitAmount: 500000,
      currency: 'NGN',
      productId: 'ignored-for-paystack',
      recurring: { interval: 'month', intervalCount: 1 },
      metadata: { name: 'Monthly Pro', description: '   ' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Monthly Pro',
          amount: 500000,
          interval: 'monthly',
          currency: 'NGN',
        }),
      })
    );
  });
});