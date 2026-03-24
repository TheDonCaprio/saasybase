import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  payment: {
    findFirst: vi.fn(),
  },
  plan: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: loggerMock }));

import { resolveProviderSubscriptionPlan } from '../lib/payment/provider-subscription-identity';

describe('resolveProviderSubscriptionPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers an exact provider payment reference match before falling back to latest pending payment', async () => {
    prismaMock.payment.findFirst
      .mockResolvedValueOnce({ id: 'pay_exact', planId: 'plan_exact' });
    prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_exact', name: 'Exact Plan' });

    const result = await resolveProviderSubscriptionPlan({
      providerSubscription: {
        id: 'sub_paystack_1',
        status: 'active',
        currentPeriodStart: new Date('2026-03-24T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-03-25T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        customerId: 'CUS_paystack_1',
        priceId: 'PLN_discounted',
        metadata: {},
        latestInvoice: null,
      },
      invoice: {
        id: 'inv_1',
        amountPaid: 1000,
        amountDue: 0,
        amountDiscount: 0,
        subtotal: 1000,
        total: 1000,
        currency: 'NGN',
        status: 'paid',
        paymentIntentId: 'pay_ref_123',
        customerId: 'CUS_paystack_1',
        metadata: {},
      },
      subscriptionId: 'sub_paystack_1',
      providerKey: 'paystack',
      findPlanByPriceIdentifier: vi.fn(async () => null),
      resolveUserByCustomerId: vi.fn(async () => 'user_1'),
      getPendingSubscriptionLookbackDate: vi.fn(() => new Date('2026-03-20T00:00:00.000Z')),
    });

    expect(result.plan?.id).toBe('plan_exact');
    expect(prismaMock.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentProvider: 'paystack',
          OR: [
            { externalPaymentId: 'pay_ref_123' },
            { externalSessionId: 'pay_ref_123' },
          ],
        }),
      }),
    );
  });

  it('scopes the pending-payment fallback to the current provider', async () => {
    prismaMock.payment.findFirst.mockResolvedValueOnce({ id: 'pay_latest_provider', planId: 'plan_paystack' });
    prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_paystack', name: 'Paystack Plan' });

    const result = await resolveProviderSubscriptionPlan({
      providerSubscription: {
        id: 'sub_paystack_2',
        status: 'active',
        currentPeriodStart: new Date('2026-03-24T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-03-25T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        customerId: 'CUS_paystack_2',
        priceId: 'PLN_discounted_2',
        metadata: {},
        latestInvoice: null,
      },
      subscriptionId: 'sub_paystack_2',
      providerKey: 'paystack',
      findPlanByPriceIdentifier: vi.fn(async () => null),
      resolveUserByCustomerId: vi.fn(async () => 'user_2'),
      getPendingSubscriptionLookbackDate: vi.fn(() => new Date('2026-03-20T00:00:00.000Z')),
    });

    expect(result.plan?.id).toBe('plan_paystack');
    expect(prismaMock.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentProvider: 'paystack',
        }),
      }),
    );
  });
});