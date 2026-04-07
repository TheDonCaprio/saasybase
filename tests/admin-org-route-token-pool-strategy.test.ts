import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/route-guards', () => ({
  requireAdminSectionAccess: vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN' })),
}));
vi.mock('../lib/rateLimit', () => ({
  adminRateLimit: vi.fn(async () => ({
    success: true,
    allowed: true,
    remaining: 100,
    reset: Date.now() + 60_000,
    error: null,
  })),
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/runtime-guards', () => ({
  asRecord: vi.fn((value: unknown) => value as Record<string, unknown>),
  toError: vi.fn((error: unknown) => error instanceof Error ? error : new Error(String(error))),
}));
vi.mock('../lib/admin-actions', () => ({
  recordAdminAction: recordAdminActionMock,
}));

import { PATCH } from '../app/api/admin/organizations/[orgId]/route';

describe('PATCH /api/admin/organizations/[orgId] token pool strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findUnique.mockResolvedValue({ id: 'org_1', tokenPoolStrategy: 'SHARED_FOR_ORG' });
  });

  it('rejects invalid token pool strategies', async () => {
    const request = new NextRequest('http://localhost/api/admin/organizations/org_1', {
      method: 'PATCH',
      body: JSON.stringify({ tokenPoolStrategy: 'not-valid' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ orgId: 'org_1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid token pool strategy');
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('blocks live token pool strategy flips on existing organizations', async () => {
    const request = new NextRequest('http://localhost/api/admin/organizations/org_1', {
      method: 'PATCH',
      body: JSON.stringify({ tokenPoolStrategy: 'ALLOCATED_PER_MEMBER' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ orgId: 'org_1' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Token pool strategy cannot be changed on an existing organization');
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it('accepts no-op strategy values while applying other changes', async () => {
    prismaMock.organization.update.mockResolvedValue({
      id: 'org_1',
      name: 'Renamed Org',
      slug: 'org-1',
      billingEmail: null,
      plan: null,
      owner: null,
      tokenBalance: 0,
      memberTokenCap: null,
      memberCapStrategy: 'SOFT',
      memberCapResetIntervalHours: null,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      seatLimit: null,
      ownerExemptFromCaps: false,
      memberships: [],
      invites: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const request = new NextRequest('http://localhost/api/admin/organizations/org_1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Org', tokenPoolStrategy: 'SHARED_FOR_ORG' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ orgId: 'org_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { name: 'Renamed Org' },
      include: expect.any(Object),
    });
    expect(recordAdminActionMock).toHaveBeenCalledWith(expect.objectContaining({
      details: { orgId: 'org_1', changes: { name: 'Renamed Org' } },
    }));
    expect(body.success).toBe(true);
  });
});