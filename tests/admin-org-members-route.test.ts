import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

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

import { GET } from '../app/api/admin/organizations/[orgId]/members/route';

describe('GET /api/admin/organizations/[orgId]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns persisted membership balances for allocated-per-member organizations', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme Workspace',
      tokenBalance: 0,
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      plan: null,
      memberTokenCap: 100,
      memberCapStrategy: 'HARD',
      memberCapResetIntervalHours: null,
      memberships: [
        {
          id: 'membership_1',
          userId: 'user_1',
          role: 'MEMBER',
          status: 'ACTIVE',
          sharedTokenBalance: 73,
          memberTokenCapOverride: null,
          memberTokenUsage: 8,
          memberTokenUsageWindowStart: null,
          user: { id: 'user_1', name: 'Test User', email: 'test@example.com', role: 'USER' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
      invites: [],
    });

    const response = await GET(new NextRequest('http://localhost/api/admin/organizations/org_1/members'), {
      params: Promise.resolve({ orgId: 'org_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organization).toEqual({
      id: 'org_1',
      name: 'Acme Workspace',
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
    });
    expect(body.members).toEqual([
      expect.objectContaining({
        userId: 'user_1',
        sharedTokenBalance: 73,
        memberTokenUsage: 8,
      }),
    ]);
  });

  it('prefers the attached plan strategy and falls back to the plan token allocation when the org row is stale', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Acme Workspace',
      tokenBalance: 2126,
      tokenPoolStrategy: 'SHARED_FOR_ORG',
      plan: {
        tokenLimit: 120,
        organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      },
      memberTokenCap: 100,
      memberCapStrategy: 'HARD',
      memberCapResetIntervalHours: null,
      memberships: [
        {
          id: 'membership_1',
          userId: 'user_1',
          role: 'ADMIN',
          status: 'ACTIVE',
          sharedTokenBalance: 0,
          memberTokenCapOverride: null,
          memberTokenUsage: 6,
          memberTokenUsageWindowStart: null,
          user: { id: 'user_1', name: 'Admin User', email: 'admin@example.com', role: 'USER' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          id: 'membership_2',
          userId: 'user_2',
          role: 'MEMBER',
          status: 'ACTIVE',
          sharedTokenBalance: 0,
          memberTokenCapOverride: null,
          memberTokenUsage: 18,
          memberTokenUsageWindowStart: null,
          user: { id: 'user_2', name: 'Second User', email: 'member@example.com', role: 'USER' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
      invites: [],
    });

    const response = await GET(new NextRequest('http://localhost/api/admin/organizations/org_1/members'), {
      params: Promise.resolve({ orgId: 'org_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organization.tokenPoolStrategy).toBe('ALLOCATED_PER_MEMBER');
    expect(body.members).toEqual([
      expect.objectContaining({ userId: 'user_1', sharedTokenBalance: 114 }),
      expect.objectContaining({ userId: 'user_2', sharedTokenBalance: 102 }),
    ]);
  });
});