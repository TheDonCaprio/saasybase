import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserSessions: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userSetting: { findMany: vi.fn() },
  subscription: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  supportTicket: { findMany: vi.fn() },
  notification: { findMany: vi.fn() },
  organizationMembership: { findMany: vi.fn() },
  organization: { findMany: vi.fn() },
}));

vi.mock('@/lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  RATE_LIMITS: { EXPORT: { limit: 20, windowMs: 60_000, message: 'Export limit exceeded' } },
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '../app/api/user/export-account-data/route';

describe('GET /api/user/export-account-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a downloadable account data bundle', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1', orgId: null, sessionId: 'sess_1' });
    authServiceMock.getUserSessions.mockResolvedValue([
      { id: 'sess_1', status: 'active', lastActiveAt: new Date('2026-04-01T10:00:00.000Z'), activity: { browserName: 'Chrome' } },
    ]);
    rateLimitMock.mockResolvedValue({ success: true, allowed: true, reset: Date.now() + 60_000, remaining: 19 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'caprio@capriofiles.com',
      name: 'Caprio',
      imageUrl: null,
      role: 'USER',
      emailVerified: new Date('2026-04-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      tokenBalance: 12,
      freeTokenBalance: 3,
      freeTokensLastResetAt: null,
      tokensLastResetAt: null,
      paymentProvider: 'stripe',
      externalCustomerId: 'cus_123',
      externalCustomerIds: JSON.stringify({ stripe: 'cus_123' }),
    });
    prismaMock.userSetting.findMany.mockResolvedValue([{ id: 'set_1', key: 'THEME_PREFERENCE', value: 'dark', createdAt: new Date('2026-04-01T00:00:00.000Z'), updatedAt: new Date('2026-04-01T00:00:00.000Z') }]);
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.organizationMembership.findMany.mockResolvedValue([]);
    prismaMock.organization.findMany.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost/api/user/export-account-data'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('saasybase-account-data-');

    const body = await res.json();
    expect(body.profile.email).toBe('caprio@capriofiles.com');
    expect(body.profile.externalCustomerIds).toEqual({ stripe: 'cus_123' });
    expect(body.security.sessions).toHaveLength(1);
    expect(body.settings).toHaveLength(1);
  });

  it('requires authentication', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: null, orgId: null, sessionId: null });

    const res = await GET(new NextRequest('http://localhost/api/user/export-account-data'));

    expect(res.status).toBe(401);
  });
});