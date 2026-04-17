import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ userId: 'user_1', orgId: 'org_local_1' })),
  providerName: 'nextauth',
}));

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

const createCheckoutSessionMock = vi.hoisted(() =>
  vi.fn(async () => ({ url: 'https://checkout.example.com/session_1' }))
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

const getOrganizationPlanContextMock = vi.hoisted(() =>
  vi.fn(async () => ({
    role: 'OWNER',
    organization: { id: 'org_local_1' },
  }))
);

vi.mock('../lib/auth-provider', () => ({ authService: authMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/user-plan-context', () => ({ getOrganizationPlanContext: getOrganizationPlanContextMock }));
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
}));
vi.mock('../lib/utils/provider-ids', () => ({
  getCurrentProviderKey: vi.fn(() => 'stripe'),
  getIdByProvider: vi.fn((_map: unknown, _provider: string, legacy?: string) => legacy ?? 'price_team_sub'),
}));
vi.mock('../lib/payment/registry', () => ({
  getProviderCurrency: vi.fn(() => 'USD'),
  getProviderDefaultCurrency: vi.fn(() => 'USD'),
}));
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    provider: {
      name: 'stripe',
      createCheckoutSession: createCheckoutSessionMock,
    },
  },
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/env', () => ({ getEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })) }));
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

describe('checkout metadata for NextAuth team purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.plan.findUnique.mockResolvedValue({
      id: 'plan_team_sub',
      name: 'Team Subscription',
      autoRenew: true,
      supportsOrganizations: true,
      externalPriceId: 'price_team_sub',
      priceCents: 5000,
      durationHours: 720,
      sortOrder: 1,
      externalPriceIds: null,
    });

    prismaMock.subscription.findFirst.mockResolvedValue(null);

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
    });
  });

  it('sends local organization metadata and omits Clerk-only metadata', async () => {
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_team_sub' }),
    });

    const res = await checkoutPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe('https://checkout.example.com/session_1');
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);

    const firstCall = createCheckoutSessionMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();

    const call = firstCall?.at(0) as unknown as {
      metadata: Record<string, string | undefined>;
      subscriptionMetadata?: Record<string, string | undefined>;
    };
    expect(call.metadata).toMatchObject({
      planId: 'plan_team_sub',
      activeOrganizationId: 'org_local_1',
      organizationId: 'org_local_1',
    });
    expect(call.metadata.activeClerkOrgId).toBeUndefined();
    expect(call.metadata.activeProviderOrganizationId).toBeUndefined();
    expect(call.subscriptionMetadata).toMatchObject({
      planId: 'plan_team_sub',
      activeOrganizationId: 'org_local_1',
      organizationId: 'org_local_1',
    });

    expect(getOrganizationPlanContextMock).toHaveBeenCalledWith('user_1', 'org_local_1');
  });

  it('rejects team checkout when the active workspace user is only a member', async () => {
    getOrganizationPlanContextMock.mockResolvedValueOnce({
      role: 'MEMBER',
      organization: { id: 'org_local_1' },
    });

    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_team_sub' }),
    });

    const res = await checkoutPost(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('WORKSPACE_BILLING_OWNER_REQUIRED');
    expect(body.redirectTo).toBe('/dashboard/plan');
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('rejects personal checkout when an organization workspace is active', async () => {
    prismaMock.plan.findUnique.mockResolvedValueOnce({
      id: 'plan_personal_sub',
      name: 'Personal Subscription',
      autoRenew: true,
      supportsOrganizations: false,
      externalPriceId: 'price_personal_sub',
      priceCents: 1500,
      durationHours: 720,
      sortOrder: 1,
      externalPriceIds: null,
    });

    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_personal_sub' }),
    });

    const res = await checkoutPost(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_PLAN_BLOCKED_IN_WORKSPACE');
    expect(body.redirectTo).toBe('/pricing');
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
