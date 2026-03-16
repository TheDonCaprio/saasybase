import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  plan: {
    findMany: vi.fn(),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  },
}));

const providerFactoryMock = vi.hoisted(() => ({
  getAllConfiguredProviders: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const paddleProviderMock = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createPrice: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/payment/factory', () => ({ PaymentProviderFactory: providerFactoryMock }));
vi.mock('../lib/logger', () => ({ Logger: loggerMock }));
vi.mock('../lib/runtime-guards', () => ({
  toError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
}));
vi.mock('../lib/payment/registry', () => ({
  getProviderCurrency: vi.fn(() => 'USD'),
}));

import { syncPlansToProviders } from '../lib/payment/catalog-sync-service';

describe('catalog sync provider healing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      PAYMENT_AUTO_CREATE: 'true',
      PAYMENT_PROVIDER: 'paddle',
    };

    providerFactoryMock.getAllConfiguredProviders.mockReturnValue([
      { name: 'paddle', provider: paddleProviderMock },
    ]);

    paddleProviderMock.createProduct.mockResolvedValue('pro_real_paddle');
    paddleProviderMock.createPrice.mockResolvedValue({
      id: 'pri_real_paddle',
      productId: 'pro_real_paddle',
    });

    prismaMock.plan.findMany.mockResolvedValue([
      {
        id: 'plan_monthly',
        name: 'Monthly Pro',
        shortDescription: 'Monthly plan',
        priceCents: 20000,
        autoRenew: true,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        active: true,
        externalPriceIds: JSON.stringify({ paddle: 'price_wrong_shape' }),
        externalProductIds: JSON.stringify({ paddle: 'prod_wrong_shape' }),
      },
    ]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('recreates stale paddle mappings instead of skipping them', async () => {
    await syncPlansToProviders();

    expect(paddleProviderMock.createProduct).toHaveBeenCalledWith({
      name: 'Monthly Pro',
      description: 'Monthly plan',
    });
    expect(paddleProviderMock.createPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        unitAmount: 20000,
        currency: 'USD',
        productId: 'pro_real_paddle',
      })
    );

    expect(prismaMock.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan_monthly' },
        data: expect.objectContaining({
          externalPriceId: 'pri_real_paddle',
          externalPriceIds: expect.stringContaining('pri_real_paddle'),
          externalProductIds: expect.stringContaining('pro_real_paddle'),
        }),
      })
    );

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Removing stale provider catalog mapping before re-sync',
      expect.objectContaining({
        planName: 'Monthly Pro',
        provider: 'paddle',
        existingPriceId: 'price_wrong_shape',
      })
    );
  });
});
