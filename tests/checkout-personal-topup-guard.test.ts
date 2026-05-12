import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let providerName = 'stripe';
const createPaymentIntentMock = vi.hoisted(() => vi.fn());
const createSubscriptionIntentMock = vi.hoisted(() => vi.fn());
const createCustomerMock = vi.hoisted(() => vi.fn(async () => 'cus_embedded_1'));

const authMock = vi.hoisted(
  () => vi.fn(async (): Promise<{ userId: string; orgId: string | null }> => ({ userId: 'user_1', orgId: null }))
);

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

const getCurrentProviderKeyMock = vi.hoisted(() => vi.fn(() => 'stripe'));

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
    update: vi.fn(),
  },
  coupon: {
    findUnique: vi.fn(),
  },
  couponRedemption: {
    findUnique: vi.fn(),
  },
}));

const getOrganizationPlanContextMock = vi.hoisted(() => vi.fn(async (): Promise<unknown | null> => null));
const resolveCheckoutWorkspaceContextMock = vi.hoisted(() => vi.fn(async (): Promise<unknown | null> => null));

vi.mock('../lib/auth-provider', () => ({ authService: { getSession: authMock } }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/user-plan-context', () => ({ getOrganizationPlanContext: getOrganizationPlanContextMock }));
vi.mock('../lib/checkout-workspace-context', () => ({ resolveCheckoutWorkspaceContext: resolveCheckoutWorkspaceContextMock }));
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
  getCurrentProviderKey: getCurrentProviderKeyMock,
  getIdByProvider: vi.fn((_map: unknown, _provider: string, legacy?: string) => legacy ?? 'price_personal_ot'),
  setIdByProvider: vi.fn(() => ({})),
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
      createCustomer: createCustomerMock,
    },
    createPaymentIntent: createPaymentIntentMock,
    createSubscriptionIntent: createSubscriptionIntentMock,
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

import { POST as checkoutPost } from '../app/api/checkout/route';
import { GET as embeddedCheckoutGet } from '../app/api/checkout/embedded/route';

describe('checkout personal one-time guard', () => {
  const originalDemoReadOnlyMode = process.env.DEMO_READ_ONLY_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_READ_ONLY_MODE = 'false';
    providerName = 'stripe';
    authMock.mockResolvedValue({ userId: 'user_1', orgId: null });
    getOrganizationPlanContextMock.mockResolvedValue(null);
    resolveCheckoutWorkspaceContextMock.mockResolvedValue(null);
    createCustomerMock.mockResolvedValue('cus_embedded_1');
    createPaymentIntentMock.mockResolvedValue({ clientSecret: 'order_mock', paymentIntentId: 'order_mock' });
    createSubscriptionIntentMock.mockResolvedValue({ clientSecret: 'sub_mock', subscriptionId: 'sub_mock' });

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
      name: 'Test User',
      externalCustomerId: null,
      externalCustomerIds: null,
    });

    prismaMock.user.update.mockResolvedValue({ id: 'user_1' });
  });

  afterAll(() => {
    if (originalDemoReadOnlyMode == null) {
      delete process.env.DEMO_READ_ONLY_MODE;
    } else {
      process.env.DEMO_READ_ONLY_MODE = originalDemoReadOnlyMode;
    }
  });

  it('returns PERSONAL_PLAN_BLOCKED_IN_WORKSPACE from /api/checkout when an organization workspace is active', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_team_1' });
    resolveCheckoutWorkspaceContextMock.mockResolvedValue({
      role: 'OWNER',
      organizationId: 'org_team_1',
      providerOrganizationId: null,
    });

    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_personal_ot' }),
    });

    const res = await checkoutPost(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_PLAN_BLOCKED_IN_WORKSPACE');
    expect(body.redirectTo).toBe('/pricing');
    expect(body.error).toContain('Personal plans can only be purchased');
  });

  it('allows /api/checkout in the personal workspace even if a team subscription exists', async () => {
    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_personal_ot' }),
    });

    const res = await checkoutPost(req);
    const body = (await res.json()) as { code?: string; url?: string };

    expect(res.status).toBe(200);
    expect(body.code).toBeUndefined();
    expect(body.url).toBe('https://checkout.example.com/session_1');
  });

  it('blocks /api/checkout when demo read-only mode is enabled', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'true';

    const req = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'plan_personal_ot' }),
    });

    const res = await checkoutPost(req);
    const body = (await res.json()) as { code?: string; error?: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe('DEMO_READ_ONLY_CHECKOUT_DISABLED');
    expect(body.error).toContain('read-only');
  });

  it('returns PERSONAL_PLAN_BLOCKED_IN_WORKSPACE from /api/checkout/embedded when an organization workspace is active', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_team_1' });
    resolveCheckoutWorkspaceContextMock.mockResolvedValue({
      role: 'OWNER',
      organizationId: 'org_team_1',
      providerOrganizationId: null,
    });

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_PLAN_BLOCKED_IN_WORKSPACE');
    expect(body.redirectTo).toBe('/pricing');
    expect(body.error).toContain('Personal plans can only be purchased');
  });

  it('allows /api/checkout/embedded in the personal workspace even if a team subscription exists', async () => {
    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; clientSecret?: string };

    expect(res.status).toBe(200);
    expect(body.code).toBeUndefined();
    expect(body.clientSecret).toBe('order_mock');
    expect(createPaymentIntentMock).toHaveBeenCalledTimes(1);
  });

  it('blocks /api/checkout/embedded when demo read-only mode is enabled', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'true';

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; error?: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe('DEMO_READ_ONLY_CHECKOUT_DISABLED');
    expect(body.error).toContain('read-only');
  });

  it('uses dashboard cancel redirect for Razorpay embedded checkout', async () => {
    providerName = 'razorpay';
    prismaMock.subscription.findFirst.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_ot', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { clientSecret?: string; provider?: string };

    expect(res.status).toBe(200);
    expect(body.clientSecret).toBe('order_mock');
    expect(body.provider).toBe('razorpay');
    expect(createPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(createPaymentIntentMock).toHaveBeenCalledWith(expect.objectContaining({
      successUrl: '/checkout/razorpay/callback?provider=razorpay',
      cancelUrl: '/dashboard?purchase=cancelled&provider=razorpay&status=cancelled',
      mode: 'payment',
    }));
  });

  it('rejects /api/checkout/embedded for team plans when the active workspace user is only a member', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_team_1' });
    prismaMock.plan.findUnique.mockResolvedValueOnce({
      id: 'plan_team_sub',
      name: 'Team Subscription',
      autoRenew: true,
      supportsOrganizations: true,
      externalPriceId: 'price_team_sub',
      priceCents: 5000,
      durationHours: 720,
      sortOrder: 1,
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    resolveCheckoutWorkspaceContextMock.mockResolvedValueOnce({
      role: 'MEMBER',
      organizationId: 'org_team_1',
      providerOrganizationId: null,
    });

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_team_sub', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe('WORKSPACE_BILLING_OWNER_REQUIRED');
    expect(body.redirectTo).toBe('/dashboard/plan');
    expect(body.error).toContain('Only the workspace owner');
  });

  it('rejects recurring personal checkout in an organization workspace', async () => {
    authMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_team_1' });
    resolveCheckoutWorkspaceContextMock.mockResolvedValue({
      role: 'OWNER',
      organizationId: 'org_team_1',
      providerOrganizationId: null,
    });
    prismaMock.plan.findUnique.mockResolvedValueOnce({
      id: 'plan_personal_sub',
      name: 'Personal Subscription',
      autoRenew: true,
      supportsOrganizations: false,
      externalPriceId: 'price_personal_sub',
      priceCents: 2500,
      durationHours: 720,
      sortOrder: 1,
    });

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_personal_sub', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { code?: string; redirectTo?: string; error?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('PERSONAL_PLAN_BLOCKED_IN_WORKSPACE');
    expect(body.redirectTo).toBe('/pricing');
    expect(body.error).toContain('Personal plans can only be purchased');
  });

  it('uses an explicit local organization id when auth orgId is absent for embedded team checkout', async () => {
    prismaMock.plan.findUnique.mockResolvedValueOnce({
      id: 'plan_team_sub',
      name: 'Team Subscription',
      autoRenew: true,
      supportsOrganizations: true,
      externalPriceId: 'price_team_sub',
      priceCents: 5000,
      durationHours: 720,
      sortOrder: 1,
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    resolveCheckoutWorkspaceContextMock.mockResolvedValue({
      role: 'OWNER',
      organizationId: 'org_team_1',
      providerOrganizationId: null,
    });

    const req = new NextRequest('http://localhost/api/checkout/embedded?planId=plan_team_sub&activeOrganizationId=org_team_1', {
      method: 'GET',
    });

    const res = await embeddedCheckoutGet(req);
    const body = (await res.json()) as { clientSecret?: string };

    expect(res.status).toBe(200);
    expect(body.clientSecret).toBe('sub_mock');
    expect(createSubscriptionIntentMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        activeOrganizationId: 'org_team_1',
        organizationId: 'org_team_1',
      }),
    }));
  });
});
