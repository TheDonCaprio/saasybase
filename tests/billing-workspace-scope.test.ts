import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn<[], Promise<{ userId: string; orgId: string | null }>>(async () => ({ userId: 'user_1', orgId: null })),
}));

const cancelSubscriptionMock = vi.hoisted(() => vi.fn(async () => ({ currentPeriodEnd: new Date('2026-05-01T00:00:00.000Z') })));
const undoCancelSubscriptionMock = vi.hoisted(() => vi.fn(async () => ({ id: 'sub_provider_team', cancelAtPeriodEnd: false })));
const getProviderForRecordMock = vi.hoisted(() => vi.fn(() => ({
  cancelSubscription: cancelSubscriptionMock,
  undoCancelSubscription: undoCancelSubscriptionMock,
})));

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({ id: 'sub_team_active' })),
  },
}));

const getOrganizationPlanContextMock = vi.hoisted(() => vi.fn<[], Promise<unknown | null>>(async () => null));
const sendBillingNotificationMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/auth-provider', () => ({ authService: authMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/runtime-guards', async () => {
  const actual = await vi.importActual('../lib/runtime-guards');
  return actual;
});
vi.mock('../lib/payment/service', () => ({ paymentService: { getProviderForRecord: getProviderForRecordMock } }));
vi.mock('../lib/notifications', () => ({ sendBillingNotification: sendBillingNotificationMock }));
vi.mock('../lib/user-plan-context', () => ({
  getOrganizationPlanContext: getOrganizationPlanContextMock,
  getPlanScope: vi.fn((activeOrganizationId?: string | null) => activeOrganizationId ? 'WORKSPACE' : 'PERSONAL'),
  getSubscriptionScopeFilter: vi.fn((scope: 'WORKSPACE' | 'PERSONAL') => (
    scope === 'WORKSPACE'
      ? { plan: { supportsOrganizations: true } }
      : { NOT: { plan: { supportsOrganizations: true } } }
  )),
}));

import { POST as cancelPost } from '../app/api/billing/cancel/route';
import { POST as undoCancelPost } from '../app/api/billing/undo-cancel/route';

describe('billing workspace subscription scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({ userId: 'user_1', orgId: null });
    getOrganizationPlanContextMock.mockResolvedValue({
      role: 'OWNER',
      organization: {
        id: 'org_1',
        ownerUserId: 'owner_1',
      },
    });
  });

  it('cancels the active workspace subscription when an active workspace id is provided', async () => {
    prismaMock.subscription.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === 'owner_1' && where.organizationId === 'org_1') {
        return {
          id: 'sub_team_active',
          userId: 'owner_1',
          organizationId: 'org_1',
          status: 'ACTIVE',
          expiresAt: new Date('2026-05-01T00:00:00.000Z'),
          externalSubscriptionId: 'sub_provider_team',
          paymentProvider: 'stripe',
          plan: { name: 'Team Plan', autoRenew: true },
        };
      }

      return {
        id: 'sub_personal_active',
        userId: 'owner_1',
        organizationId: null,
        status: 'ACTIVE',
        expiresAt: new Date('2999-12-31T23:59:59.000Z'),
        externalSubscriptionId: null,
        paymentProvider: 'stripe',
        plan: { name: 'Lifetime', autoRenew: false },
      };
    });

    const req = new NextRequest('http://localhost/api/billing/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activeOrganizationId: 'org_1' }),
    });

    const res = await cancelPost(req);
    const body = await res.json() as { ok?: boolean; message?: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBe('cancellation_scheduled');
    expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_provider_team', false);
    expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner_1',
        organizationId: 'org_1',
        plan: { supportsOrganizations: true },
      }),
    }));
  });

  it('undoes cancellation for the active workspace subscription when an active workspace id is provided', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({
      id: 'sub_team_active',
      userId: 'owner_1',
      organizationId: 'org_1',
      status: 'ACTIVE',
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
      externalSubscriptionId: 'sub_provider_team',
      paymentProvider: 'stripe',
      cancelAtPeriodEnd: true,
      canceledAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    const req = new NextRequest('http://localhost/api/billing/undo-cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activeOrganizationId: 'org_1' }),
    });

    const res = await undoCancelPost(req);
    const body = await res.json() as { ok?: boolean; message?: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBe('undo_succeeded');
    expect(undoCancelSubscriptionMock).toHaveBeenCalledWith('sub_provider_team');
    expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner_1',
        organizationId: 'org_1',
        plan: { supportsOrganizations: true },
      }),
    }));
  });

  it('rejects workspace cancellation for members', async () => {
    getOrganizationPlanContextMock.mockResolvedValueOnce({
      role: 'MEMBER',
      organization: {
        id: 'org_1',
        ownerUserId: 'owner_1',
      },
    });

    const req = new NextRequest('http://localhost/api/billing/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activeOrganizationId: 'org_1' }),
    });

    const res = await cancelPost(req);
    const body = await res.json() as { code?: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe('WORKSPACE_BILLING_OWNER_REQUIRED');
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });
});