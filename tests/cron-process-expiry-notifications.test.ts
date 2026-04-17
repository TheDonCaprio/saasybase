import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const maybeClearPaidTokensAfterNaturalExpiryGraceMock = vi.hoisted(() => vi.fn(async () => ({ cleared: false, reason: 'none' })));
const deactivateUserOrganizationsMock = vi.hoisted(() => vi.fn(async () => undefined));
const notifyExpiredSubscriptionsMock = vi.hoisted(() => vi.fn(async () => undefined));

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/rateLimit', () => ({ rateLimit: rateLimitMock, getClientIP: getClientIPMock }));
vi.mock('../lib/settings', () => ({
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
  getOrganizationExpiryMode: vi.fn(async () => 'SUSPEND'),
}));
vi.mock('../lib/paidTokenCleanup', () => ({
  maybeClearPaidTokensAfterNaturalExpiryGrace: maybeClearPaidTokensAfterNaturalExpiryGraceMock,
}));
vi.mock('../lib/organization-access', () => ({
  deactivateUserOrganizations: deactivateUserOrganizationsMock,
}));
vi.mock('../lib/notifications', () => ({
  notifyExpiredSubscriptions: notifyExpiredSubscriptionsMock,
}));

import { GET } from '../app/api/cron/process-expiry/route';

describe('cron process-expiry notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.subscription.findMany.mockReset();
    prismaMock.subscription.updateMany.mockReset();
    prismaMock.subscription.findFirst.mockReset();
    prismaMock.organization.findMany.mockReset();

    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.organization.findMany.mockResolvedValue([]);
  });

  it('notifies users when active subscriptions are auto-expired by cron', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([{ id: 'sub_1' }])
      .mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/cron/process-expiry', {
      method: 'GET',
      headers: { 'X-Internal-API': 'true' },
    });

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(notifyExpiredSubscriptionsMock).toHaveBeenCalledWith(['sub_1']);
  });
});