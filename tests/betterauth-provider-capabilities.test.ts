import { describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const headersMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const findUniqueMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
const resolveSessionActivityFromHeadersMock = vi.hoisted(() => vi.fn());
const shouldRefreshSessionActivityMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/logger', () => ({ Logger: loggerMock }));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('../lib/better-auth', () => ({
  betterAuthServer: {
    api: {
      getSession: getSessionMock,
    },
  },
}));
vi.mock('../lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: findUniqueMock,
      update: updateMock,
      findMany: findManyMock,
    },
  },
}));
vi.mock('../lib/session-activity', async () => {
  const actual = await vi.importActual<typeof import('../lib/session-activity')>('../lib/session-activity');
  return {
    ...actual,
    resolveSessionActivityFromHeaders: resolveSessionActivityFromHeadersMock,
    shouldRefreshSessionActivity: shouldRefreshSessionActivityMock,
  };
});

import { BetterAuthProvider } from '../lib/auth-provider/providers/betterauth';

describe('BetterAuthProvider capability contract', () => {
  it('refreshes Better Auth current-session activity before listing sessions', async () => {
    const provider = new BetterAuthProvider();
    const requestHeaders = new Headers({
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.10',
      'cf-ipcountry': 'US',
    });

    headersMock.mockResolvedValue(requestHeaders);
    getSessionMock.mockResolvedValue({
      session: { id: 'sess_current', userId: 'user_1', activeOrganizationId: null },
      user: { id: 'user_1', email: 'user@example.com' },
    });
    findUniqueMock.mockResolvedValue({
      id: 'sess_current',
      userId: 'user_1',
      expires: new Date('2030-01-01T00:00:00.000Z'),
      expiresAt: null,
      lastActiveAt: new Date('2026-05-04T00:00:00.000Z'),
      ipAddress: null,
      userAgent: null,
      country: null,
      city: null,
    });
    resolveSessionActivityFromHeadersMock.mockResolvedValue({
      browserName: 'Chrome',
      browserVersion: '123.0',
      deviceType: 'desktop',
      isMobile: false,
      userAgent: 'Mozilla/5.0',
      ipAddress: '203.0.113.10',
      city: null,
      country: 'US',
    });
    shouldRefreshSessionActivityMock.mockReturnValue(true);
    updateMock.mockResolvedValue(undefined);
    findManyMock.mockResolvedValue([
      {
        id: 'sess_current',
        expires: new Date('2030-01-01T00:00:00.000Z'),
        expiresAt: null,
        lastActiveAt: new Date('2026-05-04T00:05:00.000Z'),
        userAgent: 'Mozilla/5.0',
        ipAddress: '203.0.113.10',
        country: 'US',
        city: null,
      },
    ]);

    const sessions = await provider.getUserSessions('user_1');

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'sess_current' },
      data: expect.objectContaining({
        userAgent: 'Mozilla/5.0',
        ipAddress: '203.0.113.10',
        country: 'US',
      }),
    });
    expect(sessions[0]).toMatchObject({
      id: 'sess_current',
      activity: expect.objectContaining({
        ipAddress: '203.0.113.10',
        country: 'US',
      }),
    });
  });

  it('advertises only the local-mode capabilities currently supported', () => {
    const provider = new BetterAuthProvider();

    expect(provider.supportsFeature('organizations')).toBe(true);
    expect(provider.supportsFeature('session_management')).toBe(true);
    expect(provider.supportsFeature('oauth')).toBe(true);
    expect(provider.supportsFeature('magic_link')).toBe(true);
    expect(provider.supportsFeature('organization_invites')).toBe(false);
    expect(provider.supportsFeature('webhooks')).toBe(false);
    expect(provider.supportsFeature('middleware')).toBe(false);
  });

  it('treats inbound webhook verification as a no-op in local mode', async () => {
    const provider = new BetterAuthProvider();

    await expect(
      provider.verifyWebhook({
        body: '{}',
        headers: {},
      })
    ).resolves.toBeNull();

    expect(loggerMock.debug).toHaveBeenCalledWith(
      'BetterAuthProvider.verifyWebhook skipped',
      expect.objectContaining({
        message: 'Local Better Auth does not consume inbound auth webhooks.',
      })
    );
  });

  it('returns no standalone middleware object because middleware is resolved centrally', () => {
    const provider = new BetterAuthProvider();

    expect(provider.getMiddleware()).toBeNull();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});