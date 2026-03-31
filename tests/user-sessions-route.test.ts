import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserSessions: vi.fn(),
}));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));

import { GET } from '../app/api/user/sessions/route';

describe('GET /api/user/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: null, sessionId: null });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('marks the current session and returns provider activity details', async () => {
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1', sessionId: 'sess_current' });
    authServiceMock.getUserSessions.mockResolvedValue([
      {
        id: 'sess_current',
        status: 'active',
        lastActiveAt: new Date('2026-03-20T12:00:00.000Z'),
        activity: {
          browserName: 'Chrome',
          browserVersion: '123.0',
          deviceType: 'desktop',
          ipAddress: '203.0.113.10',
          isMobile: false,
          city: 'Lagos',
          country: 'Nigeria',
        },
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
          browserVersion: '123.0',
          deviceType: 'desktop',
          ipAddress: '203.0.113.10',
          isMobile: false,
          city: 'Lagos',
          country: 'Nigeria',
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