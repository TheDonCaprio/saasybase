import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'admin_1', role: 'ADMIN', permissions: {} })));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const prismaMock = vi.hoisted(() => ({
  systemLog: {
    create: vi.fn(async () => ({ id: 'log_1' })),
  },
}));
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: loggerMock }));

import { POST as triggerLog } from '../app/api/_debug/trigger-log/route';
import { POST as triggerLogger } from '../app/api/_debug/trigger-logger/route';

describe('debug route hardening', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDebugRoutes = process.env.ENABLE_DEBUG_ROUTES;

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    delete (process.env as Record<string, string | undefined>).ENABLE_DEBUG_ROUTES;
  });

  afterAll(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalEnableDebugRoutes === undefined) {
      delete (process.env as Record<string, string | undefined>).ENABLE_DEBUG_ROUTES;
    } else {
      (process.env as Record<string, string | undefined>).ENABLE_DEBUG_ROUTES = originalEnableDebugRoutes;
    }
  });

  it('returns 404 when debug routes are not explicitly enabled', async () => {
    const [logRes, loggerRes] = await Promise.all([triggerLog(), triggerLogger()]);

    expect(logRes.status).toBe(404);
    expect(loggerRes.status).toBe(404);
    expect(requireAdminOrModeratorMock).not.toHaveBeenCalled();
  });

  it('requires admin or moderator access when enabled', async () => {
    (process.env as Record<string, string | undefined>).ENABLE_DEBUG_ROUTES = 'true';

    await triggerLog();
    await triggerLogger();

    expect(requireAdminOrModeratorMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.systemLog.create).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });
});