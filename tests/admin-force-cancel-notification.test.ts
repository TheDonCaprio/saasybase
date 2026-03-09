import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN' })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const adminRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 59, reset: Date.now() + 60_000 })));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const shouldClearPaidTokensOnExpiryMock = vi.hoisted(() => vi.fn(async () => true));
const sendBillingNotificationMock = vi.hoisted(() => vi.fn(async () => ({ notificationCreated: true, emailSent: true })));
const syncOrganizationEligibilityForUserMock = vi.hoisted(() => vi.fn(async () => ({ allowed: false, reason: 'NO_PLAN' })));
const resetOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const cancelSubscriptionMock = vi.hoisted(() => vi.fn(async () => ({ currentPeriodEnd: null })));

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findUnique: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  plan: {
    findUnique: vi.fn(),
  },
  user: {
    update: vi.fn(async () => undefined),
  },
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
vi.mock('../lib/rateLimit', () => ({ adminRateLimit: adminRateLimitMock }));
vi.mock('../lib/paidTokens', () => ({ shouldClearPaidTokensOnExpiry: shouldClearPaidTokensOnExpiryMock }));
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    provider: { name: 'stripe' },
    getProviderForRecord: vi.fn(() => ({ cancelSubscription: cancelSubscriptionMock })),
  },
}));
vi.mock('../lib/teams', () => ({ resetOrganizationSharedTokens: resetOrganizationSharedTokensMock }));
vi.mock('../lib/organization-access', () => ({ syncOrganizationEligibilityForUser: syncOrganizationEligibilityForUserMock }));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: sendBillingNotificationMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST } from '../app/api/admin/subscriptions/[id]/force-cancel/route';

describe('admin force-cancel notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      userId: 'user_1',
      planId: 'plan_team',
      organizationId: 'org_1',
      paymentProvider: 'stripe',
      externalSubscriptionId: 'sub_ext_1',
    });
    prismaMock.plan.findUnique.mockResolvedValue({
      name: 'Team Plan',
      supportsOrganizations: true,
    });
  });

  it('sends a billing notification after admin force-cancel', async () => {
    const req = new NextRequest('http://localhost/api/admin/subscriptions/sub_1/force-cancel', {
      method: 'POST',
      body: JSON.stringify({ clearPaidTokens: true }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'sub_1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(sendBillingNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        title: 'Subscription Cancelled',
        templateKey: 'subscription_cancelled',
      })
    );
    expect(syncOrganizationEligibilityForUserMock).toHaveBeenCalledWith('user_1', { ignoreGrace: true });
    expect(resetOrganizationSharedTokensMock).toHaveBeenCalledWith({ organizationId: 'org_1' });
  });
});
