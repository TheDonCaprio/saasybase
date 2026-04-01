import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  subscription: {
    findUnique: vi.fn(),
    upsert: vi.fn(async (args) => args),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/paidTokenCleanup', () => ({ maybeClearPaidTokensAfterNaturalExpiryGrace: vi.fn(async () => undefined) }));
vi.mock('../lib/organization-access', () => ({ syncOrganizationEligibilityForUser: vi.fn(async () => undefined) }));
vi.mock('../lib/notifications', () => ({ notifyExpiredSubscriptions: vi.fn(async () => undefined) }));

import { persistSubscriptionCheckoutState } from '../lib/payment/subscription-checkout-state';

type PersistSubscriptionCheckoutStateInput = Parameters<typeof persistSubscriptionCheckoutState>[0];

describe('Subscription Customer ID Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.subscription.findUnique.mockResolvedValue({ externalSubscriptionIds: null, organizationId: null });
  });

  it('prevents customerId duplication if another user owns it in the legacy string column', async () => {
    // 1st call: user performing checkout (has no map yet)
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'checkout_user',
      externalCustomerIds: null,
      externalCustomerId: null,
    });
    
    // 2nd call: lookup for legacy owner
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'legacy_owner_user',
    });

    await persistSubscriptionCheckoutState({
      userId: 'checkout_user',
      subscription: {
        id: 'sub_provider_2',
        customerId: 'cus_shared',
        canceledAt: null,
      } as PersistSubscriptionCheckoutStateInput['subscription'],
      planToUse: { id: 'plan_team' } as PersistSubscriptionCheckoutStateInput['planToUse'],
      organizationId: null,
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-10T00:00:00.000Z'),
      providerKey: 'razorpay',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    // We expect that the customerId was NOT merged because it's owned by legacy_owner_user.
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'checkout_user' },
      data: expect.objectContaining({
        externalCustomerIds: null, // Should not merge!
        paymentProvider: 'razorpay',
      }),
    }));
    // Make sure we didn't accidentally set the legacy column either
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        externalCustomerId: 'cus_shared',
      }),
    }));
  });

  it('prevents customerId duplication if another user owns it in the map column', async () => {
    // 1st call: user performing checkout (has no map yet)
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'checkout_user',
      externalCustomerIds: null,
      externalCustomerId: null,
    });
    
    // 2nd call: lookup for legacy owner (nobody)
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    
    // 3rd call: lookup via JSON maps
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: 'map_owner_user',
        externalCustomerIds: { razorpay: 'cus_shared' },
      },
    ]);

    await persistSubscriptionCheckoutState({
      userId: 'checkout_user',
      subscription: {
        id: 'sub_provider_2',
        customerId: 'cus_shared',
        canceledAt: null,
      } as PersistSubscriptionCheckoutStateInput['subscription'],
      planToUse: { id: 'plan_team' } as PersistSubscriptionCheckoutStateInput['planToUse'],
      organizationId: null,
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-10T00:00:00.000Z'),
      providerKey: 'razorpay',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    // We expect that the customerId was NOT merged because it's owned by map_owner_user.
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'checkout_user' },
      data: expect.objectContaining({
        externalCustomerIds: null, // Should not merge!
        paymentProvider: 'razorpay',
      }),
    }));
  });
  
  it('allows customerId mapping if the user itself owns it in the legacy string column', async () => {
    // 1st call: user performing checkout (has it in legacy column already)
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'checkout_user',
      externalCustomerIds: null,
      externalCustomerId: 'cus_shared',
    });
    
    // Because they already own it, it skips checking other users
    // (no legacy lookup, no map lookup needed since we natively trust our own legacy ID)

    await persistSubscriptionCheckoutState({
      userId: 'checkout_user',
      subscription: {
        id: 'sub_provider_2',
        customerId: 'cus_shared',
        canceledAt: null,
      } as PersistSubscriptionCheckoutStateInput['subscription'],
      planToUse: { id: 'plan_team' } as PersistSubscriptionCheckoutStateInput['planToUse'],
      organizationId: null,
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-10T00:00:00.000Z'),
      providerKey: 'razorpay',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    // We expect that the customerId WAS merged!
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'checkout_user' },
      data: expect.objectContaining({
        externalCustomerIds: 'cus_shared', // the mocked mergeIdMap directly returns the value
      }),
    }));
  });
});
