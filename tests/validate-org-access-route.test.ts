import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserMock = vi.hoisted(() => vi.fn());
const getGraceHoursMock = vi.hoisted(() => vi.fn());
const getOrganizationExpiryModeMock = vi.hoisted(() => vi.fn());
const deactivateOrganizationsByIdsMock = vi.hoisted(() => vi.fn());
const supportsFeatureMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  organizationMembership: {
    findMany: vi.fn(),
  },
  subscription: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  requireUser: requireUserMock,
}));

vi.mock('../lib/auth-provider', () => ({
  authService: {
    supportsFeature: supportsFeatureMock,
    getOrganization: getOrganizationMock,
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../lib/organization-access', () => ({
  deactivateOrganizationsByIds: deactivateOrganizationsByIdsMock,
}));

vi.mock('../lib/settings', () => ({
  getPaidTokensNaturalExpiryGraceHours: getGraceHoursMock,
  getOrganizationExpiryMode: getOrganizationExpiryModeMock,
}));

import { POST } from '../app/api/user/validate-org-access/route';

describe('POST /api/user/validate-org-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue('user_1');
    getGraceHoursMock.mockResolvedValue(24);
    getOrganizationExpiryModeMock.mockResolvedValue('SUSPEND');
    supportsFeatureMock.mockReturnValue(false);
    getOrganizationMock.mockResolvedValue(null);
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.subscription.findFirst.mockResolvedValue(null);
  });

  it('asks the client to clear a stale active org when membership is already gone', async () => {
    prismaMock.organizationMembership.findMany.mockResolvedValue([]);

    const response = await POST(new Request('http://localhost/api/user/validate-org-access', {
      method: 'POST',
      body: JSON.stringify({ activeOrgId: 'org_deleted' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      valid: true,
      reason: 'no_org',
      clearActiveOrg: true,
      activeOrgReason: 'active_org_membership_missing',
    });
  });

  it('asks the client to clear a stale Clerk org when the provider organization no longer exists', async () => {
    supportsFeatureMock.mockReturnValue(true);
    prismaMock.organizationMembership.findMany.mockResolvedValue([
      {
        organization: {
          id: 'org_local_1',
          providerOrganizationId: 'org_clerk_missing',
          ownerUserId: 'owner_1',
        },
      },
    ]);
    prismaMock.subscription.findMany.mockResolvedValue([
      { userId: 'owner_1' },
    ]);
    getOrganizationMock.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/user/validate-org-access', {
      method: 'POST',
      body: JSON.stringify({ activeOrgId: 'org_clerk_missing' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      valid: true,
      reason: 'has_valid_owner',
      clearActiveOrg: true,
      activeOrgReason: 'active_org_provider_missing',
    });
    expect(getOrganizationMock).toHaveBeenCalledWith('org_clerk_missing');
  });

  it('uses suspend mode for expiry-driven organization cleanup by default', async () => {
    prismaMock.organizationMembership.findMany.mockResolvedValue([
      {
        organization: {
          id: 'org_local_1',
          providerOrganizationId: 'org_provider_1',
          ownerUserId: 'owner_1',
        },
      },
    ]);
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.subscription.findFirst.mockResolvedValue({
      expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const response = await POST(new Request('http://localhost/api/user/validate-org-access', {
      method: 'POST',
      body: JSON.stringify({ activeOrgId: 'org_provider_1' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ valid: false, reason: 'org_expired' });
    expect(deactivateOrganizationsByIdsMock).toHaveBeenCalledWith(
      ['org_local_1'],
      expect.objectContaining({
        mode: 'SUSPEND',
        reason: 'validate-org-access',
        userId: 'user_1',
        useExpiryTokenResetPolicy: true,
      })
    );
  });
});