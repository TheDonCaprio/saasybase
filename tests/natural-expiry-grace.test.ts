import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../lib/settings', () => ({
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
  shouldResetPaidTokensOnExpiryForPlanAutoRenew: vi.fn(async () => true),
}));

vi.mock('../lib/teams', () => ({
  resetOrganizationSharedTokens: vi.fn(async () => undefined),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    organizations: {
      deleteOrganization: vi.fn(async () => undefined),
      createOrganization: vi.fn(async () => ({ id: 'org_1', name: 'Org' })),
      updateOrganization: vi.fn(async () => undefined),
      getOrganization: vi.fn(async () => undefined),
      getOrganizationMembershipList: vi.fn(async () => ({ data: [] })),
    },
  })),
}));

import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../lib/paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../lib/organization-access';
import * as settings from '../lib/settings';

describe('Natural expiry grace', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // vi.resetAllMocks() clears vi.fn() implementations, so reapply defaults.
    (settings.getPaidTokensNaturalExpiryGraceHours as any).mockResolvedValue(24);
    (settings.shouldResetPaidTokensOnExpiryForPlanAutoRenew as any).mockResolvedValue(true);
  });

  it('does not clear tokens if there is time remaining on a non-EXPIRED subscription (e.g., cancel-at-period-end)', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_1' });

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: 'user_1', graceHours: 24 });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('has_valid_subscription');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('clears tokens after grace for CANCELLED subscriptions based on settings (default false is not treated as a hard override)', async () => {
    // 1) hasValid check
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    // 2) latestEndedBeyondGrace check
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_ended',
      status: 'CANCELLED',
      expiresAt: new Date(Date.now() - 48 * 3600 * 1000),
      clearPaidTokensOnExpiry: false,
      plan: { autoRenew: true, supportsOrganizations: false },
    });
    // org cleanup query
    prismaMock.subscription.findMany.mockResolvedValueOnce([]);

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: 'user_1', graceHours: 24 });

    expect(res.cleared).toBe(true);
    expect(res.reason).toBe('cleared');
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('does not clear tokens after grace when an EXPIRED subscription has an explicit clearPaidTokensOnExpiry=false override', async () => {
    // 1) hasValid check
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    // 2) latestEndedBeyondGrace check
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_expired',
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 48 * 3600 * 1000),
      clearPaidTokensOnExpiry: false,
      plan: { autoRenew: true, supportsOrganizations: false },
    });

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: 'user_1', graceHours: 24 });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('policy_no_clear');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('does not dismantle orgs during grace when syncing eligibility', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_1',
      userId: 'user_1',
      status: 'EXPIRED',
      expiresAt: new Date(),
      plan: {
        id: 'plan_1',
        name: 'Team',
        tokenLimit: 100,
        organizationSeatLimit: 5,
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        supportsOrganizations: true,
      },
    });

    const res = await syncOrganizationEligibilityForUser('user_1');

    expect(res.allowed).toBe(true);
    expect((res as any).kind).toBe('OWNER');
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('does not dismantle orgs during grace for CANCELLED subscriptions', async () => {
    // A cancel-at-period-end subscription that has reached its end date
    // should still get grace period protection — not immediate org deletion.
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_cancelled',
      userId: 'user_1',
      status: 'CANCELLED',
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1h ago, within 24h grace
      plan: {
        id: 'plan_1',
        name: 'Team',
        tokenLimit: 100,
        organizationSeatLimit: 5,
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        supportsOrganizations: true,
      },
    });

    const res = await syncOrganizationEligibilityForUser('user_1');

    expect(res.allowed).toBe(true);
    expect((res as any).kind).toBe('OWNER');
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('allows admin flows to bypass grace and dismantle orgs immediately', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.organization.findMany.mockResolvedValueOnce([]);

    const res = await syncOrganizationEligibilityForUser('user_1', { ignoreGrace: true });

    expect(res.allowed).toBe(false);
    expect((res as any).reason).toBe('NO_PLAN');
    expect(prismaMock.organization.findMany).toHaveBeenCalledTimes(1);
  });
});
