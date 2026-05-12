import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const refreshDemoDataMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  getClientIP: getClientIPMock,
}));

vi.mock('../lib/demo-refresh', async () => {
  const actual = await vi.importActual<typeof import('../lib/demo-refresh')>('../lib/demo-refresh');
  return {
    ...actual,
    refreshDemoData: refreshDemoDataMock,
  };
});

vi.mock('../lib/logger', () => ({
  Logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

import { GET } from '../app/api/cron/demo-refresh/route';
import { DemoRefreshSeedMissingError } from '../lib/demo-refresh';

const originalEnv = { ...process.env };

function expectResponse(response: Response | void): Response {
  expect(response).toBeDefined();
  return response as Response;
}

describe('GET /api/cron/demo-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      CRON_DEMO_REFRESH_TOKEN: 'demo-refresh-token',
    };
  });

  it('returns not found when the bearer token is missing or invalid in production', async () => {
    const response = expectResponse(await GET(new NextRequest('http://localhost/api/cron/demo-refresh')));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
    expect(refreshDemoDataMock).not.toHaveBeenCalled();
  });

  it('returns a successful skip when demo seed data is absent', async () => {
    refreshDemoDataMock.mockRejectedValueOnce(new DemoRefreshSeedMissingError());

    const response = expectResponse(await GET(new NextRequest('http://localhost/api/cron/demo-refresh', {
      headers: {
        authorization: 'Bearer demo-refresh-token',
      },
    })));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe('No demo users found. Run `npm run demo:seed` first.');
    expect(loggerInfoMock).toHaveBeenCalledWith('Cron: demo refresh skipped', {
      reason: 'No demo users found. Run `npm run demo:seed` first.',
    });
  });

  it('returns a successful payload when demo refresh completes', async () => {
    refreshDemoDataMock.mockResolvedValueOnce({
      users: 3,
      organizations: 1,
      subscriptions: 2,
      payments: 4,
      tickets: 1,
      replies: 2,
      notifications: 5,
      emailLogs: 2,
      visits: 8,
      systemLogs: 2,
      adminActions: 1,
      invites: 1,
      blogPosts: 2,
      coupons: 1,
    });

    const response = expectResponse(await GET(new NextRequest('http://localhost/api/cron/demo-refresh?window=90&visits=30', {
      headers: {
        authorization: 'Bearer demo-refresh-token',
      },
    })));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.config).toEqual({ windowDays: 90, visitWindowDays: 30 });
    expect(body.result).toEqual({
      users: 3,
      organizations: 1,
      subscriptions: 2,
      payments: 4,
      tickets: 1,
      replies: 2,
      notifications: 5,
      emailLogs: 2,
      visits: 8,
      systemLogs: 2,
      adminActions: 1,
      invites: 1,
      blogPosts: 2,
      coupons: 1,
    });
    expect(loggerInfoMock).toHaveBeenCalledWith('Cron: demo refresh complete', {
      windowDays: 90,
      visitWindowDays: 30,
      result: {
        users: 3,
        organizations: 1,
        subscriptions: 2,
        payments: 4,
        tickets: 1,
        replies: 2,
        notifications: 5,
        emailLogs: 2,
        visits: 8,
        systemLogs: 2,
        adminActions: 1,
        invites: 1,
        blogPosts: 2,
        coupons: 1,
      },
    });
  });
});