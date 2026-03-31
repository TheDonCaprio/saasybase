import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserSessions: vi.fn(),
}));

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('next/headers', () => ({
  headers: headersMock,
}));

import { GET } from '../app/api/user/sessions/route';

describe('GET /api/user/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0 Chrome/123.0 Safari/537.36';
        if (key === 'x-forwarded-for') return '203.0.113.10';
        if (key === 'x-real-ip') return null;
        return null;
      },
    });
  });

  it('requires authentication', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: null, sessionId: null });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('marks the current session and enriches its activity from request headers', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1', sessionId: 'sess_current' });
    authServiceMock.getUserSessions.mockResolvedValue([
      {
        id: 'sess_current',
        status: 'active',
        lastActiveAt: new Date('2026-03-20T12:00:00.000Z'),
        activity: null,
      },
      {
        id: 'sess_other',
        status: 'active',
        lastActiveAt: new Date('2026-03-19T12:00:00.000Z'),
        activity: { browserName: 'Firefox', ipAddress: '198.51.100.4' },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([
      {
        id: 'sess_current',
        status: 'active',
        lastActiveAt: '2026-03-20T12:00:00.000Z',
        latestActivity: {
          browserName: 'Chrome',
          deviceType: 'desktop',
          ipAddress: '203.0.113.10',
          isMobile: false,
          city: null,
          country: null,
        },
        isCurrent: true,
      },
      {
        id: 'sess_other',
        status: 'active',
        lastActiveAt: '2026-03-19T12:00:00.000Z',
        latestActivity: {
          browserName: 'Firefox',
          ipAddress: '198.51.100.4',
        },
        isCurrent: false,
      },
    ]);
  });
});