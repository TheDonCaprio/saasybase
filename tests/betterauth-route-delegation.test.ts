import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getHandlerMock = vi.hoisted(() => vi.fn());
const postHandlerMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/nextauth.config', () => ({
  hashPassword: vi.fn(async () => 'hashed-password'),
  handlers: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    verificationToken: {},
    verification: {
      findFirst: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    session: {},
  },
}));

vi.mock('../lib/rateLimit', () => ({
  rateLimit: vi.fn(),
  getClientIP: vi.fn(),
}));

vi.mock('../lib/password-policy', () => ({
  validatePasswordStrength: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../lib/better-auth', () => ({
  betterAuthNextJsHandler: {
    GET: getHandlerMock,
    POST: postHandlerMock,
  },
}));

import { POST as authRoutePost } from '../app/api/auth/[...nextauth]/route';
import { POST as resetPasswordPost } from '../app/api/auth/reset-password/route';
import { GET as resetPasswordCallbackGet } from '../app/api/auth/reset-password/[token]/route';
import { GET as magicLinkVerifyGet } from '../app/api/auth/magic-link/verify/route';
import { prisma } from '../lib/prisma';

const prismaMock = prisma as unknown as {
  verification: { findFirst: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
};

describe('Better Auth route delegation regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_PROVIDER = 'betterauth';
    prismaMock.verification.findFirst.mockResolvedValue(null);
  });

  it('delegates password reset requests through the auth catch-all route', async () => {
    const delegatedResponse = new Response(JSON.stringify({ status: true }), { status: 200 });
    postHandlerMock.mockResolvedValueOnce(delegatedResponse);

    const request = new NextRequest('http://localhost/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await authRoutePost(request);

    expect(postHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });

  it('delegates reset completion through the explicit reset-password route', async () => {
    const delegatedResponse = new Response(JSON.stringify({ status: true }), { status: 200 });
    postHandlerMock.mockResolvedValueOnce(delegatedResponse);
    prismaMock.verification.findFirst.mockResolvedValueOnce({ value: 'user_123' });

    const request = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok_123', newPassword: 'ResetTestP@ssw0rd!' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await resetPasswordPost(request);

    expect(postHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
    expect(prismaMock.verification.findFirst).toHaveBeenCalledWith({
      where: { identifier: 'reset-password:tok_123' },
      select: { value: true },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_123' },
      data: { password: 'hashed-password' },
    });
  });

  it('delegates reset callbacks through the explicit reset-password token route', async () => {
    const delegatedResponse = new Response(null, {
      status: 302,
      headers: { location: '/sign-in?mode=reset-password&token=tok_123' },
    });
    getHandlerMock.mockResolvedValueOnce(delegatedResponse);

    const request = new NextRequest('http://localhost/api/auth/reset-password/tok_123?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fsign-in%3Fmode%3Dreset-password');
    const response = await resetPasswordCallbackGet(request);

    expect(getHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });

  it('delegates magic-link verification through the explicit verify route', async () => {
    const delegatedResponse = new Response(null, {
      status: 302,
      headers: { location: '/dashboard' },
    });
    getHandlerMock.mockResolvedValueOnce(delegatedResponse);

    const request = new NextRequest('http://localhost/api/auth/magic-link/verify?token=ml_123&callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fdashboard');
    const response = await magicLinkVerifyGet(request);

    expect(getHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBe(delegatedResponse);
  });
});