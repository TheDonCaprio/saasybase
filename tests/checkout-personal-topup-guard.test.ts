import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_1', orgId: null })));

const rateLimitMock = vi.hoisted(() =>
  vi.fn(async () => ({
    success: true,
    allowed: true,
    remaining: 9,
    reset: Date.now() + 60_000,
  }))
);

const validateInputMock = vi.hoisted(() =>
  vi.fn((_schema: unknown, body: unknown) => ({ success: true, data: body }))
);

const prismaMock = vi.hoisted(() => ({
  plan: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  coupon: {
    findUnique: vi.fn(),
  },
  couponRedemption: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  createRateLimitKey: vi.fn(() => 'checkout:rate-limit-key'),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('../lib/validation', () => ({
  validateInput: validateInputMock,
  apiSchemas: { checkout: {} },
}));
vi.mock('../lib/plans', () => ({
  PLAN_DEFINITIONS: [],
  resolvePlanPriceEnv: vi.fn(() => ({ priceId: 'price_seed' })),
  syncPlanExternalPriceIds: vi.fn(async () => undefined),
}));
vi.mock('../lib/settings', () => ({
  isRecurringProrationEnabled: vi.fn(async () => false),
  getDefaultTokenLabel: vi.fn(async () => 'tokens'),
}));
vi.mock('../lib/utils/provider-ids', () => ({
  getCurrentProviderKey: vi.fn(() => 'stripe'),
  getIdByProvider: vi.fn((_map: unknown, _provider: string, legacy?: string) => legacy ?? 'price_personal_ot'),
  setIdByProvider: vi.fn(() => ({})),
}));
vi.mock('../lib/payment/registry', () => ({
  getProviderCurrency: vi.fn(() => 'USD'),
  getProviderDefaultCurrency: vi.fn(() => 'USD'),
}));
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    provider: { name: 'stripe' },
    createCheckoutSession: vi.fn(),
  },
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/env', () => ({ getEnv: vi.fn(() => '') }));
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

import { POST as checkoutPost } from '../app/api/checkout/route';
import { GET as embeddedCheckoutGet } from '../app/api/checkout/embedded/route';

describe('checkout personal one-time guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.plan.findUnique.mockResolvedValue({
      id: 'plan_personal_ot',
      name: 'Personal One-time',
      autoRenew: false,
      supportsOrganizations: false,
      externalPriceId: 'price_personal_ot',
      priceCents: 500,
      durationHours: 24,
      sortOrder: 1,
    });

    prismaMock.subscription.findFirst.mockResolvedValue({ id: 'sub_team_active' });

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
    });
  });

  it('returns PERSONAL_TOPUP_BLOCKED_FOR_TEAM_SUBSCRIPTION from /api/checkout', async () => {
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_personal_ot' }),
    });

    const res = await checkoutPost(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_TOPUP_BLOCKED_FOR_TEAM_SUBSCRIPTION');
    expect(body.redirectTo).toBe('/dashboard/team');
    expect(body.error).toContain('Personal one-time top-ups are unavailable');
  });

  it('returns PERSONAL_TOPUP_BLOCKED_FOR_TEAM_SUBSCRIPTION from /api/checkout/embedded', async () => {
    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_TOPUP_BLOCKED_FOR_TEAM_SUBSCRIPTION');
    expect(body.redirectTo).toBe('/dashboard/team');
    expect(body.error).toContain('Personal one-time top-ups are unavailable');
  });
});
