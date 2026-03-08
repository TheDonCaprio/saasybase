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
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  payment: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  organizationMembership: {
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  organizationInvite: {
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { deactivateOrganizationsByIds } from '../lib/organization-access';

describe('organization teardown by provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findMany.mockResolvedValue([
      { id: 'org_1', clerkOrganizationId: 'provider_org_1', ownerUserId: 'user_1' },
    ]);
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
});
