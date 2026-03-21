import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.hoisted(() => vi.fn(async () => 'admin_1'));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('../lib/auth', () => ({
  requireAdmin: requireAdminMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));

import { GET as mockSessionGet } from '../app/api/mock-session/route';

describe('mock session route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.unstubAllEnvs();
  });

  it('returns 404 when debug routes are not explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const response = await mockSessionGet();

    expect(response.status).toBe(404);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('requires admin auth when debug routes are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ENABLE_DEBUG_ROUTES', 'true');

    const response = await mockSessionGet();

    expect(response.status).toBe(200);
    expect(requireAdminMock).toHaveBeenCalledTimes(1);
  });
});