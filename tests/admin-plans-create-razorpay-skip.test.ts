import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  plan: {
    create: vi.fn(),
  },
}));

const providerFactoryMock = vi.hoisted(() => ({
  getAllConfiguredProviders: vi.fn(),
}));

const stripeProviderMock = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createPrice: vi.fn(),
}));

const paystackProviderMock = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createPrice: vi.fn(),
}));

const razorpayProviderMock = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createPrice: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(async () => 'admin_1'),
  toAuthGuardErrorResponse: vi.fn(() => null),
}));

vi.mock('@/lib/admin-actions', () => ({
  recordAdminAction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/runtime-guards', () => ({
  toError: vi.fn((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
}));

vi.mock('@/lib/plans', () => ({
  findPlanSeedByName: vi.fn(() => null),
}));

vi.mock('@/lib/env-files', () => ({
  persistEnvValue: vi.fn(async () => undefined),
}));

vi.mock('@/lib/validation', () => ({
  apiSchemas: { adminPlanCreate: {} },
  withValidation: (_schema: unknown, handler: (request: Request, payload: any) => Promise<Response>) => {
    return async (request: Request) => {
      const payload = await request.json();
      return handler(request, payload);
    };
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  adminRateLimit: vi.fn(async () => ({
    success: true,
    allowed: true,
    remaining: 999,
    reset: Date.now() + 60_000,
    error: null,
  })),
}));

vi.mock('@/lib/utils/provider-ids', () => ({
  providerSupportsOneTimePrices: vi.fn(() => true),
  setIdByProvider: vi.fn((json: string | null, provider: string, value: string) => {
    const map = json ? JSON.parse(json) : {};
    map[provider] = value;
    return JSON.stringify(map);
  }),
}));

vi.mock('@/lib/payment/factory', () => ({
  PaymentProviderFactory: providerFactoryMock,
}));

vi.mock('@/lib/payment/registry', () => ({
  getProviderCurrency: vi.fn((providerName: string) => {
    if (providerName === 'razorpay') return 'INR';
    if (providerName === 'paystack') return 'USD';
    return 'USD';
  }),
}));

vi.mock('@/lib/payment/provider-config', () => ({
  PAYMENT_PROVIDERS: {
    stripe: { supportedCurrencies: ['USD'] },
    razorpay: { supportedCurrencies: ['INR'] },
    paystack: { supportedCurrencies: ['NGN', 'GHS', 'ZAR', 'KES'] },
  },
}));

vi.mock('@/lib/htmlSanitizer', () => ({
  sanitizeRichText: vi.fn(async (html: string) => html),
}));

vi.mock('@/lib/payment/errors', () => ({
  PaymentError: class PaymentError extends Error {
    originalError?: unknown;
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.originalError = originalError;
    }
  },
}));

import { POST } from '../app/api/admin/plans/route';

describe('POST /api/admin/plans - Razorpay daily skip policy', () => {
  const originalAutoCreate = process.env.STRIPE_AUTO_CREATE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_AUTO_CREATE = '1';

    providerFactoryMock.getAllConfiguredProviders.mockReturnValue([
      { name: 'stripe', provider: stripeProviderMock },
      { name: 'razorpay', provider: razorpayProviderMock },
    ]);

    stripeProviderMock.createProduct.mockResolvedValue('prod_stripe_1');
    stripeProviderMock.createPrice.mockResolvedValue({
      id: 'price_stripe_1',
      unitAmount: 1200,
      currency: 'USD',
      recurring: { interval: 'day', intervalCount: 1 },
      productId: 'prod_stripe_1',
      type: 'recurring',
    });

    razorpayProviderMock.createProduct.mockResolvedValue('prod_rzp_1');
    razorpayProviderMock.createPrice.mockResolvedValue({
      id: 'plan_rzp_1',
      unitAmount: 1200,
      currency: 'INR',
      recurring: { interval: 'day', intervalCount: 1 },
      productId: 'item_rzp_1',
      type: 'recurring',
    });

    paystackProviderMock.createProduct.mockResolvedValue('prod_paystack_1');
    paystackProviderMock.createPrice.mockResolvedValue({
      id: 'plan_paystack_1',
      unitAmount: 1200,
      currency: 'NGN',
      recurring: { interval: 'day', intervalCount: 1 },
      productId: 'prod_paystack_1',
      type: 'recurring',
    });

    prismaMock.plan.create.mockResolvedValue({
      id: 'plan_db_1',
      name: 'Daily Starter',
      shortDescription: null,
      description: null,
      durationHours: 24,
      priceCents: 1200,
      active: true,
      sortOrder: 1,
      externalPriceId: 'price_stripe_1',
      externalPriceIds: JSON.stringify({ stripe: 'price_stripe_1' }),
      externalProductIds: JSON.stringify({ stripe: 'prod_stripe_1' }),
      autoRenew: true,
      recurringInterval: 'day',
      recurringIntervalCount: 1,
      tokenLimit: null,
      tokenName: null,
      supportsOrganizations: false,
      organizationSeatLimit: null,
      organizationTokenPoolStrategy: null,
      scope: 'INDIVIDUAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(() => {
    process.env.STRIPE_AUTO_CREATE = originalAutoCreate;
  });

  it('skips Razorpay price creation and returns warnings[] when daily recurring intervalCount is below 7', async () => {
    const req = new Request('http://localhost/api/admin/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Daily Starter',
        shortDescription: null,
        description: null,
        durationHours: 24,
        priceCents: 1200,
        active: true,
        sortOrder: 1,
        stripePriceId: '',
        autoRenew: true,
        recurringInterval: 'day',
        recurringIntervalCount: 1,
        tokenLimit: null,
        tokenName: null,
        supportsOrganizations: false,
        organizationSeatLimit: null,
        organizationTokenPoolStrategy: null,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.some((w: string) => w.includes('Skipped Razorpay price creation'))).toBe(true);

    expect(stripeProviderMock.createPrice).toHaveBeenCalledTimes(1);
    expect(razorpayProviderMock.createPrice).not.toHaveBeenCalled();

    expect(prismaMock.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurringInterval: 'day',
          recurringIntervalCount: 1,
        }),
      }),
    );
  });

  it('retries with provider fallback currency when preferred currency is unsupported', async () => {
    providerFactoryMock.getAllConfiguredProviders.mockReturnValue([
      { name: 'paystack', provider: paystackProviderMock },
    ]);

    paystackProviderMock.createPrice
      .mockRejectedValueOnce(new Error('USD not a supported currency'))
      .mockResolvedValueOnce({
        id: 'plan_paystack_1',
        unitAmount: 1200,
        currency: 'NGN',
        recurring: { interval: 'day', intervalCount: 1 },
        productId: 'prod_paystack_1',
        type: 'recurring',
      });

    const req = new Request('http://localhost/api/admin/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'One Day Team',
        shortDescription: null,
        description: null,
        durationHours: 24,
        priceCents: 1200,
        active: true,
        sortOrder: 1,
        stripePriceId: '',
        autoRenew: true,
        recurringInterval: 'day',
        recurringIntervalCount: 1,
        tokenLimit: null,
        tokenName: null,
        supportsOrganizations: false,
        organizationSeatLimit: null,
        organizationTokenPoolStrategy: null,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(paystackProviderMock.createPrice).toHaveBeenCalledTimes(2);
    expect(paystackProviderMock.createPrice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ currency: 'USD' }),
    );
    expect(paystackProviderMock.createPrice.mock.calls[1][0]).toEqual(
      expect.objectContaining({ currency: 'NGN' }),
    );
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.some((w: string) => w.includes('fallback currency'))).toBe(true);
  });
});
