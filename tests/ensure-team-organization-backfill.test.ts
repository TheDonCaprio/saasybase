import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  subscription: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  organization: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn<() => Promise<Record<string, unknown> | undefined>>(async () => undefined),
  },
  organizationMembership: {
    aggregate: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  payment: {
    findFirst: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  $transaction: vi.fn(),
}));

const workspaceServiceMock = vi.hoisted(() => ({
  providerName: 'nextauth',
  usesExternalProviderOrganizations: false,
  usesLocalProviderOrganizations: true,
  createProviderOrganization: vi.fn(async () => ({
    id: 'org_ba_1',
    name: 'Better Auth Workspace',
    slug: 'better-auth-workspace',
  })),
}));

const upsertOrganizationMock = vi.hoisted(() => vi.fn(async () => null));
const syncOrganizationMembershipMock = vi.hoisted(() => vi.fn(async () => null));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/teams', () => ({
  upsertOrganization: upsertOrganizationMock,
  syncOrganizationMembership: syncOrganizationMembershipMock,
}));
vi.mock('../lib/workspace-service', () => ({ workspaceService: workspaceServiceMock }));

import { ensureTeamOrganization } from '../lib/organization-access';

describe('ensureTeamOrganization billing backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceServiceMock.providerName = 'nextauth';
    workspaceServiceMock.usesExternalProviderOrganizations = false;
    workspaceServiceMock.usesLocalProviderOrganizations = true;
    prismaMock.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) => Promise.all(ops));
    prismaMock.user.findUnique.mockResolvedValue({ name: 'Owner', email: 'owner@example.com', tokenBalance: 0 });
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce({
        id: 'sub_active',
        userId: 'user_1',
        plan: { id: 'plan_team', tokenLimit: 100, organizationSeatLimit: 5, supportsOrganizations: true, organizationTokenPoolStrategy: 'SHARED_FOR_ORG' },
      })
      .mockResolvedValueOnce({ id: 'sub_active' });
    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_1',
      ownerUserId: 'user_1',
      planId: 'plan_team',
      seatLimit: 5,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
    });
    prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_active' }]);
    prismaMock.organization.findUnique
      .mockResolvedValueOnce({ id: 'org_1', tokenBalance: 0 })
      .mockResolvedValueOnce({ id: 'org_1' });
    prismaMock.organizationMembership.aggregate.mockResolvedValue({ _sum: { memberTokenUsage: 0 } });
    prismaMock.payment.findFirst.mockResolvedValue({ id: 'pay_1' });
  });

  it('backfills active team subscriptions and payments with the provisioned organization id', async () => {
    await ensureTeamOrganization('user_1');

    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['sub_active'] },
        organizationId: null,
      },
      data: { organizationId: 'org_1' },
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        subscriptionId: { in: ['sub_active'] },
        organizationId: null,
      },
      data: { organizationId: 'org_1' },
    });
  });

  it('rejects provisioning when the user no longer has an active team subscription', async () => {
    prismaMock.subscription.findFirst.mockReset();
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    await expect(ensureTeamOrganization('user_1')).rejects.toThrow(
      'Team plan required to provision an organization'
    );

    expect(prismaMock.organization.findFirst).not.toHaveBeenCalled();
  });

  it('preserves allocated-per-member strategy and reconciles member balances instead of the org pool', async () => {
    prismaMock.subscription.findFirst.mockReset();
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce({
        id: 'sub_active',
        userId: 'user_1',
        plan: {
          id: 'plan_team_alloc',
          tokenLimit: 120,
          organizationSeatLimit: 5,
          supportsOrganizations: true,
          organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        },
      })
      .mockResolvedValueOnce({ id: 'sub_active' });
    prismaMock.organization.findFirst.mockResolvedValueOnce({
      id: 'org_1',
      ownerUserId: 'user_1',
      planId: 'plan_team_alloc_old',
      seatLimit: 4,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
    });
    prismaMock.organization.findUnique
      .mockResolvedValueOnce({ id: 'org_1', tokenBalance: 0 })
      .mockResolvedValueOnce({ id: 'org_1' });

    await ensureTeamOrganization('user_1');

    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: {
        planId: 'plan_team_alloc',
        seatLimit: 5,
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      },
    });
    expect(prismaMock.organizationMembership.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', status: 'ACTIVE' },
      data: { sharedTokenBalance: 120 },
    });
  });

  it('treats Better Auth workspace provisioning as a local provider-backed organization flow', async () => {
    workspaceServiceMock.providerName = 'betterauth';
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.organization.update.mockResolvedValueOnce({
      id: 'org_ba_1',
      planId: 'plan_team',
      seatLimit: 5,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      tokenBalance: 0,
    });
    prismaMock.organization.findUnique.mockResolvedValueOnce({ id: 'org_ba_1', tokenBalance: 100 });

    await ensureTeamOrganization('user_1');

    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_ba_1' },
      data: {
        planId: 'plan_team',
        seatLimit: 5,
        tokenPoolStrategy: 'SHARED_FOR_ORG',
        tokenBalance: 0,
      },
    });
    expect(syncOrganizationMembershipMock).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_ba_1',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(upsertOrganizationMock).not.toHaveBeenCalled();
  });
});