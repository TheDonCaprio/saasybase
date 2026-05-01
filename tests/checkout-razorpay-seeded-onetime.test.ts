import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let providerName = 'razorpay';

const authMock = vi.hoisted(() => vi.fn(async (): Promise<{ userId: string; orgId: string | null }> => ({ userId: 'user_1', orgId: null })));
const createPaymentIntentMock = vi.hoisted(() => vi.fn(async () => ({ clientSecret: 'order_mock', paymentIntentId: 'order_mock' })));
const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 })));
const getCurrentProviderKeyMock = vi.hoisted(() => vi.fn(() => 'razorpay'));
const resolveSeededPlanPriceForProviderMock = vi.hoisted(() => vi.fn(() => ({ priceId: undefined, envKey: undefined, isLegacy: false, source: 'missing' as const })));
const prismaMock = vi.hoisted(() => ({
  plan: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  coupon: {
    findUnique: vi.fn(),
  },
  couponRedemption: {
    findUnique: vi.fn(),
  },
}));

const resolveCheckoutWorkspaceContextMock = vi.hoisted(() => vi.fn(async () => null));
const getOrganizationPlanContextMock = vi.hoisted(() => vi.fn(async () => null));

vi.mock('../lib/auth-provider', () => ({ authService: { getSession: authMock } }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/checkout-workspace-context', () => ({ resolveCheckoutWorkspaceContext: resolveCheckoutWorkspaceContextMock }));
vi.mock('../lib/user-plan-context', () => ({ getOrganizationPlanContext: getOrganizationPlanContextMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  createRateLimitKey: vi.fn(() => 'checkout:rate-limit-key'),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('../lib/validation', () => ({ validateInput: vi.fn((_schema: unknown, body: unknown) => ({ success: true, data: body })), apiSchemas: { checkout: {} } }));
vi.mock('../lib/plans', () => ({
  PLAN_DEFINITIONS: [
    {
      id: 'plan_seeded_razorpay_ot',
      name: 'Seeded Razorpay One-time',
      durationHours: 24,
      priceCents: 1000,
      externalPriceEnv: 'PAYMENT_PRICE_SEEDED_RAZORPAY_OT',
      priceMode: 'payment',
      sortOrder: 99,
      autoRenew: false,
    },
  ],
  resolveSeededPlanPriceForProvider: resolveSeededPlanPriceForProviderMock,
  syncPlanExternalPriceIds: vi.fn(async () => undefined),
}));
vi.mock('../lib/settings', () => ({
  isRecurringProrationEnabled: vi.fn(async () => false),
  getDefaultTokenLabel: vi.fn(async () => 'tokens'),
}));
vi.mock('../lib/utils/provider-ids', () => ({
  getCurrentProviderKey: getCurrentProviderKeyMock,
  getIdByProvider: vi.fn(() => undefined),
  setIdByProvider: vi.fn(() => null),
}));
vi.mock('../lib/payment/registry', () => ({
  getProviderCurrency: vi.fn(() => 'USD'),
  getProviderDefaultCurrency: vi.fn(() => 'USD'),
}));
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    provider: {
      get name() {
        return providerName;
      },
      createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.example.com/session_1' })),
      createCustomer: vi.fn(async () => 'cus_1'),
    },
    createPaymentIntent: createPaymentIntentMock,
    createSubscriptionIntent: vi.fn(),
  },
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/env', () => ({ getEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: '' })) }));
vi.mock('../lib/coupons', () => ({
  ensureProviderCoupon: vi.fn(),
  isCouponCurrentlyActive: vi.fn(() => true),
  normalizeCouponCode: vi.fn((code: string) => code),
  calculateCouponDiscountCents: vi.fn(() => 0),
  isCouponValidForCurrency: vi.fn(() => true),
  extractRazorpayOfferId: vi.fn(() => null),
}));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: vi.fn(() => '$0.00') }));
vi.mock('@/lib/payment/discountedSubscriptionPriceCache', () => ({
  buildDiscountedSubscriptionPriceCacheKey: vi.fn(() => 'discount-cache-key'),
  clearDiscountedSubscriptionPriceKey: vi.fn(async () => undefined),
  getCachedDiscountedSubscriptionPriceId: vi.fn(async () => null),
  setCachedDiscountedSubscriptionPriceId: vi.fn(async () => undefined),
  tryAcquireDiscountedSubscriptionPriceKey: vi.fn(async () => ({ acquired: true, release: async () => undefined })),
}));

import { GET as embeddedCheckoutGet } from '../app/api/checkout/embedded/route';

describe('razorpay seeded one-time checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerName = 'razorpay';
    getCurrentProviderKeyMock.mockReturnValue('razorpay');
    authMock.mockResolvedValue({ userId: 'user_1', orgId: null });
    resolveCheckoutWorkspaceContextMock.mockResolvedValue(null);
    getOrganizationPlanContextMock.mockResolvedValue(null);
    prismaMock.plan.findFirst.mockResolvedValue({
      id: 'plan_seeded_razorpay_ot_db',
      name: 'Seeded Razorpay One-time',
      autoRenew: false,
      supportsOrganizations: false,
      externalPriceId: null,
      externalPriceIds: null,
      priceCents: 1000,
      durationHours: 24,
      sortOrder: 99,
    });
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
      externalCustomerId: null,
      externalCustomerIds: null,
    });
  });

  it('falls back to amount-based checkout instead of requiring a Razorpay priceId', async () => {
    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_seeded_razorpay_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; clientSecret?: string; provider?: string };

    expect(res.status).toBe(200);
    expect(body.code).toBeUndefined();
    expect(body.provider).toBe('razorpay');
    expect(body.clientSecret).toBe('order_mock');
    expect(createPaymentIntentMock).toHaveBeenCalled();
    expect(resolveSeededPlanPriceForProviderMock).toHaveBeenCalled();
  });
});
