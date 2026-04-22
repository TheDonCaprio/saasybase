import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authServiceMock = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  getUser: vi.fn(),
}));

const sendWelcomeIfNotSentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/welcome', () => ({ sendWelcomeIfNotSent: sendWelcomeIfNotSentMock }));
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/teams', () => ({
  upsertOrganization: vi.fn(),
  syncOrganizationMembership: vi.fn(),
  removeOrganizationMembership: vi.fn(),
  upsertOrganizationInvite: vi.fn(),
  expireOrganizationInvite: vi.fn(),
  markInviteAccepted: vi.fn(),
  deleteOrganizationByProviderId: vi.fn(),
}));
vi.mock('../lib/user-helpers', () => ({ ensureUserExists: vi.fn() }));

import { POST } from '../app/api/webhooks/clerk/route';

describe('Clerk webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLERK_WEBHOOK_SECRET', 'whsec_test');
    vi.stubEnv('ALLOW_UNSIGNED_CLERK_WEBHOOKS', '');
    authServiceMock.verifyWebhook.mockResolvedValue(null);
    authServiceMock.getUser.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing signatures in production before verification', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('missing-signature');
    expect(authServiceMock.verifyWebhook).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures when provider verification fails', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-signature': 'v1,invalid',
      },
      body: JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid-signature');
    expect(authServiceMock.verifyWebhook).toHaveBeenCalledWith({
      body: JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } }),
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'svix-signature': 'v1,invalid',
      }),
    });
  });

  it('processes verified events through authService', async () => {
    authServiceMock.verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      payload: { type: 'user.updated', data: { id: 'user_123' } },
      originalEvent: { type: 'user.updated' },
    });
    authServiceMock.getUser.mockResolvedValue({
      id: 'user_123',
      email: 'verified@example.com',
      emailVerified: true,
      firstName: 'Don',
      lastName: null,
      fullName: 'Don',
      imageUrl: null,
    });
    sendWelcomeIfNotSentMock.mockResolvedValue({ ok: true });

    const req = new NextRequest('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-signature': 'v1,valid',
      },
      body: JSON.stringify({ ignored: true }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(authServiceMock.getUser).toHaveBeenCalledWith('user_123');
    expect(sendWelcomeIfNotSentMock).toHaveBeenCalledWith('user_123', 'verified@example.com', { firstName: 'Don' });
  });

  it('allows unsigned webhooks only for explicit localhost debugging when the toggle is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    vi.stubEnv('ALLOW_UNSIGNED_CLERK_WEBHOOKS', 'true');

    const req = new NextRequest('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('rejects unsigned webhooks in non-local environments even when the toggle is enabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.example.com');
    vi.stubEnv('ALLOW_UNSIGNED_CLERK_WEBHOOKS', 'true');

    const req = new NextRequest('https://staging.example.com/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.updated', data: { id: 'user_123' } }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('missing-signature');
  });
});