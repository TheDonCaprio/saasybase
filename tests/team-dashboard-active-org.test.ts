import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: { findFirst: vi.fn() },
}));

const accessSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/organization-access', () => ({
  getOrganizationAccessSummary: accessSummaryMock,
}));

import { fetchTeamDashboardState } from '../lib/team-dashboard';

describe('fetchTeamDashboardState active organization resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves an owner workspace when the active organization id is the local organization id', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: { id: 'sub_1' },
      plan: { id: 'plan_team' },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      providerOrganizationId: 'provider_org_1',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'user_1',
      planId: 'plan_team',
      seatLimit: 5,
      tokenBalance: 100,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: null,
      memberCapStrategy: null,
      memberCapResetIntervalHours: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      plan: {
        id: 'plan_team',
        name: 'Team',
        tokenName: 'credits',
        tokenLimit: 100,
        organizationSeatLimit: 5,
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        supportsOrganizations: true,
      },
      memberships: [],
      invites: [],
    });

    const state = await fetchTeamDashboardState('user_1', { activeOrganizationId: 'org_1' });

    expect(accessSummaryMock).toHaveBeenCalledWith('user_1', 'org_1');
    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId: 'user_1',
          OR: [
            { id: 'org_1' },
            { providerOrganizationId: 'org_1' },
          ],
        },
      })
    );
    expect(state.organization?.id).toBe('org_1');
    expect(state.organization?.providerOrganizationId).toBe('provider_org_1');
  });

  it('shows the owner as uncapped in dashboard state when owner exemption is enabled', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: { id: 'sub_1' },
      plan: { id: 'plan_team' },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      providerOrganizationId: 'provider_org_1',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'user_1',
      planId: 'plan_team',
      seatLimit: 5,
      tokenBalance: 500,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: 100,
      memberCapStrategy: 'HARD',
      memberCapResetIntervalHours: null,
      ownerExemptFromCaps: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      plan: {
        id: 'plan_team',
        name: 'Team',
        tokenName: 'credits',
        tokenLimit: 500,
        organizationSeatLimit: 5,
        organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        supportsOrganizations: true,
      },
      memberships: [
        {
          id: 'membership_owner',
          userId: 'user_1',
          role: 'OWNER',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          memberTokenCapOverride: null,
          memberTokenUsage: 75,
          memberTokenUsageWindowStart: null,
          user: {
            id: 'user_1',
            name: 'Owner User',
            email: 'owner@example.com',
            imageUrl: null,
          },
        },
      ],
      invites: [],
    });

    const state = await fetchTeamDashboardState('user_1', { activeOrganizationId: 'org_1' });

    expect(state.organization?.members).toEqual([
      expect.objectContaining({
        userId: 'user_1',
        effectiveMemberCap: null,
        sharedTokenBalance: 500,
        ownerExemptFromCaps: true,
      }),
    ]);
  });

  it('prefers the attached team plan token strategy when the organization row still has the legacy shared default', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: { id: 'sub_1' },
      plan: { id: 'plan_team' },
    });

    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      providerOrganizationId: 'provider_org_1',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'user_1',
      planId: 'plan_team',
      seatLimit: 5,
      tokenBalance: 150,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      memberTokenCap: null,
      memberCapStrategy: null,
      memberCapResetIntervalHours: null,
      ownerExemptFromCaps: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      plan: {
        id: 'plan_team',
        name: 'Team',
        tokenName: 'exports',
        tokenLimit: 150,
        organizationSeatLimit: 5,
        organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        supportsOrganizations: true,
      },
      memberships: [
        {
          id: 'membership_owner',
          userId: 'user_1',
          role: 'OWNER',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          memberTokenCapOverride: null,
          memberTokenUsage: 0,
          memberTokenUsageWindowStart: null,
          sharedTokenBalance: 0,
          user: {
            id: 'user_1',
            name: 'Owner User',
            email: 'owner@example.com',
            imageUrl: null,
          },
        },
        {
          id: 'membership_member',
          userId: 'user_2',
          role: 'MEMBER',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
          memberTokenCapOverride: null,
          memberTokenUsage: 0,
          memberTokenUsageWindowStart: null,
          sharedTokenBalance: 0,
          user: {
            id: 'user_2',
            name: 'Two User',
            email: 'two@example.com',
            imageUrl: null,
          },
        },
      ],
      invites: [],
    });

    const state = await fetchTeamDashboardState('user_1', { activeOrganizationId: 'org_1' });

    expect(state.organization?.tokenPoolStrategy).toBe('ALLOCATED_PER_MEMBER');
    expect(state.organization?.members).toEqual([
      expect.objectContaining({ userId: 'user_1', sharedTokenBalance: 150 }),
      expect.objectContaining({ userId: 'user_2', sharedTokenBalance: 150 }),
    ]);
  });
});