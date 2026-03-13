import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  supportsFeature: vi.fn(),
  getUserSessions: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));

import { GET as getSessionRoute, POST as sessionRoutePost } from '../app/api/sessions/[sessionId]/route';
import { GET as revokeSessionGet, POST as revokeSessionPost } from '../app/api/sessions/[sessionId]/revoke/route';
import { GET as revokeOthersGet } from '../app/api/sessions/revoke-others/route';

describe('session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.supportsFeature.mockReturnValue(true);
    authServiceMock.getUserSessions.mockResolvedValue([]);
  });

  it('requires authentication for session lookup', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: null });

    const res = await getSessionRoute(
      new NextRequest('http://localhost/api/sessions/sess_1'),
      { params: Promise.resolve({ sessionId: 'sess_1' }) }
    );

    expect(res.status).toBe(401);
  });

  it('returns only sessions owned by the authenticated user', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1' });
    authServiceMock.getUserSessions.mockResolvedValue([
      {
        id: 'sess_1',
        status: 'active',
        lastActiveAt: new Date('2026-03-10T00:00:00.000Z'),
        activity: { browserName: 'Chrome', ipAddress: '127.0.0.1' },
      },
    ]);

    const res = await getSessionRoute(
      new NextRequest('http://localhost/api/sessions/sess_1'),
      { params: Promise.resolve({ sessionId: 'sess_1' }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: 'sess_1',
      status: 'active',
      lastActiveAt: '2026-03-10T00:00:00.000Z',
      latestActivity: { browserName: 'Chrome', ipAddress: '127.0.0.1' },
    });
  });

  it('returns 404 for session lookup when the session is not owned by the authenticated user', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1' });
    authServiceMock.getUserSessions.mockResolvedValue([
      { id: 'sess_owned', status: 'active', lastActiveAt: null, activity: null },
    ]);

    const res = await getSessionRoute(
      new NextRequest('http://localhost/api/sessions/sess_other'),
      { params: Promise.resolve({ sessionId: 'sess_other' }) }
    );

    expect(res.status).toBe(404);
  });

  it('forbids revoking a session not owned by the authenticated user', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1' });
    authServiceMock.getUserSessions.mockResolvedValue([
      { id: 'sess_owned', status: 'active', lastActiveAt: null, activity: null },
    ]);

    const res = await revokeSessionPost(
      new NextRequest('http://localhost/api/sessions/sess_other/revoke', { method: 'POST' }),
      { params: Promise.resolve({ sessionId: 'sess_other' }) }
    );

    expect(res.status).toBe(403);
    expect(authServiceMock.revokeSession).not.toHaveBeenCalled();
  });

  it('revokes an owned session', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1' });
    authServiceMock.getUserSessions.mockResolvedValue([
      { id: 'sess_1', status: 'active', lastActiveAt: null, activity: null },
    ]);

    const res = await revokeSessionPost(
      new NextRequest('http://localhost/api/sessions/sess_1/revoke', { method: 'POST' }),
      { params: Promise.resolve({ sessionId: 'sess_1' }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ revoked: true });
    expect(authServiceMock.revokeSession).toHaveBeenCalledWith('sess_1');
  });

  it('returns 405 for GET revoke endpoints', async () => {
    const revokeRes = await revokeSessionGet();
    const revokeOthersRes = await revokeOthersGet();

    expect(revokeRes.status).toBe(405);
    expect(revokeOthersRes.status).toBe(405);
  });

  it('returns 405 for unsupported POST on session lookup route', async () => {
    const res = await sessionRoutePost();
    expect(res.status).toBe(405);
  });
});