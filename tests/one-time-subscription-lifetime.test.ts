import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptionCreateMock = vi.hoisted(() => vi.fn());
const paymentCreateMock = vi.hoisted(() => vi.fn());
const userUpdateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

vi.mock('../lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: vi.fn(async () => undefined),
}));

vi.mock('../lib/notifications', () => ({
  sendBillingNotification: vi.fn(async () => undefined),
  sendAdminNotificationEmail: vi.fn(async () => undefined),
}));

vi.mock('../lib/settings', () => ({
  getDefaultTokenLabel: vi.fn(async () => 'tokens'),
}));

import { processOneTimeSubscriptionCreation } from '../lib/payment/one-time-subscription-creation';

describe('processOneTimeSubscriptionCreation lifetime plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptionCreateMock.mockResolvedValue({ id: 'sub_1' });
    paymentCreateMock.mockResolvedValue({ id: 'pay_1' });
    userUpdateMock.mockResolvedValue({ id: 'user_1' });
    transactionMock.mockImplementation(async (callback: (tx: {
      subscription: { create: typeof subscriptionCreateMock };
      payment: { create: typeof paymentCreateMock };
      user: { update: typeof userUpdateMock };
    }) => Promise<unknown>) => callback({
      subscription: { create: subscriptionCreateMock },
      payment: { create: paymentCreateMock },
      user: { update: userUpdateMock },
    }));
  });

  it('stores lifetime one-time subscriptions with a sentinel expiry and lifetime flag', async () => {
    await processOneTimeSubscriptionCreation({
      userId: 'user_1',
      planToUse: {
        id: 'plan_lifetime',
        name: 'Lifetime Pro',
        autoRenew: false,
        isLifetime: true,
        durationHours: 24,
        tokenLimit: 1000,
        tokenName: 'credits',
        supportsOrganizations: false,
      } as never,
      now: new Date('2026-04-15T12:00:00.000Z'),
      periodMs: 24 * 60 * 60 * 1000,
      organizationContext: null,
      resolvedAmountCents: 9900,
      resolvedSubtotalCents: 9900,
      resolvedDiscountCents: 0,
      couponCode: null,
      session: { id: 'sess_1', metadata: {} } as never,
      finalPaymentIntent: 'pi_1',
      providerKey: 'stripe',
      mergeIdMap: () => null,
    });

    expect(subscriptionCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isLifetime: true,
        status: 'ACTIVE',
      }),
    }));

    const subscriptionArgs = subscriptionCreateMock.mock.calls[0]?.[0];
    expect(subscriptionArgs?.data?.expiresAt).toBeInstanceOf(Date);
    expect(subscriptionArgs?.data?.expiresAt.getUTCFullYear()).toBe(2999);
  });
});
