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
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../lib/settings', () => ({
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
  getOrganizationExpiryMode: vi.fn(async () => 'SUSPEND'),
  shouldResetPaidTokensOnExpiryForPlanAutoRenew: vi.fn(async () => true),
}));

vi.mock('../lib/teams', () => ({
  resetOrganizationSharedTokens: vi.fn(async () => undefined),
}));

vi.mock('../lib/workspace-service', () => ({
  workspaceService: {
    providerName: 'nextauth',
    usesExternalProviderOrganizations: false,
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    organizations: {
      deleteOrganization: vi.fn(async () => undefined),
      createOrganization: vi.fn(async () => ({ id: 'org_1', name: 'Org' })),
      updateOrganization: vi.fn(async () => undefined),
      getOrganization: vi.fn(async () => undefined),
      getOrganizationMembershipList: vi.fn(async () => ({ data: [] })),
      revokeOrganizationInvitation: vi.fn(async () => undefined),
      listOrganizations: vi.fn(async () => ({ data: [] })),
    },
    users: {
      getUser: vi.fn(async () => ({ id: 'user_1', organizations: [] })),
    },
  })),
}));

import { maybeClearPaidTokensAfterNaturalExpiryGrace } from '../lib/paidTokenCleanup';
import { syncOrganizationEligibilityForUser } from '../lib/organization-access';
import * as settings from '../lib/settings';
import { resetOrganizationSharedTokens } from '../lib/teams';

type EligibilityResult = Awaited<ReturnType<typeof syncOrganizationEligibilityForUser>>;

describe('Natural expiry grace', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // vi.resetAllMocks() clears vi.fn() implementations, so reapply defaults.
    vi.mocked(settings.getPaidTokensNaturalExpiryGraceHours).mockResolvedValue(24);
    vi.mocked(settings.shouldResetPaidTokensOnExpiryForPlanAutoRenew).mockResolvedValue(true);
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

  it('clears allocated-per-member team balances after grace when the expiry setting is enabled', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_team_expired',
      status: 'CANCELLED',
      expiresAt: new Date(Date.now() - 48 * 3600 * 1000),
      clearPaidTokensOnExpiry: false,
      plan: { autoRenew: true, supportsOrganizations: true, organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
    });
    prismaMock.subscription.findMany.mockResolvedValueOnce([
      { organizationId: 'org_alloc_1' },
    ]);
    prismaMock.organization.findMany.mockResolvedValueOnce([
      { id: 'org_alloc_1' },
    ]);
    vi.mocked(settings.shouldResetPaidTokensOnExpiryForPlanAutoRenew).mockResolvedValueOnce(true);

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: 'user_1', graceHours: 24 });

    expect(res.cleared).toBe(true);
    expect(res.reason).toBe('cleared');
    expect(resetOrganizationSharedTokens).toHaveBeenCalledWith({ organizationId: 'org_alloc_1' });
  });

  it('does not clear allocated-per-member team balances after grace when the expiry setting is disabled', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_team_expired',
      status: 'CANCELLED',
      expiresAt: new Date(Date.now() - 48 * 3600 * 1000),
      clearPaidTokensOnExpiry: false,
      plan: { autoRenew: true, supportsOrganizations: true, organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
    });
    vi.mocked(settings.shouldResetPaidTokensOnExpiryForPlanAutoRenew).mockResolvedValueOnce(false);

    const res = await maybeClearPaidTokensAfterNaturalExpiryGrace({ userId: 'user_1', graceHours: 24 });

    expect(res.cleared).toBe(false);
    expect(res.reason).toBe('policy_no_clear');
    expect(resetOrganizationSharedTokens).not.toHaveBeenCalled();
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
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
    expect((res as EligibilityResult & { kind?: string }).kind).toBe('OWNER');
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
    expect((res as EligibilityResult & { kind?: string }).kind).toBe('OWNER');
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('allows admin flows to bypass grace and dismantle orgs immediately', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.organization.findMany.mockResolvedValueOnce([]);

    const res = await syncOrganizationEligibilityForUser('user_1', { ignoreGrace: true });

    expect(res.allowed).toBe(false);
    expect((res as EligibilityResult & { reason?: string }).reason).toBe('NO_PLAN');
    expect(prismaMock.organization.findMany).toHaveBeenCalledTimes(1);
  });

  it('restores a suspended linked organization when team eligibility becomes valid again', async () => {
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce({
        id: 'sub_1',
        userId: 'user_1',
        organizationId: 'org_1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        plan: {
          id: 'plan_1',
          name: 'Team',
          tokenLimit: 100,
          organizationSeatLimit: 5,
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
          supportsOrganizations: true,
        },
      });
    prismaMock.organization.findUnique
      .mockResolvedValueOnce({
        id: 'org_1',
        ownerUserId: 'user_1',
        suspendedAt: new Date('2026-04-17T12:30:44.347Z'),
      })
      .mockResolvedValueOnce({
        id: 'org_1',
        name: 'GuyT',
        slug: 'guyt',
        ownerUserId: 'user_1',
        clerkOrganizationId: null,
        suspendedAt: new Date('2026-04-17T12:30:44.347Z'),
        planId: 'plan_1',
        seatLimit: 5,
        tokenPoolStrategy: 'SHARED_FOR_ORG',
        memberships: [],
      });
    prismaMock.organization.update.mockResolvedValueOnce({
      id: 'org_1',
      clerkOrganizationId: null,
      suspendedAt: null,
      suspensionReason: null,
    });

    const res = await syncOrganizationEligibilityForUser('user_1');

    expect(res.allowed).toBe(true);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: {
        clerkOrganizationId: null,
        suspendedAt: null,
        suspensionReason: null,
      },
    });
  });
});
