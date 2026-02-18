import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/notifications', () => ({
  createBillingNotification: vi.fn(),
  sendBillingNotification: vi.fn(),
  notifyExpiredSubscriptions: vi.fn(),
  sendAdminNotificationEmail: vi.fn(),
}));

vi.mock('../lib/email', () => ({
  sendEmail: vi.fn(),
  shouldEmailUser: vi.fn(async () => false),
  getSiteName: vi.fn(async () => 'Test'),
}));

vi.mock('../lib/settings', () => ({
  getDefaultTokenLabel: vi.fn(async () => 'tokens'),
}));

vi.mock('../lib/paidTokens', () => ({
  shouldClearPaidTokensOnExpiry: vi.fn(async () => false),
  shouldClearPaidTokensOnRenewal: vi.fn(async () => true),
}));

vi.mock('../lib/organization-access', () => ({
  syncOrganizationEligibilityForUser: vi.fn(async () => undefined),
}));

vi.mock('../lib/user-plan-context', () => ({
  getOrganizationPlanContext: vi.fn(async () => null),
}));

vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: vi.fn(async () => undefined),
  resetOrganizationSharedTokens: vi.fn(async () => undefined),
}));

vi.mock('../lib/payments', () => ({
  updateSubscriptionLastPaymentAmount: vi.fn(async () => undefined),
}));

vi.mock('../lib/couponRedemptions', () => ({
  markRedemptionConsumed: vi.fn(async () => undefined),
}));

// Prisma is mocked per-test via the shared object below.
const prismaMock = {
  $transaction: vi.fn(),
  subscription: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  payment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    findFirst: vi.fn(),
  },
  plan: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  couponRedemption: {
    findUnique: vi.fn(),
  },
} as const;

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

function makeProvider(overrides: Partial<any> = {}) {
  return {
    name: 'stripe',
    getSubscription: vi.fn(),
    ...overrides,
  };
}

describe('PaymentService subscription resurrection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resurrects locally EXPIRED subscription on subscription.updated(active)', async () => {
    const now = Date.now();
    const futureEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 'db_sub_1',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'EXPIRED',
      startedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      canceledAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_1',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    prismaMock.subscription.update.mockResolvedValueOnce({
      id: 'db_sub_1',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'ACTIVE',
      startedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      expiresAt: futureEnd,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_1',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    const { PaymentService } = await import('../lib/payment/service');
    const svc = new PaymentService(makeProvider() as any);

    await svc.processWebhookEvent({
      type: 'subscription.updated',
      payload: {
        id: 'sub_1',
        status: 'active',
        currentPeriodEnd: futureEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    } as any);

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db_sub_1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          expiresAt: futureEnd,
        }),
      })
    );
  });

  it('does NOT resurrect locally CANCELLED subscription on subscription.updated(active)', async () => {
    const now = Date.now();
    const futureEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 'db_sub_2',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'CANCELLED',
      startedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      canceledAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_2',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    prismaMock.subscription.update.mockResolvedValueOnce({
      id: 'db_sub_2',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'CANCELLED',
      startedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      canceledAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_2',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    const { PaymentService } = await import('../lib/payment/service');
    const svc = new PaymentService(makeProvider() as any);

    await svc.processWebhookEvent({
      type: 'subscription.updated',
      payload: {
        id: 'sub_2',
        status: 'active',
        currentPeriodEnd: futureEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    } as any);

    // The update call may happen for cancelAtPeriodEnd/canceledAt/expiresAt diffs,
    // but it must never set status to ACTIVE for a locally CANCELLED subscription.
    const updateCalls = prismaMock.subscription.update.mock.calls;
    for (const call of updateCalls) {
      const arg = call?.[0];
      expect(arg?.data?.status).not.toBe('ACTIVE');
    }
  });

  it('updates planId immediately on subscription.updated when priceId changes', async () => {
    const now = Date.now();
    const periodEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 'db_sub_plan_change',
      userId: 'user_1',
      planId: 'plan_old',
      organizationId: null,
      status: 'ACTIVE',
      startedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      expiresAt: periodEnd,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_plan_change',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    prismaMock.plan.findFirst.mockResolvedValueOnce({
      id: 'plan_new',
      name: 'New Plan',
      priceCents: 999,
      autoRenew: true,
    } as any);

    prismaMock.subscription.update.mockResolvedValueOnce({
      id: 'db_sub_plan_change',
      userId: 'user_1',
      planId: 'plan_new',
      organizationId: null,
      status: 'ACTIVE',
      startedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      expiresAt: periodEnd,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_plan_change',
      externalSubscriptionIds: null,
      plan: { autoRenew: true },
    });

    const { PaymentService } = await import('../lib/payment/service');
    const svc = new PaymentService(makeProvider() as any);

    await svc.processWebhookEvent({
      type: 'subscription.updated',
      payload: {
        id: 'sub_plan_change',
        status: 'active',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        priceId: 'price_new',
      },
    } as any);

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db_sub_plan_change' },
        data: expect.objectContaining({
          planId: 'plan_new',
        }),
      })
    );
  });

  it('resurrects locally EXPIRED subscription on invoice.payment_succeeded when provider period end is in the future', async () => {
    const now = Date.now();
    const futureEnd = new Date(now + 30 * 24 * 60 * 60 * 1000);

    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 'db_sub_3',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'EXPIRED',
      startedAt: new Date(now - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      canceledAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_3',
      externalSubscriptionIds: null,
      plan: { autoRenew: true, tokenLimit: 100, supportsOrganizations: false },
    });

    prismaMock.notification.findFirst.mockResolvedValueOnce(null);

    const tx = {
      payment: {
        findUnique: vi.fn(async () => null),
        count: vi.fn(async () => 1),
        create: vi.fn(async () => ({ id: 'pay_1' })),
      },
      user: { update: vi.fn(async () => undefined) },
      organization: { update: vi.fn(async () => undefined) },
    };

    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(tx));

    prismaMock.subscription.update.mockResolvedValue({
      id: 'db_sub_3',
    } as any);

    const provider = makeProvider({
      getSubscription: vi.fn(async () => ({ currentPeriodEnd: futureEnd })),
    });

    const { PaymentService } = await import('../lib/payment/service');
    const svc = new PaymentService(provider as any);

    await svc.processWebhookEvent({
      type: 'invoice.payment_succeeded',
      payload: {
        id: 'in_1',
        subscriptionId: 'sub_3',
        paymentIntentId: 'pi_1',
        amountPaid: 5000,
        subtotal: 5000,
        amountDiscount: 0,
        currency: 'usd',
        billingReason: 'subscription_cycle',
      },
    } as any);

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'db_sub_3' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          expiresAt: futureEnd,
        }),
      })
    );
  });

  it('preserves future local expiry for Paystack when subscription.updated period end is stale', async () => {
    const now = Date.now();
    const futureEnd = new Date(now + 14 * 24 * 60 * 60 * 1000);
    const staleEnd = new Date(now - 30 * 1000);

    prismaMock.subscription.findUnique.mockResolvedValueOnce({
      id: 'db_sub_paystack_1',
      userId: 'user_1',
      planId: 'plan_1',
      organizationId: null,
      status: 'ACTIVE',
      startedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      expiresAt: futureEnd,
      canceledAt: null,
      cancelAtPeriodEnd: false,
      paymentProvider: 'paystack',
      externalSubscriptionId: 'sub_paystack_1',
      externalSubscriptionIds: null,
      plan: { autoRenew: true, id: 'plan_1', priceCents: 10000 },
    });

    const { PaymentService } = await import('../lib/payment/service');
    const svc = new PaymentService(makeProvider({ name: 'paystack' }) as any);

    await svc.processWebhookEvent({
      type: 'subscription.updated',
      payload: {
        id: 'sub_paystack_1',
        status: 'active',
        currentPeriodEnd: staleEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    } as any);

    const updateCalls = prismaMock.subscription.update.mock.calls;
    for (const call of updateCalls) {
      const arg = call?.[0];
      expect(arg?.data?.expiresAt?.getTime?.()).not.toBe(staleEnd.getTime());
    }
  });
});
