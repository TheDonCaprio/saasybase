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
      clerkOrganizationId: 'provider_org_1',
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
            { clerkOrganizationId: 'org_1' },
          ],
        },
      })
    );
    expect(state.organization?.id).toBe('org_1');
  });
});