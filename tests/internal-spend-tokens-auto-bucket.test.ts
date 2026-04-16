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

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/settings', () => ({ getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24) }));

import { POST } from '../app/api/internal/spend-tokens/route';

describe('POST /api/internal/spend-tokens auto bucket selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    txMock.user.findUnique.mockReset();
    txMock.user.updateMany.mockReset();
    txMock.subscription.findFirst.mockReset();
    txMock.organizationMembership.findFirst.mockReset();
    txMock.organizationMembership.updateMany.mockReset();
    txMock.organization.updateMany.mockReset();
    txMock.organization.findUnique.mockReset();
    txMock.featureUsageLog.create.mockReset();

    txMock.featureUsageLog.create.mockResolvedValue({ id: 'log_1' });
  });

  it('uses shared only in organization context even when paid and free balances exist', async () => {
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 25, freeTokenBalance: 40 })
      .mockResolvedValueOnce({ tokenBalance: 25, freeTokenBalance: 40 });

    txMock.subscription.findFirst
      .mockResolvedValueOnce({ id: 'sub_active_personal_1' })
      .mockResolvedValueOnce({ id: 'sub_owner_1' });

    txMock.organizationMembership.findFirst.mockResolvedValueOnce({
      id: 'membership_shared_1',
      organizationId: 'org_db_1',
      memberTokenCapOverride: null,
      memberTokenUsageWindowStart: null,
      memberTokenUsage: 0,
      sharedTokenBalance: 0,
      organization: {
        id: 'org_db_1',
        ownerUserId: 'owner_1',
        tokenBalance: 100,
        tokenPoolStrategy: 'SHARED_FOR_ORG',
        memberTokenCap: null,
        memberCapStrategy: 'SOFT',
        memberCapResetIntervalHours: null,
        ownerExemptFromCaps: false,
      },
    });

    txMock.organization.updateMany.mockResolvedValueOnce({ count: 1 });
    txMock.organizationMembership.updateMany.mockResolvedValueOnce({ count: 1 });
    txMock.organization.findUnique.mockResolvedValueOnce({ tokenBalance: 90 });

    const req = new NextRequest('http://localhost/api/internal/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-API': 'true' },
      body: JSON.stringify({ userId: 'user_1', amount: 10, bucket: 'auto', organizationId: 'org_db_1', feature: 'internal-org-auto' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, bucket: 'shared', amount: 10, organizationId: 'org_db_1' });
    expect(txMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org_db_1', tokenBalance: { gte: 10 } },
      data: { tokenBalance: { decrement: 10 } },
    });
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('uses paid then free in personal context and never shared', async () => {
    txMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', tokenBalance: 1, freeTokenBalance: 50 })
      .mockResolvedValueOnce({ tokenBalance: 1, freeTokenBalance: 40 });

    txMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_active_personal_2' });
    txMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest('http://localhost/api/internal/spend-tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-API': 'true' },
      body: JSON.stringify({ userId: 'user_1', amount: 10, bucket: 'auto', feature: 'internal-personal-auto' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, bucket: 'free', amount: 10 });
    expect(txMock.organizationMembership.findFirst).not.toHaveBeenCalled();
    expect(txMock.organization.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', freeTokenBalance: { gte: 10 } },
      data: { freeTokenBalance: { decrement: 10 } },
    });
  });
});