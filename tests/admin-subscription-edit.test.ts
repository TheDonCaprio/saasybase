import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN' })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const adminRateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 59, reset: Date.now() + 60_000 })));
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const syncOrganizationEligibilityForUserMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true })));
const getSubscriptionMock = vi.hoisted(() => vi.fn());
const undoCancelSubscriptionMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
vi.mock('../lib/rateLimit', () => ({ adminRateLimit: adminRateLimitMock }));
vi.mock('../lib/organization-access', () => ({ syncOrganizationEligibilityForUser: syncOrganizationEligibilityForUserMock }));
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    getProviderForRecord: vi.fn(() => ({
      name: 'stripe',
      getSubscription: getSubscriptionMock,
      undoCancelSubscription: undoCancelSubscriptionMock,
    })),
  },
}));
vi.mock('../lib/payment/subscription-webhook-state', () => ({
  isProviderSubscriptionActiveStatus: (status: string) => status === 'active' || status === 'trialing',
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST } from '../app/api/admin/subscriptions/[id]/edit/route';

describe('admin subscription edit route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    vi.clearAllMocks();
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      userId: 'user_1',
      status: 'EXPIRED',
      expiresAt: new Date('2026-03-01T00:00:00.000Z'),
      canceledAt: new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
      externalSubscriptionId: 'sub_ext_1',
      paymentProvider: 'stripe',
      plan: {
        id: 'plan_1',
        name: 'Pro',
        autoRenew: true,
      },
    });
    prismaMock.subscription.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      userId: 'user_1',
      status: data.status ?? 'EXPIRED',
      expiresAt: data.expiresAt ?? new Date('2026-03-01T00:00:00.000Z'),
      canceledAt: Object.prototype.hasOwnProperty.call(data, 'canceledAt') ? data.canceledAt ?? null : new Date('2026-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? true,
    }));
    getSubscriptionMock.mockResolvedValue({
      id: 'sub_ext_1',
      status: 'active',
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    undoCancelSubscriptionMock.mockResolvedValue({
      id: 'sub_ext_1',
      status: 'active',
      canceledAt: null,
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reactivates a provider-backed subscription and clears scheduled cancellation', async () => {
    const req = new NextRequest('http://localhost/api/admin/subscriptions/sub_1/edit', {
      method: 'POST',
      body: JSON.stringify({
        status: 'ACTIVE',
        expiresAt: '2026-04-01T00:00:00.000Z',
        clearScheduledCancellation: true,
        allowLocalOverride: false,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'sub_1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(undoCancelSubscriptionMock).toHaveBeenCalledWith('sub_ext_1');
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        canceledAt: null,
      }),
    }));
  });

  it('rejects billing date changes that drift from the provider without a local override', async () => {
    const req = new NextRequest('http://localhost/api/admin/subscriptions/sub_1/edit', {
      method: 'POST',
      body: JSON.stringify({
        status: 'ACTIVE',
        expiresAt: '2026-05-01T00:00:00.000Z',
        clearScheduledCancellation: false,
        allowLocalOverride: false,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'sub_1' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('differs from stripe');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('allows a local override when the requested billing date differs from the provider', async () => {
    const req = new NextRequest('http://localhost/api/admin/subscriptions/sub_1/edit', {
      method: 'POST',
      body: JSON.stringify({
        status: 'ACTIVE',
        expiresAt: '2026-05-01T00:00:00.000Z',
        clearScheduledCancellation: false,
        allowLocalOverride: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'sub_1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warning).toContain('local billing date');
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'ACTIVE',
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
    }));
  });

  it('rejects reactivation when the provider reports the subscription as terminal', async () => {
    getSubscriptionMock.mockResolvedValueOnce({
      id: 'sub_ext_1',
      status: 'canceled',
      currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      canceledAt: new Date('2026-03-15T00:00:00.000Z'),
    });

    const req = new NextRequest('http://localhost/api/admin/subscriptions/sub_1/edit', {
      method: 'POST',
      body: JSON.stringify({
        status: 'ACTIVE',
        expiresAt: '2026-04-15T00:00:00.000Z',
        clearScheduledCancellation: false,
        allowLocalOverride: true,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'sub_1' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('terminal');
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });
});