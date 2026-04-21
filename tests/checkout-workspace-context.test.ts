import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findFirst: vi.fn(),
  },
  organizationMembership: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { resolveCheckoutWorkspaceContext } from '../lib/checkout-workspace-context';

describe('resolveCheckoutWorkspaceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findFirst.mockResolvedValue(null);
    prismaMock.organizationMembership.findFirst.mockResolvedValue(null);
  });

  it('returns the canonical provider organization id for an owned workspace', async () => {
    prismaMock.organization.findFirst.mockResolvedValue({
      id: 'org_local_1',
      providerOrganizationId: 'provider_org_1',
    });

    const result = await resolveCheckoutWorkspaceContext('user_1', 'provider_org_1');

    expect(result).toEqual({
      organizationId: 'org_local_1',
      providerOrganizationId: 'provider_org_1',
      role: 'OWNER',
    });
  });

  it('returns the canonical provider organization id for an active membership workspace', async () => {
    prismaMock.organizationMembership.findFirst.mockResolvedValue({
      organization: {
        id: 'org_local_2',
        providerOrganizationId: 'provider_org_2',
      },
    });

    const result = await resolveCheckoutWorkspaceContext('user_2', 'provider_org_2');

    expect(result).toEqual({
      organizationId: 'org_local_2',
      providerOrganizationId: 'provider_org_2',
      role: 'MEMBER',
    });
  });
});