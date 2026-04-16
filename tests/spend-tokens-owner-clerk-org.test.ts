import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const txMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
  },
  organizationMembership: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  organization: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  featureUsageLog: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
}));

const getAuthSafeMock = vi.hoisted(
  () => vi.fn<[], Promise<{ userId: string; orgId: string | null }>>(async () => ({ userId: 'user_1', orgId: 'org_clerk_123' }))
);

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({ getAuthSafe: getAuthSafeMock }));
vi.mock('@/lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24) }));
vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: { API_GENERAL: { limit: 9999, windowMs: 60_000 } },
  withRateLimit: (identifier: unknown, config: unknown) => {
    void identifier;
    void config;
    return async (_req: NextRequest, handler: () => Promise<Response>) => handler();
  },
}));

import { POST } from '../app/api/user/spend-tokens/route';

describe('POST /api/user/spend-tokens owner + Clerk org id resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthSafeMock.mockResolvedValue({ userId: 'user_1', orgId: 'org_clerk_123' });

    txMock.user.findUnique.mockReset();
    txMock.user.updateMany.mockReset();
    txMock.subscription.findFirst.mockReset();
    txMock.organizationMembership.findFirst.mockReset();
    txMock.organizationMembership.updateMany.mockReset();
    txMock.organization.findFirst.mockReset();
    txMock.organization.updateMany.mockReset();
    txMock.organization.findUnique.mockReset();
    txMock.featureUsageLog.create.mockReset();

    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 0 })
      .mockResolvedValueOnce({ tokenBalance: 0, freeTokenBalance: 0 });

    txMock.subscription.findFirst.mockResolvedValue(null);

    txMock.organizationMembership.findFirst.mockResolvedValue(null);

    txMock.organization.findFirst.mockResolvedValue({
      id: 'org_db_1',
      ownerUserId: 'user_1',
      tokenBalance: 100,
    });

    txMock.organization.updateMany.mockResolvedValue({ count: 1 });
    txMock.organization.findUnique.mockResolvedValue({ tokenBalance: 90 });
    txMock.featureUsageLog.create.mockResolvedValue({ id: 'log_1' });
  });

  it('spends from shared pool when active orgId is a Clerk org id and owner has no membership row', async () => {
    txMock.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sub_owner_active_1' });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10, bucket: 'shared', feature: 'test' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.bucket).toBe('shared');
    expect(body.organizationId).toBe('org_db_1');

    expect(txMock.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'user_1',
          OR: expect.arrayContaining([
            { id: 'org_clerk_123' },
            { clerkOrganizationId: 'org_clerk_123' },
          ]),
        }),
      })
    );

    expect(txMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org_db_1', tokenBalance: { gte: 10 } },
      data: { tokenBalance: { decrement: 10 } },
    });

    expect(txMock.organizationMembership.updateMany).not.toHaveBeenCalled();
  });

  it('returns insufficient_tokens for shared bucket when member hard cap is hit', async () => {
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 10 });

    txMock.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sub_owner_1' });

    txMock.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership_1',
      organizationId: 'org_db_1',
      memberTokenCapOverride: 5,
      memberTokenUsageWindowStart: new Date(),
      memberTokenUsage: 5,
      organization: {
        id: 'org_db_1',
        clerkOrganizationId: 'org_clerk_123',
        ownerUserId: 'owner_1',
        tokenBalance: 100,
        memberTokenCap: 10,
        memberCapStrategy: 'HARD',
        memberCapResetIntervalHours: null,
      },
    });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 1, bucket: 'shared', feature: 'hard-cap-test' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      error: 'insufficient_tokens',
      bucket: 'shared',
      required: 1,
      memberCap: 5,
      memberUsage: 5,
      memberRemainingCap: 0,
      capStrategy: 'HARD',
    });

    expect(txMock.organization.updateMany).not.toHaveBeenCalled();
    expect(txMock.organizationMembership.updateMany).not.toHaveBeenCalled();
  });

  it('blocks paid bucket spending after personal plan expiry even when paid tokens remain', async () => {
    getAuthSafeMock.mockResolvedValueOnce({ userId: 'user_1', orgId: null });

    txMock.user.findUnique.mockReset();
    txMock.user.findUnique.mockResolvedValueOnce({ id: 'user_1', tokenBalance: 15, freeTokenBalance: 0 });

    txMock.subscription.findFirst.mockResolvedValueOnce(null);
    txMock.organizationMembership.findFirst.mockResolvedValueOnce(null);
    txMock.organization.findFirst.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 3, bucket: 'paid', feature: 'expired-paid-bucket' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      error: 'paid_subscription_expired',
      bucket: 'paid',
    });
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('blocks owner shared spending when the workspace subscription is expired even if org tokens remain', async () => {
    txMock.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10, bucket: 'shared', feature: 'expired-shared-bucket' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      error: 'owner_subscription_expired',
    });
    expect(txMock.organization.updateMany).not.toHaveBeenCalled();
  });

  it('uses free bucket for auto when paid has no spendable balance', async () => {
    txMock.user.findUnique.mockReset();
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 8 })
      .mockResolvedValueOnce({ tokenBalance: 0, freeTokenBalance: 5 });

    // Simulate an active subscription so auto logic still must prefer available balance.
    txMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_active_1' });

    // Ensure no shared context is available for this scenario.
    txMock.organizationMembership.findFirst.mockResolvedValueOnce(null);
    txMock.organization.findFirst.mockResolvedValueOnce(null);

    txMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 3, bucket: 'auto', feature: 'auto-free-fallback' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      bucket: 'free',
      amount: 3,
      balances: {
        paid: 0,
        free: 5,
      },
    });

    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', freeTokenBalance: { gte: 3 } },
      data: { freeTokenBalance: { decrement: 3 } },
    });
  });

  it('auto prefers free over paid when paid balance is too small to cover the amount', async () => {
    txMock.user.findUnique.mockReset();
    // User has 1 paid token but 50 free tokens. Spend request is for 10.
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 1, freeTokenBalance: 50 })
      .mockResolvedValueOnce({ tokenBalance: 1, freeTokenBalance: 40 });

    // Active subscription exists, so paid would normally be preferred.
    txMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_active_2' });

    // No shared context.
    txMock.organizationMembership.findFirst.mockResolvedValueOnce(null);
    txMock.organization.findFirst.mockResolvedValueOnce(null);

    txMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10, bucket: 'auto', feature: 'auto-skip-insufficient-paid' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      bucket: 'free',
      amount: 10,
    });

    // Should have decremented freeTokenBalance, NOT tokenBalance.
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', freeTokenBalance: { gte: 10 } },
      data: { freeTokenBalance: { decrement: 10 } },
    });
  });

  it('auto uses free in personal context even when user has active team membership', async () => {
    getAuthSafeMock.mockResolvedValueOnce({ userId: 'user_1', orgId: null });

    txMock.user.findUnique.mockReset();
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 12 })
      .mockResolvedValueOnce({ tokenBalance: 0, freeTokenBalance: 7 });

    txMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_active_3' });

    // Membership exists, but without an active org context it must not be used for shared spend.
    txMock.organizationMembership.findFirst.mockResolvedValueOnce({
      id: 'membership_2',
      organizationId: 'org_db_1',
      memberTokenCapOverride: null,
      memberTokenUsageWindowStart: new Date(),
      memberTokenUsage: 0,
      organization: {
        id: 'org_db_1',
        clerkOrganizationId: 'org_clerk_123',
        ownerUserId: 'owner_1',
        tokenBalance: 100,
        memberTokenCap: null,
        memberCapStrategy: 'SOFT',
        memberCapResetIntervalHours: null,
      },
    });

    txMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 5, bucket: 'auto', feature: 'personal-auto-free' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      bucket: 'free',
      amount: 5,
    });

    expect(txMock.organization.updateMany).not.toHaveBeenCalled();
    expect(txMock.organizationMembership.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', freeTokenBalance: { gte: 5 } },
      data: { freeTokenBalance: { decrement: 5 } },
    });
  });

  it('bypasses paid-balance enforcement when the active personal plan is unlimited', async () => {
    txMock.user.findUnique.mockReset();
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 8 })
      .mockResolvedValueOnce({ tokenBalance: 0, freeTokenBalance: 8 });

    txMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_active_unlimited',
      expiresAt: new Date(Date.now() + 60_000),
      plan: { tokenLimit: null, tokenName: 'credits' },
    });

    txMock.organizationMembership.findFirst.mockResolvedValueOnce(null);
    txMock.organization.findFirst.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 3, bucket: 'auto', feature: 'unlimited-paid' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      bucket: 'paid',
      amount: 3,
    });
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('spends from member allocation when the workspace uses ALLOCATED_PER_MEMBER', async () => {
    txMock.user.findUnique.mockReset();
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 0, freeTokenBalance: 0 })
      .mockResolvedValueOnce({ tokenBalance: 0, freeTokenBalance: 0 });

    txMock.subscription.findFirst.mockReset();
    txMock.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sub_owner_1' });

    txMock.organizationMembership.findFirst.mockResolvedValueOnce({
      id: 'membership_alloc_1',
      organizationId: 'org_db_1',
      memberTokenCapOverride: null,
      memberTokenUsageWindowStart: null,
      memberTokenUsage: 0,
      sharedTokenBalance: 25,
      organization: {
        id: 'org_db_1',
        clerkOrganizationId: 'org_clerk_123',
        ownerUserId: 'owner_1',
        tokenBalance: 500,
        tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
        memberTokenCap: 10,
        memberCapStrategy: 'HARD',
        memberCapResetIntervalHours: null,
        ownerExemptFromCaps: false,
        invites: [],
      },
    });

    txMock.organizationMembership.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest('http://localhost/api/user/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 7, bucket: 'shared', feature: 'allocated-shared-spend' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      bucket: 'shared',
      amount: 7,
      organizationId: 'org_db_1',
    });

    expect(txMock.organizationMembership.updateMany).toHaveBeenCalledWith({
      where: { id: 'membership_alloc_1', status: 'ACTIVE', sharedTokenBalance: { gte: 7 } },
      data: { sharedTokenBalance: { decrement: 7 } },
    });
    expect(txMock.organization.updateMany).not.toHaveBeenCalled();
  });
});
