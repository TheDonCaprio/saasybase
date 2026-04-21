import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: { findFirst: vi.fn() },
  organizationMembership: { findFirst: vi.fn() },
}));

const accessSummaryMock = vi.hoisted(() => vi.fn());
const getActiveTeamSubscriptionMock = vi.hoisted(() => vi.fn());
const getActiveTeamSubscriptionForOrganizationMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/organization-access', () => ({
  getOrganizationAccessSummary: accessSummaryMock,
  getActiveTeamSubscription: getActiveTeamSubscriptionMock,
  getActiveTeamSubscriptionForOrganization: getActiveTeamSubscriptionForOrganizationMock,
}));

import { getOrganizationPlanContext } from '../lib/user-plan-context';

describe('getOrganizationPlanContext personal switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no active Clerk org is selected', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: { id: 'sub_1' },
      plan: { id: 'plan_team' },
    });

    const context = await getOrganizationPlanContext('user_1', null);

    expect(context).toBeNull();
    expect(accessSummaryMock).not.toHaveBeenCalled();
    expect(prismaMock.organization.findFirst).not.toHaveBeenCalled();
  });

  it('resolves organization context when an active provider org reference is present', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: {
        id: 'sub_1',
        plan: {
          id: 'plan_team_new',
          name: 'Team Plus',
          shortDescription: null,
          description: null,
          priceCents: 3000,
          durationHours: 720,
          autoRenew: true,
          recurringInterval: 'month',
          tokenLimit: 300,
          tokenName: 'credits',
          organizationSeatLimit: 10,
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
          supportsOrganizations: true,
        },
      },
      plan: { id: 'plan_team_new' },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      name: 'Leggo',
      slug: 'leggo',
      ownerUserId: 'user_1',
      seatLimit: 5,
      tokenBalance: 100,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: null,
      memberCapStrategy: null,
      memberCapResetIntervalHours: null,
      planId: 'plan_team',
      plan: {
        id: 'plan_team',
        name: 'Team',
        shortDescription: null,
        description: null,
        priceCents: 1000,
        durationHours: 720,
        autoRenew: true,
        recurringInterval: 'month',
        tokenLimit: 100,
        tokenName: 'credits',
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
      },
    });
    prismaMock.organizationMembership.findFirst.mockResolvedValue(null);

    const context = await getOrganizationPlanContext('user_1', 'org_clerk_1');

    expect(accessSummaryMock).toHaveBeenCalledWith('user_1', 'org_clerk_1');
    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId: 'user_1',
          OR: [
            { id: 'org_clerk_1' },
            { providerOrganizationId: 'org_clerk_1' },
          ],
        },
      }),
    );
    expect(context?.organization?.id).toBe('org_1');
    expect(context?.role).toBe('OWNER');
    expect(context?.effectivePlan.name).toBe('Team Plus');
  });

  it('resolves organization context when the active org reference is a local organization id', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: {
        id: 'sub_1',
        plan: {
          id: 'plan_team',
          name: 'Team',
          shortDescription: null,
          description: null,
          priceCents: 1000,
          durationHours: 720,
          autoRenew: true,
          recurringInterval: 'month',
          tokenLimit: 100,
          tokenName: 'credits',
          organizationSeatLimit: 5,
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
          supportsOrganizations: true,
        },
      },
      plan: { id: 'plan_team' },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      name: 'Leggo',
      slug: 'leggo',
      ownerUserId: 'user_1',
      seatLimit: 5,
      tokenBalance: 100,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: null,
      memberCapStrategy: null,
      memberCapResetIntervalHours: null,
      planId: 'plan_team',
      plan: {
        id: 'plan_team',
        name: 'Team',
        shortDescription: null,
        description: null,
        priceCents: 1000,
        durationHours: 720,
        autoRenew: true,
        recurringInterval: 'month',
        tokenLimit: 100,
        tokenName: 'credits',
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
      },
    });
    prismaMock.organizationMembership.findFirst.mockResolvedValue(null);

    const context = await getOrganizationPlanContext('user_1', 'org_1');

    expect(accessSummaryMock).toHaveBeenCalledWith('user_1', 'org_1');
    expect(context?.organization?.id).toBe('org_1');
    expect(context?.role).toBe('OWNER');
  });

  it('prefers the owner subscription plan for members when organization metadata is stale', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'MEMBER',
      membership: {
        organizationId: 'org_1',
        organizationName: 'Leggo',
        ownerUserId: 'owner_1',
        providerOrganizationId: 'org_clerk_1',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      name: 'Leggo',
      slug: 'leggo',
      ownerUserId: 'owner_1',
      seatLimit: 5,
      tokenBalance: 100,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: null,
      memberCapStrategy: null,
      memberCapResetIntervalHours: null,
      planId: 'plan_team_old',
      plan: {
        id: 'plan_team_old',
        name: 'Team',
        shortDescription: null,
        description: null,
        priceCents: 1000,
        durationHours: 720,
        autoRenew: true,
        recurringInterval: 'month',
        tokenLimit: 100,
        tokenName: 'credits',
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
      },
    });
    prismaMock.organizationMembership.findFirst.mockResolvedValue(null);
    getActiveTeamSubscriptionForOrganizationMock.mockResolvedValue({
      id: 'sub_owner_1',
      plan: {
        id: 'plan_team_new',
        name: 'Team Plus',
        shortDescription: null,
        description: null,
        priceCents: 3000,
        durationHours: 720,
        autoRenew: true,
        recurringInterval: 'month',
        tokenLimit: 300,
        tokenName: 'credits',
        organizationSeatLimit: 10,
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        supportsOrganizations: true,
      },
    });

    const context = await getOrganizationPlanContext('user_2', 'org_1');

    expect(getActiveTeamSubscriptionForOrganizationMock).toHaveBeenCalledWith('owner_1', 'org_1', { includeGrace: true });
    expect(context?.role).toBe('MEMBER');
    expect(context?.effectivePlan.name).toBe('Team Plus');
  });
});
