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
  creditAllocatedPerMemberTokens: vi.fn(async () => undefined),
  resetAllocatedPerMemberTokens: vi.fn(async () => undefined),
}));

import { applySubscriptionWebhookUpdate, markSubscriptionActive } from '../lib/payment/subscription-state-mutations';
import { resetAllocatedPerMemberTokens } from '../lib/teams';

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

  it('resets per-member balances on team plan changes using ALLOCATED_PER_MEMBER', async () => {
    const nextExpiresAt = new Date('2026-05-01T00:00:00.000Z');

    prismaMock.subscription.update.mockResolvedValueOnce({
      id: 'sub_team_1',
      userId: 'user_1',
      organizationId: 'org_1',
      plan: {
        id: 'plan_team_2',
        autoRenew: true,
        tokenLimit: 120,
        supportsOrganizations: true,
        organizationSeatLimit: 8,
        organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      },
    });

    const result = await applySubscriptionWebhookUpdate({
      dbSub: {
        id: 'sub_team_1',
        userId: 'user_1',
        status: 'ACTIVE',
        expiresAt: new Date('2026-04-01T00:00:00.000Z'),
        canceledAt: null,
        cancelAtPeriodEnd: false,
        planId: 'plan_team_1',
        organizationId: 'org_1',
        plan: {
          id: 'plan_team_1',
          autoRenew: true,
          tokenLimit: 80,
          supportsOrganizations: true,
          organizationSeatLimit: 5,
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        },
      } as never,
      effectiveStatus: 'ACTIVE',
      effectiveExpiresAt: nextExpiresAt,
      nextCancelAtPeriodEnd: false,
      nextCanceledAt: null,
      nextPlanId: 'plan_team_2',
      syncOrganizationEligibilityForUser: vi.fn(async () => undefined),
    });

    expect(result.plan.organizationTokenPoolStrategy).toBe('ALLOCATED_PER_MEMBER');
    expect(resetAllocatedPerMemberTokens).toHaveBeenCalledWith({ organizationId: 'org_1', amount: 120 });
  });
});