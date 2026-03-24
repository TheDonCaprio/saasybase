import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    update: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/paidTokens', () => ({
  shouldClearPaidTokensOnRenewal: vi.fn(async () => true),
}));
vi.mock('../lib/organization-billing-metadata', () => ({
  syncOrganizationBillingMetadata: vi.fn(async () => undefined),
}));
vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: vi.fn(async () => undefined),
  resetOrganizationSharedTokens: vi.fn(async () => undefined),
}));

import { markSubscriptionActive } from '../lib/payment/subscription-state-mutations';

describe('markSubscriptionActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears scheduled cancellation markers when reactivating a subscription', async () => {
    const nextExpiresAt = new Date('2026-04-01T00:00:00.000Z');

    prismaMock.subscription.update.mockResolvedValue({
      id: 'sub_1',
      organizationId: null,
      plan: {
        id: 'plan_1',
        supportsOrganizations: false,
        organizationSeatLimit: null,
        organizationTokenPoolStrategy: null,
      },
    });

    await markSubscriptionActive('sub_1', nextExpiresAt);

    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub_1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          canceledAt: null,
          cancelAtPeriodEnd: false,
          expiresAt: nextExpiresAt,
        }),
      }),
    );
  });
});