import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

const syncOrganizationEligibilityForUserMock = vi.hoisted(() => vi.fn(async () => undefined));
const getOrganizationPlanContextMock = vi.hoisted(() => vi.fn(async () => null));

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
  });

  it('keeps provisional Paystack switch-now subscriptions visible after refresh', async () => {
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
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
});