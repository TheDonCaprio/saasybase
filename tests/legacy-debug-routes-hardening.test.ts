import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminMock = vi.hoisted(() => vi.fn(async () => 'admin_1'));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const prismaMock = vi.hoisted(() => ({
  subscription: { findMany: vi.fn(async () => []) },
  payment: { findMany: vi.fn(async () => []) },
  user: { findUnique: vi.fn(async () => ({ email: 'user@example.com', name: 'User' })) },
}));
const notificationsMock = vi.hoisted(() => ({
  createBillingNotification: vi.fn(async () => undefined),
}));
const emailMock = vi.hoisted(() => ({
  shouldEmailUser: vi.fn(async () => false),
  sendEmail: vi.fn(async () => ({ success: true })),
  getSupportEmail: vi.fn(async () => 'support@example.com'),
  getSiteName: vi.fn(async () => 'Saasybase'),
}));

vi.mock('../lib/auth', () => ({
  requireAdmin: requireAdminMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/notifications', () => notificationsMock);
vi.mock('../lib/email', () => emailMock);

import { GET as debugSubscriptionsGet } from '../app/api/debug/subscriptions/route';
import { POST as debugBillingTestPost } from '../app/api/debug/billing/test/route';
import { GET as mockSessionGet } from '../app/api/mock-session/route';
import { GET as clerkClientShapeGet } from '../app/api/debug/clerk-client-shape/route';

describe('legacy debug route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.unstubAllEnvs();
  });

  it('returns 404 when debug routes are not explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const [subscriptionsRes, billingRes, mockSessionRes, clerkShapeRes] = await Promise.all([
      debugSubscriptionsGet(),
      debugBillingTestPost(new NextRequest('http://localhost/api/debug/billing/test', { method: 'POST', body: JSON.stringify({ userId: 'user_1' }), headers: { 'content-type': 'application/json' } })),
      mockSessionGet(),
      clerkClientShapeGet(),
    ]);

    expect(subscriptionsRes.status).toBe(404);
    expect(billingRes.status).toBe(404);
    expect(mockSessionRes.status).toBe(404);
    expect(clerkShapeRes.status).toBe(404);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it('requires admin auth when debug routes are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ENABLE_DEBUG_ROUTES', 'true');

    const [subscriptionsRes, billingRes, mockSessionRes, clerkShapeRes] = await Promise.all([
      debugSubscriptionsGet(),
      debugBillingTestPost(new NextRequest('http://localhost/api/debug/billing/test', { method: 'POST', body: JSON.stringify({ userId: 'user_1' }), headers: { 'content-type': 'application/json' } })),
      mockSessionGet(),
      clerkClientShapeGet(),
    ]);

    expect(subscriptionsRes.status).toBe(200);
    expect(billingRes.status).toBe(200);
    expect(mockSessionRes.status).toBe(200);
    expect(clerkShapeRes.status).toBe(200);
    expect(requireAdminMock).toHaveBeenCalledTimes(4);
    expect(notificationsMock.createBillingNotification).toHaveBeenCalledWith('user_1', 'This is a test billing notification.');
  });
});