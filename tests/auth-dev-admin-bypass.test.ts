import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
}));

const prismaUserFindUniqueMock = vi.hoisted(() => vi.fn());
const isLocalhostDevBypassEnabledMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: prismaUserFindUniqueMock,
    },
  },
}));
vi.mock('../lib/dev-admin-bypass', () => ({
  isLocalhostDevBypassEnabled: isLocalhostDevBypassEnabledMock,
}));
vi.mock('../lib/logger', () => ({ Logger: { warn: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/notifications', () => ({ notifyExpiredSubscriptions: vi.fn(), sendBillingNotification: vi.fn() }));
vi.mock('../lib/organization-access', () => ({ syncOrganizationEligibilityForUser: vi.fn() }));
vi.mock('../lib/teams', () => ({ creditOrganizationSharedTokens: vi.fn(), creditAllocatedPerMemberTokens: vi.fn() }));
vi.mock('../lib/settings', () => ({ getDefaultTokenLabel: vi.fn() }));
vi.mock('../lib/moderator', () => ({
  buildAdminLikePermissions: vi.fn(() => ({
    users: true,
    transactions: true,
    purchases: true,
    subscriptions: true,
    support: true,
    notifications: true,
    blog: true,
    analytics: true,
    traffic: true,
    organizations: true,
  })),
  fetchModeratorPermissions: vi.fn(),
  moderatorHasAccess: vi.fn(),
}));
vi.mock('../lib/metrics', () => ({ incrementMetric: vi.fn() }));

import { requireAdmin, requireAdminOrModerator, AuthGuardError } from '../lib/auth';

describe('DEV_ADMIN_ID bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_ADMIN_ID = 'admin_1';
    authServiceMock.getSession.mockResolvedValue({ userId: null });
  });

  it('does not grant admin access to a different signed-in user', async () => {
    authServiceMock.getCurrentUser.mockResolvedValue({ id: 'user_2' });
    prismaUserFindUniqueMock.mockResolvedValue({ role: 'USER' });

    await expect(requireAdmin()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('allows the configured dev admin when the authenticated user matches DEV_ADMIN_ID', async () => {
    authServiceMock.getCurrentUser.mockResolvedValue({ id: 'admin_1' });
    prismaUserFindUniqueMock.mockResolvedValue({ role: 'ADMIN' });

    await expect(requireAdmin()).resolves.toBe('admin_1');
    await expect(requireAdminOrModerator()).resolves.toMatchObject({
      userId: 'admin_1',
      role: 'ADMIN',
    });
  });

  it('does not grant admin access when no user is authenticated', async () => {
    authServiceMock.getCurrentUser.mockResolvedValue(null);
    authServiceMock.getSession.mockResolvedValue({ userId: null });

    await expect(requireAdmin()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});