import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/auth', () => ({
  requireAdmin: vi.fn(async () => 'admin_1'),
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/runtime-guards', () => ({
  asRecord: vi.fn((value: unknown) => value as Record<string, unknown>),
  toError: vi.fn((error: unknown) => error instanceof Error ? error : new Error(String(error))),
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/rateLimit', () => ({
  adminRateLimit: vi.fn(async () => ({
    success: true,
    allowed: true,
    remaining: 100,
    reset: Date.now() + 60_000,
    error: null,
  })),
}));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));

import { POST } from '../app/api/admin/organizations/[orgId]/adjust-balance/route';

describe('POST /api/admin/organizations/[orgId]/adjust-balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects adjustments for allocated-per-member organizations', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: {
      organization: {
        findUnique: () => Promise<{ tokenBalance: number; name: string; tokenPoolStrategy: string; plan: null }>;
        update: () => Promise<unknown>;
      };
    }) => Promise<unknown>) => {
      const tx: {
        organization: {
          findUnique: () => Promise<{ tokenBalance: number; name: string; tokenPoolStrategy: string; plan: null }>;
          update: () => Promise<unknown>;
        };
      } = {
        organization: {
          findUnique: async () => ({
            tokenBalance: 0,
            name: 'Acme Workspace',
            tokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
            plan: null,
          }),
          update: async () => undefined,
        },
      };
      return callback(tx);
    });

    const response = await POST(new NextRequest('http://localhost/api/admin/organizations/org_1/adjust-balance', {
      method: 'POST',
      body: JSON.stringify({ amount: 25, reason: 'Manual credit' }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ orgId: 'org_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Token balance adjustments are only available for shared-pool organizations. Adjust per-member balances through billing or member-level tooling.');
    expect(recordAdminActionMock).not.toHaveBeenCalled();
  });

  it('also rejects adjustments when the org row is stale shared but the attached plan is allocated-per-member', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: (tx: {
      organization: {
        findUnique: () => Promise<{ tokenBalance: number; name: string; tokenPoolStrategy: string; plan: { organizationTokenPoolStrategy: string } }>;
        update: () => Promise<unknown>;
      };
    }) => Promise<unknown>) => {
      const tx: {
        organization: {
          findUnique: () => Promise<{ tokenBalance: number; name: string; tokenPoolStrategy: string; plan: { organizationTokenPoolStrategy: string } }>;
          update: () => Promise<unknown>;
        };
      } = {
        organization: {
          findUnique: async () => ({
            tokenBalance: 2126,
            name: 'Acme Workspace',
            tokenPoolStrategy: 'SHARED_FOR_ORG',
            plan: { organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER' },
          }),
          update: async () => undefined,
        },
      };
      return callback(tx);
    });

    const response = await POST(new NextRequest('http://localhost/api/admin/organizations/org_1/adjust-balance', {
      method: 'POST',
      body: JSON.stringify({ amount: 25, reason: 'Manual credit' }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ orgId: 'org_1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Token balance adjustments are only available for shared-pool organizations. Adjust per-member balances through billing or member-level tooling.');
    expect(recordAdminActionMock).not.toHaveBeenCalled();
  });
});