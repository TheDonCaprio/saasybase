import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
  },
}));

const workspaceServiceMock = vi.hoisted(() => ({
  updateProviderOrganization: vi.fn(async () => undefined),
}));

const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/workspace-service', () => ({ workspaceService: workspaceServiceMock }));
vi.mock('../lib/logger', () => ({ Logger: { warn: loggerWarnMock } }));

import { syncOrganizationBillingMetadata } from '../lib/organization-billing-metadata';

describe('syncOrganizationBillingMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      providerOrganizationId: 'provider_org_1',
      planId: 'plan_old',
      seatLimit: 5,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
    });
  });

  it('updates provider billing metadata using the canonical provider organization id', async () => {
    await syncOrganizationBillingMetadata({
      organizationId: 'org_1',
      planId: 'plan_new',
      seatLimit: 10,
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
    });

    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: {
        planId: 'plan_new',
        seatLimit: 10,
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      },
    });
    expect(workspaceServiceMock.updateProviderOrganization).toHaveBeenCalledWith('provider_org_1', {
      maxAllowedMemberships: 10,
      publicMetadata: {
        planId: 'plan_new',
        seatLimit: 10,
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      },
    });
  });

  it('skips provider sync when the local organization has no backing provider org id', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      id: 'org_1',
      providerOrganizationId: null,
      planId: 'plan_old',
      seatLimit: 5,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
    });

    await syncOrganizationBillingMetadata({
      organizationId: 'org_1',
      planId: 'plan_new',
      seatLimit: 10,
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
    });

    expect(prismaMock.organization.update).toHaveBeenCalled();
    expect(workspaceServiceMock.updateProviderOrganization).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});