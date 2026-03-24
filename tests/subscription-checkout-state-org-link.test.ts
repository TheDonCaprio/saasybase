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

describe('persistSubscriptionCheckoutState organization linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.subscription.findUnique.mockResolvedValue({ externalSubscriptionIds: null, organizationId: null });
  });

  it('persists organizationId when checkout already has an owned organization', async () => {
    await persistSubscriptionCheckoutState({
      userId: 'user_1',
      subscription: {
        id: 'sub_provider_1',
        customerId: 'cus_1',
        canceledAt: null,
      } as PersistSubscriptionCheckoutStateInput['subscription'],
      planToUse: { id: 'plan_team' } as PersistSubscriptionCheckoutStateInput['planToUse'],
      organizationId: 'org_1',
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-10T00:00:00.000Z'),
      providerKey: 'paddle',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        organizationId: 'org_1',
      }),
      create: expect.objectContaining({
        organizationId: 'org_1',
      }),
    }));
  });

  it('does not merge provider customer ids already mapped to a different user', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ externalCustomerIds: JSON.stringify({ paddle: 'cus_existing_self' }) })
      .mockResolvedValueOnce(null);
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: 'user_other',
        externalCustomerIds: { paddle: 'cus_1' },
      },
    ]);

    await persistSubscriptionCheckoutState({
      userId: 'user_1',
      subscription: {
        id: 'sub_provider_2',
        customerId: 'cus_1',
        canceledAt: null,
      } as PersistSubscriptionCheckoutStateInput['subscription'],
      planToUse: { id: 'plan_team' } as PersistSubscriptionCheckoutStateInput['planToUse'],
      organizationId: null,
      desiredStatus: 'ACTIVE',
      effectiveStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      effectiveExpiresAt: new Date('2026-04-10T00:00:00.000Z'),
      providerKey: 'paddle',
      mergeIdMap: (_existing: unknown, _key: string, value?: string | null) => value ?? null,
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({
        externalCustomerIds: JSON.stringify({ paddle: 'cus_existing_self' }),
      }),
    }));
  });
});