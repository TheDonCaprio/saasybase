import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMiddlewareMock = vi.hoisted(() =>
  vi.fn((handler: (auth: unknown, req: NextRequest) => unknown) => handler)
);
const createAuthRouteMatcherMock = vi.hoisted(() =>
  vi.fn((patterns: string[]) => {
    void patterns;
    return (req: { nextUrl: { pathname: string } }) => req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/admin');
  })
);
const shouldBlockDemoReadOnlyMutationMock = vi.hoisted(() => vi.fn(() => false));
const isMaintenanceModeEnabledMock = vi.hoisted(() => vi.fn(async () => false));
const isMaintenanceBypassPathMock = vi.hoisted(() => vi.fn(() => false));
const shouldTrackVisitMock = vi.hoisted(() => vi.fn(() => false));
const trackVisitMock = vi.hoisted(() => vi.fn(async () => undefined));
const getOrCreateVisitSessionIdMock = vi.hoisted(() => vi.fn(() => 'visit_session_1'));
const addVisitTrackingHeadersMock = vi.hoisted(() => vi.fn((response: Response) => response));
const prismaUserFindUniqueMock = vi.hoisted(() => vi.fn(async () => null));
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/auth-provider/middleware', () => ({
  authMiddleware: authMiddlewareMock,
  createAuthRouteMatcher: createAuthRouteMatcherMock,
}));

vi.mock('../lib/demo-readonly', () => ({
  shouldBlockDemoReadOnlyMutation: shouldBlockDemoReadOnlyMutationMock,
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: prismaUserFindUniqueMock,
    },
  },
}));

vi.mock('../lib/maintenance-mode', () => ({
  isMaintenanceModeEnabled: isMaintenanceModeEnabledMock,
  isMaintenanceBypassPath: isMaintenanceBypassPathMock,
}));

vi.mock('../lib/visit-tracking', () => ({
  shouldTrackVisit: shouldTrackVisitMock,
  trackVisit: trackVisitMock,
  getOrCreateVisitSessionId: getOrCreateVisitSessionIdMock,
  addVisitTrackingHeaders: addVisitTrackingHeadersMock,
}));

vi.mock('../lib/logger', () => ({
  Logger: {
    warn: loggerWarnMock,
  },
}));

describe('proxy auth resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows protected routes when the auth callback resolves to an authenticated Better Auth-style result', async () => {
    vi.resetModules();
    const proxyModule = await import('../proxy');
    const proxy = proxyModule.default as unknown as (auth: unknown, req: NextRequest) => Promise<Response | void>;

    const request = new NextRequest('http://localhost/admin');
    const response = await proxy(
      async () => ({
        userId: 'user_1',
        orgId: 'provider_org_1',
        sessionId: 'session_1',
        user: { id: 'user_1' },
        isAuthenticated: true,
      }),
      request
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(200);
  });

  it('returns API 401 for protected admin API routes when Better Auth auth resolution fails', async () => {
    vi.resetModules();
    const proxyModule = await import('../proxy');
    const proxy = proxyModule.default as unknown as (auth: unknown, req: NextRequest) => Promise<Response | void>;

    const request = new NextRequest('http://localhost/api/admin/users');
    const response = await proxy(async () => null, request);
    const body = await (response as Response).json();

    expect((response as Response).status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns API 401 for protected admin API routes on localhost when unauthenticated', async () => {
    vi.resetModules();
    const proxyModule = await import('../proxy');
    const proxy = proxyModule.default as unknown as (auth: unknown, req: NextRequest) => Promise<Response | void>;

    const request = new NextRequest('http://localhost/api/admin/users');
    const response = await proxy(async () => null, request);

    expect((response as Response).status).toBe(401);
  });

  it('redirects protected HTML routes to sign-in with a safe return path when unauthenticated', async () => {
    vi.resetModules();
    const proxyModule = await import('../proxy');
    const proxy = proxyModule.default as unknown as (auth: unknown, req: NextRequest) => Promise<Response | void>;

    const request = new NextRequest('http://localhost/admin?tab=members');
    const response = await proxy(async () => null, request);

    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get('location')).toBe('http://localhost/sign-in?redirect_url=%2Fadmin%3Ftab%3Dmembers');
  });
});