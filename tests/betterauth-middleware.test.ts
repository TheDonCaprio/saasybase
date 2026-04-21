import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const betterAuthGetSessionMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: vi.fn(),
  createRouteMatcher: vi.fn(),
}));

vi.mock('../lib/better-auth', () => ({
  betterAuthServer: {
    api: {
      getSession: betterAuthGetSessionMock,
    },
  },
}));

vi.mock('../lib/logger', () => ({
  Logger: {
    warn: loggerWarnMock,
  },
}));

describe('Better Auth middleware adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_PROVIDER = 'betterauth';
  });

  it('resolves Better Auth sessions into the shared auth shape', async () => {
    betterAuthGetSessionMock.mockResolvedValueOnce({
      session: {
        id: 'session_1',
        activeOrganizationId: 'provider_org_1',
      },
      user: {
        id: 'user_1',
      },
    });

    vi.resetModules();
    const { authMiddleware } = await import('../lib/auth-provider/middleware');

    const handler = vi.fn(async (auth: unknown) => {
      const resolved = await (auth as () => Promise<unknown>)();
      return Response.json(resolved);
    });

    const middleware = authMiddleware(handler);
    const request = new NextRequest('http://localhost/admin');
    const response = await middleware(request);
    const body = await (response as Response).json();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(betterAuthGetSessionMock).toHaveBeenCalledWith({ headers: request.headers });
    expect(body).toEqual({
      userId: 'user_1',
      orgId: 'provider_org_1',
      sessionId: 'session_1',
      user: { id: 'user_1' },
      isAuthenticated: true,
    });
  });

  it('returns null auth when Better Auth session lookup fails', async () => {
    betterAuthGetSessionMock.mockRejectedValueOnce(new Error('session lookup failed'));

    vi.resetModules();
    const { authMiddleware } = await import('../lib/auth-provider/middleware');

    const handler = vi.fn(async (auth: unknown) => {
      const resolved = await (auth as () => Promise<unknown>)();
      return Response.json({ auth: resolved });
    });

    const middleware = authMiddleware(handler);
    const response = await middleware(new NextRequest('http://localhost/admin'));
    const body = await (response as Response).json();

    expect(body).toEqual({ auth: null });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Better Auth proxy session lookup failed',
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});