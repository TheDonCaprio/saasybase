import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
  organizationMembership: {
    updateMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/runtime-guards', () => ({ toError: vi.fn((error: unknown) => (error instanceof Error ? error : new Error(String(error)))) }));
vi.mock('../lib/workspace-service', () => ({ workspaceService: {} }));

import { provisionMemberEntitlements } from '../lib/teams';
import { buildPlanDisplay } from '../lib/user-plan-context';

describe('ALLOCATED_PER_MEMBER behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provisions member balances on join for allocated-per-member workspaces', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      plan: { tokenLimit: 42 },
    });
    prismaMock.organizationMembership.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await provisionMemberEntitlements('user_1', 'org_1');

    expect(result).toBe('ALLOCATED_PER_MEMBER');
    expect(prismaMock.organizationMembership.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', organizationId: 'org_1', status: 'ACTIVE' },
      data: { sharedTokenBalance: 42 },
    });
  });

  it('reports allocated-per-member strategy in plan display context', () => {
    const display = buildPlanDisplay({
      subscription: null,
      organizationContext: {
        role: 'MEMBER',
        organization: {
          id: 'org_1',
          name: 'Acme Workspace',
          tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
          tokenBalance: 500,
          memberTokenCap: null,
          memberCapStrategy: 'DISABLED',
          memberCapResetIntervalHours: null,
          ownerUserId: 'owner_1',
          ownerExemptFromCaps: false,
          plan: {
            id: 'plan_1',
            name: 'Team Pro',
            tokenLimit: 100,
            tokenName: 'tokens',
            organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
          },
        },
        membership: {
          id: 'membership_1',
          role: 'MEMBER',
          sharedTokenBalance: 65,
          memberTokenCapOverride: null,
          memberTokenUsage: 0,
          memberTokenUsageWindowStart: null,
        },
        effectivePlan: {
          id: 'plan_1',
          name: 'Team Pro',
          tokenLimit: 100,
          tokenName: 'tokens',
          organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        },
      } as never,
      userTokenBalance: 0,
      userFreeTokenBalance: 0,
      freePlanSettings: { tokenLimit: 5, tokenName: 'tokens', renewalType: 'monthly' } as never,
      defaultTokenLabel: 'tokens',
    });

    expect(display.tokenPoolStrategy).toBe('ALLOCATED_PER_MEMBER');
    expect(display.statusHelper).toContain('Per-member token allocation available.');
  });

  it('falls back to the effective plan allocation for display when member balances have not been persisted yet', () => {
    const display = buildPlanDisplay({
      subscription: null,
      organizationContext: {
        role: 'MEMBER',
        organization: {
          id: 'org_1',
          name: 'Acme Workspace',
          tokenPoolStrategy: 'SHARED_FOR_ORG',
          tokenBalance: 0,
          memberTokenCap: null,
          memberCapStrategy: 'DISABLED',
          memberCapResetIntervalHours: null,
          ownerUserId: 'owner_1',
          ownerExemptFromCaps: false,
          plan: {
            id: 'plan_1',
            name: 'Team Pro',
            tokenLimit: 100,
            tokenName: 'tokens',
            organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
          },
        },
        membership: {
          id: 'membership_1',
          role: 'MEMBER',
          sharedTokenBalance: 0,
          memberTokenCapOverride: null,
          memberTokenUsage: 2,
          memberTokenUsageWindowStart: null,
        },
        effectivePlan: {
          id: 'plan_1',
          name: 'Team Pro',
          tokenLimit: 100,
          tokenName: 'tokens',
          organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        },
      } as never,
      userTokenBalance: 0,
      userFreeTokenBalance: 0,
      freePlanSettings: { tokenLimit: 5, tokenName: 'tokens', renewalType: 'monthly' } as never,
      defaultTokenLabel: 'tokens',
    });

    expect(display.tokenPoolStrategy).toBe('ALLOCATED_PER_MEMBER');
    expect(display.sharedTokenBalance).toBe(98);
    expect(display.tokenStatValue).toBe('98 allocated');
    expect(display.tokenStatHelper).toContain('Allocated to you by Acme Workspace.');
  });
});