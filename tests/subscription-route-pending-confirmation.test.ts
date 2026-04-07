import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

const syncOrganizationEligibilityForUserMock = vi.hoisted(() => vi.fn(async () => undefined));
const getOrganizationPlanContextMock = vi.hoisted(() => vi.fn<[], Promise<unknown | null>>(async () => null));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth', () => ({
  getAuthSafe: vi.fn(async () => ({ userId: 'user_1', orgId: 'org_1' })),
}));
vi.mock('../lib/organization-access', () => ({
  syncOrganizationEligibilityForUser: syncOrganizationEligibilityForUserMock,
}));
vi.mock('../lib/user-plan-context', () => ({
  getOrganizationPlanContext: getOrganizationPlanContextMock,
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from '../app/api/subscription/route';

describe('GET /api/subscription pending confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.subscription.findMany.mockResolvedValue([]);
  });

  it('keeps provisional Paystack switch-now subscriptions visible after refresh', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_pending_1',
      status: 'PENDING',
      startedAt: new Date('2026-03-17T11:45:00.000Z'),
      expiresAt: new Date('2026-03-18T11:45:00.000Z'),
      prorationPendingSince: new Date('2026-03-17T11:45:00.000Z'),
      plan: {
        name: '24 Hour Team Pro',
        autoRenew: true,
        supportsOrganizations: true,
      },
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.active).toBe(false);
    expect(body.pending).toEqual({
      id: 'sub_pending_1',
      plan: '24 Hour Team Pro',
      planAutoRenew: true,
      planSupportsOrganizations: true,
      pendingConfirmation: true,
      startsAt: new Date('2026-03-17T11:45:00.000Z').toISOString(),
      expiresAt: new Date('2026-03-18T11:45:00.000Z').toISOString(),
      pendingSince: new Date('2026-03-17T11:45:00.000Z').toISOString(),
    });
  });

  it('returns the organization token pool strategy from the active workspace context', async () => {
    getOrganizationPlanContextMock.mockResolvedValueOnce({
      role: 'OWNER',
      organization: {
        id: 'org_1',
        name: 'Acme Team',
        tokenBalance: 0,
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        plan: {
          name: 'Team Pro',
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        },
      },
    });
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.active).toBe(true);
    expect(body.source).toBe('organization');
    expect(body.organization).toEqual({
      id: 'org_1',
      name: 'Acme Team',
      role: 'OWNER',
      tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
      tokenBalance: 0,
    });
  });
});