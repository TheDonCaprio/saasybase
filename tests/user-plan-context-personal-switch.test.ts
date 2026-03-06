import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: { findFirst: vi.fn() },
  organizationMembership: { findFirst: vi.fn() },
}));

const accessSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/organization-access', () => ({
  getOrganizationAccessSummary: accessSummaryMock,
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

  it('resolves organization context when active Clerk org is present', async () => {
    accessSummaryMock.mockResolvedValue({
      allowed: true,
      kind: 'OWNER',
      subscription: { id: 'sub_1' },
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

    const context = await getOrganizationPlanContext('user_1', 'org_clerk_1');

    expect(accessSummaryMock).toHaveBeenCalledWith('user_1', 'org_clerk_1');
    expect(context?.organization?.id).toBe('org_1');
    expect(context?.role).toBe('OWNER');
  });
});
