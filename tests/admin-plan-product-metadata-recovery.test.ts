import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  plan: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    count: vi.fn(),
  },
}));

const providerFactoryMock = vi.hoisted(() => ({
  getAllConfiguredProviders: vi.fn(),
}));

const razorpayProviderMock = vi.hoisted(() => ({
  updateProduct: vi.fn(),
  verifyPrice: vi.fn(),
  findProduct: vi.fn(),
}));

const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const persistEnvValueMock = vi.hoisted(() => vi.fn(async () => undefined));
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(async () => 'admin_1'),
  toAuthGuardErrorResponse: vi.fn(() => null),
}));

vi.mock('@/lib/admin-actions', () => ({
  recordAdminAction: recordAdminActionMock,
}));

vi.mock('@/lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}));

vi.mock('@/lib/runtime-guards', () => ({
  toError: vi.fn((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
}));

vi.mock('@/lib/validation', () => ({
  apiSchemas: { adminPlanUpdate: {} },
  withValidation: (_schema: unknown, handler: (request: NextRequest, payload: unknown, context: unknown) => Promise<Response>) => {
    return async (request: NextRequest, context: unknown) => {
      const payload = await request.json();
      return handler(request, payload, context);
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

vi.mock('@/lib/plans', () => ({
  findPlanSeedByName: vi.fn(() => null),
}));

vi.mock('@/lib/env-files', () => ({
  persistEnvValue: persistEnvValueMock,
}));

vi.mock('@/lib/payment/factory', () => ({
  PaymentProviderFactory: providerFactoryMock,
}));

vi.mock('@/lib/payment/auto-create', () => ({
  isPaymentCatalogAutoCreateEnabled: vi.fn(() => false),
}));

vi.mock('@/lib/payment/registry', () => ({
  getProviderCurrency: vi.fn(() => 'INR'),
}));

vi.mock('@/lib/payment/provider-config', () => ({
  PAYMENT_PROVIDERS: {
    razorpay: { supportedCurrencies: ['INR'] },
  },
}));

vi.mock('@/lib/payment/errors', () => ({
  PaymentError: class PaymentError extends Error {
    originalError?: unknown;
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.originalError = originalError;
    }
  },
  PaymentProviderError: class PaymentProviderError extends Error {
    originalError?: unknown;
    constructor(message: string, originalError?: unknown) {
      super(message);
      this.originalError = originalError;
    }
  },
}));

vi.mock('@/lib/htmlSanitizer', () => ({
  sanitizeRichText: vi.fn(async (html: string) => html),
}));

import { PUT } from '../app/api/admin/plans/[planId]/route';

describe('PUT /api/admin/plans/[planId] product metadata sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    providerFactoryMock.getAllConfiguredProviders.mockReturnValue([
      { name: 'razorpay', provider: razorpayProviderMock },
    ]);

    prismaMock.subscription.count.mockResolvedValue(0);
    prismaMock.plan.findUnique.mockResolvedValue({
      id: 'plan_1',
      name: 'Yearly Pro',
      shortDescription: 'Original summary',
      description: null,
      durationHours: 24,
      priceCents: 1200,
      active: true,
      sortOrder: 1,
      externalPriceId: 'plan_rzp_current',
      externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_current' }),
      externalProductIds: JSON.stringify({ razorpay: 'item_rzp_stale' }),
      autoRenew: true,
      recurringInterval: 'year',
      recurringIntervalCount: 1,
      tokenLimit: null,
      tokenName: null,
      supportsOrganizations: false,
      organizationSeatLimit: null,
      organizationTokenPoolStrategy: null,
      scope: 'INDIVIDUAL',
    });

    prismaMock.plan.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'plan_1',
      name: 'Yearly Pro',
      ...data,
    }));

    razorpayProviderMock.updateProduct.mockRejectedValue(
      new Error('Razorpay API request failed (400): BAD_REQUEST_ERROR: The id provided does not exist')
    );
    razorpayProviderMock.verifyPrice.mockResolvedValue({
      id: 'plan_rzp_current',
      unitAmount: 1200,
      currency: 'INR',
      recurring: { interval: 'year', intervalCount: 1 },
      productId: 'item_rzp_live',
      type: 'recurring',
    });
    razorpayProviderMock.findProduct.mockResolvedValue(null);
  });

  it('skips Razorpay product metadata sync when no stable item id is stored', async () => {
    prismaMock.plan.findUnique.mockResolvedValueOnce({
      id: 'plan_1',
      name: 'Yearly Pro',
      shortDescription: 'Original summary',
      description: null,
      durationHours: 24,
      priceCents: 1200,
      active: true,
      sortOrder: 1,
      externalPriceId: 'plan_rzp_current',
      externalPriceIds: JSON.stringify({ razorpay: 'plan_rzp_current' }),
      externalProductIds: null,
      autoRenew: true,
      recurringInterval: 'year',
      recurringIntervalCount: 1,
      tokenLimit: null,
      tokenName: null,
      supportsOrganizations: false,
      organizationSeatLimit: null,
      organizationTokenPoolStrategy: null,
      scope: 'INDIVIDUAL',
    });

    const req = new NextRequest('http://localhost/api/admin/plans/plan_1', {
      method: 'PUT',
      body: JSON.stringify({ shortDescription: 'Updated summary' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT(req, { params: Promise.resolve({ planId: 'plan_1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(razorpayProviderMock.verifyPrice).not.toHaveBeenCalled();
    expect(razorpayProviderMock.updateProduct).not.toHaveBeenCalled();
    expect(prismaMock.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan_1' },
        data: expect.objectContaining({
          shortDescription: 'Updated summary',
        }),
      })
    );
    expect(recordAdminActionMock).toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalledWith(
      'Failed to update provider product metadata',
      expect.anything()
    );
  });

  it('skips Razorpay product metadata sync when the stored item id does not exist', async () => {
    const req = new NextRequest('http://localhost/api/admin/plans/plan_1', {
      method: 'PUT',
      body: JSON.stringify({ shortDescription: 'Updated summary' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT(req, { params: Promise.resolve({ planId: 'plan_1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(razorpayProviderMock.updateProduct).toHaveBeenCalledWith('item_rzp_stale', {
      name: undefined,
      description: 'Updated summary',
    });
    expect(prismaMock.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan_1' },
        data: expect.not.objectContaining({
          externalProductIds: expect.anything(),
        }),
      })
    );
    expect(loggerErrorMock).not.toHaveBeenCalledWith(
      'Failed to update provider product metadata',
      expect.anything()
    );
  });
});