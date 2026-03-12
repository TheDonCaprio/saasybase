import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN' })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const adminRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 59, reset: Date.now() + 60_000 })));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const shouldClearPaidTokensOnExpiryMock = vi.hoisted(() => vi.fn(async () => true));
const syncOrganizationEligibilityForUserMock = vi.hoisted(() => vi.fn(async () => ({ allowed: false, reason: 'NO_PLAN' })));
const resetOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));

const prismaMock = vi.hoisted(() => ({
  payment: {
    findUnique: vi.fn(),
  },
  subscription: {
    update: vi.fn(async () => undefined),
  },
  user: {
    update: vi.fn(async () => undefined),
  },
  plan: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
vi.mock('../lib/paidTokens', () => ({ shouldClearPaidTokensOnExpiry: shouldClearPaidTokensOnExpiryMock }));
vi.mock('../lib/rateLimit', () => ({ adminRateLimit: adminRateLimitMock }));
vi.mock('../lib/organization-access', () => ({ syncOrganizationEligibilityForUser: syncOrganizationEligibilityForUserMock }));
vi.mock('../lib/teams', () => ({ resetOrganizationSharedTokens: resetOrganizationSharedTokensMock }));

import { POST } from '../app/api/admin/purchases/[id]/expire/route';

describe('admin purchase expire cleanup order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.payment.findUnique.mockResolvedValue({
      id: 'pay_1',
      userId: 'user_1',
      subscriptionId: 'sub_1',
      subscription: {
        id: 'sub_1',
        userId: 'user_1',
        planId: 'plan_team',
        organizationId: 'org_1',
        status: 'ACTIVE',
      },
      user: { id: 'user_1' },
    });
    prismaMock.plan.findUnique.mockResolvedValue({ supportsOrganizations: true });
  });

  it('resets org tokens before syncing organization eligibility', async () => {
    const req = new NextRequest('http://localhost/api/admin/purchases/pay_1/expire', {
      method: 'POST',
      body: JSON.stringify({ clearPaidTokens: true }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'pay_1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(resetOrganizationSharedTokensMock).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(syncOrganizationEligibilityForUserMock).toHaveBeenCalledWith('user_1', { ignoreGrace: true });
    expect(resetOrganizationSharedTokensMock.mock.invocationCallOrder[0]).toBeLessThan(
      syncOrganizationEligibilityForUserMock.mock.invocationCallOrder[0]
    );
  });
});