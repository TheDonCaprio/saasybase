import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteOrganizationMock = vi.hoisted(() => vi.fn(async () => undefined));

const authServiceMock = vi.hoisted(() => ({
  providerName: 'nextauth',
  deleteOrganization: deleteOrganizationMock,
}));

const prismaMock = vi.hoisted(() => ({
  organization: {
    findMany: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  subscription: {
    findFirst: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  payment: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  organizationMembership: {
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  organizationInvite: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/settings', () => ({
  getOrganizationExpiryMode: vi.fn(async () => 'SUSPEND'),
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
  shouldResetPaidTokensOnExpiryForPlanAutoRenew: vi.fn(async (autoRenew?: boolean | null) => autoRenew === true),
}));

import { deactivateOrganizationsByIds } from '../lib/organization-access';

describe('organization teardown by provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findMany.mockResolvedValue([
      { id: 'org_1', clerkOrganizationId: 'provider_org_1', ownerUserId: 'user_1' },
    ]);
    prismaMock.subscription.findFirst.mockResolvedValue(null);
  });

  it('skips provider deletion for NextAuth and tears down local records directly', async () => {
    authServiceMock.providerName = 'nextauth';

    await deactivateOrganizationsByIds(['org_1'], { userId: 'user_1', reason: 'test' });

    expect(deleteOrganizationMock).not.toHaveBeenCalled();
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { organizationId: { in: ['org_1'] } },
      data: { organizationId: null },
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { organizationId: { in: ['org_1'] } },
      data: { organizationId: null },
    });
    expect(prismaMock.organizationMembership.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: { in: ['org_1'] } },
    });
    expect(prismaMock.organizationInvite.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: { in: ['org_1'] } },
    });
    expect(prismaMock.organization.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['org_1'] } } });
  });

  it('deletes provider-backed orgs for Clerk before local teardown', async () => {
    authServiceMock.providerName = 'clerk';

    await deactivateOrganizationsByIds(['org_1'], { userId: 'user_1', reason: 'test' });

    expect(deleteOrganizationMock).toHaveBeenCalledWith('provider_org_1');
    expect(prismaMock.organization.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['org_1'] } } });
  });

  it('keeps org tokens on expiry-driven suspension when the one-time expiry reset setting is disabled', async () => {
    authServiceMock.providerName = 'clerk';
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce({ plan: { autoRenew: false } })
      .mockResolvedValueOnce(null);

    await deactivateOrganizationsByIds(['org_1'], {
      userId: 'user_1',
      reason: 'validate-org-access',
      mode: 'SUSPEND',
      useExpiryTokenResetPolicy: true,
    });

    expect(deleteOrganizationMock).toHaveBeenCalledWith('provider_org_1');
    expect(prismaMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org_1'] } },
      data: {
        clerkOrganizationId: null,
        suspendedAt: expect.any(Date),
        suspensionReason: 'validate-org-access',
      },
    });
    expect(prismaMock.organization.updateMany).not.toHaveBeenCalledWith({
      where: { id: { in: ['org_1'] } },
      data: { tokenBalance: 0 },
    });
  });

  it('zeros org tokens on expiry-driven suspension when the recurring expiry reset setting is enabled', async () => {
    authServiceMock.providerName = 'clerk';
    prismaMock.subscription.findFirst.mockResolvedValueOnce({ plan: { autoRenew: true } });

    await deactivateOrganizationsByIds(['org_1'], {
      userId: 'user_1',
      reason: 'validate-org-access',
      mode: 'SUSPEND',
      useExpiryTokenResetPolicy: true,
    });

    expect(prismaMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org_1'] } },
      data: {
        clerkOrganizationId: null,
        suspendedAt: expect.any(Date),
        suspensionReason: 'validate-org-access',
      },
    });
    expect(prismaMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org_1'] } },
      data: { tokenBalance: 0 },
    });
  });
});
