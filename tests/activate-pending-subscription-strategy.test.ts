import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const creditOrganizationSharedTokensMock = vi.hoisted(() => vi.fn(async () => undefined));
const creditAllocatedPerMemberTokensMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/runtime-guards', () => ({ toError: vi.fn((error: unknown) => error instanceof Error ? error : new Error(String(error)))}));
vi.mock('../lib/notifications', () => ({
  notifyExpiredSubscriptions: vi.fn(async () => undefined),
  sendBillingNotification: vi.fn(async () => undefined),
}));
vi.mock('../lib/organization-access', () => ({
  syncOrganizationEligibilityForUser: vi.fn(async () => undefined),
}));
vi.mock('../lib/teams', () => ({
  creditOrganizationSharedTokens: creditOrganizationSharedTokensMock,
  creditAllocatedPerMemberTokens: creditAllocatedPerMemberTokensMock,
}));
vi.mock('../lib/settings', () => ({
  getDefaultTokenLabel: vi.fn(async () => 'tokens'),
}));
vi.mock('../lib/moderator', () => ({
  buildAdminLikePermissions: vi.fn(),
  fetchModeratorPermissions: vi.fn(),
  moderatorHasAccess: vi.fn(),
}));
vi.mock('../lib/auth-guard-error', () => ({
  raiseAuthGuardError: vi.fn(),
}));
vi.mock('../lib/auth-provider', () => ({
  authService: {
    getSession: vi.fn(async () => ({ userId: 'user_1' })),
    getCurrentUser: vi.fn(async () => null),
  },
}));
vi.mock('../lib/dev-admin-bypass', () => ({
  isLocalhostDevBypassEnabled: vi.fn(() => false),
}));

import { activatePendingSubscriptions } from '../lib/auth';

describe('activatePendingSubscriptions token pool strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        {
          id: 'sub_pending_1',
          organizationId: 'org_1',
          plan: {
            name: 'Team Pro',
            tokenLimit: 120,
            tokenName: 'credits',
            organizationTokenPoolStrategy: 'ALLOCATED_PER_MEMBER',
          },
          organization: {
            tokenPoolStrategy: 'SHARED_FOR_ORG',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    prismaMock.subscription.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock));
  });

  it('grants member balances based on the pending plan strategy during activation', async () => {
    await activatePendingSubscriptions('user_1');

    expect(creditAllocatedPerMemberTokensMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      amount: 120,
      tx: prismaMock,
    });
    expect(creditOrganizationSharedTokensMock).not.toHaveBeenCalled();
  });
});