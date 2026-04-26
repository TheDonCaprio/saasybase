import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/runtime-guards', () => ({ toError: vi.fn((error: unknown) => error instanceof Error ? error : new Error(String(error)))}));
vi.mock('../lib/workspace-service', () => ({ workspaceService: {} }));

import { upsertOrganization } from '../lib/teams';

describe('upsertOrganization token pool strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves an existing organization strategy when the snapshot does not provide one', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org_1', tokenPoolStrategy: 'ALLOCATED_PER_MEMBER' });
    prismaMock.organization.update.mockResolvedValue({ id: 'org_1', tokenPoolStrategy: 'ALLOCATED_PER_MEMBER' });

    await upsertOrganization({
      providerOrganizationId: 'provider_org_1',
      name: 'Updated Org',
    });

    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: {
        name: 'Updated Org',
        suspendedAt: null,
        suspensionReason: null,
      },
    });
  });

  it('persists a valid snapshot strategy instead of forcing the shared default', async () => {
    prismaMock.organization.findUnique.mockImplementation(async ({ where }: { where: { providerOrganizationId?: string; slug?: string } }) => {
      if (where.providerOrganizationId) return null;
      if (where.slug) return null;
      return null;
    });
    prismaMock.organization.create.mockResolvedValue({ id: 'org_2', tokenPoolStrategy: 'ALLOCATED_PER_MEMBER' });

    await upsertOrganization({
      providerOrganizationId: 'provider_org_2',
      name: 'New Org',
      slug: 'new-org',
      ownerUserId: 'user_1',
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
    });

    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerOrganizationId: 'provider_org_2',
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      }),
    });
  });

  it('allocates a unique local slug when the requested slug is already taken', async () => {
    prismaMock.organization.findUnique.mockImplementation(async ({ where }: { where: { providerOrganizationId?: string; slug?: string } }) => {
      if (where.providerOrganizationId) return null;
      if (where.slug === 'new-org') return { id: 'org_existing_slug' };
      if (where.slug === 'new-org-1') return null;
      return null;
    });
    prismaMock.organization.create.mockResolvedValue({ id: 'org_3', slug: 'new-org-1' });

    await upsertOrganization({
      providerOrganizationId: 'provider_org_3',
      name: 'New Org',
      slug: 'new-org',
      ownerUserId: 'user_1',
    });

    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerOrganizationId: 'provider_org_3',
        slug: 'new-org-1',
      }),
    });
  });
});