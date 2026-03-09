import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 19, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const sendNextAuthVerificationEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  getClientIP: getClientIPMock,
  RATE_LIMITS: { AUTH: { limit: 20, windowMs: 15 * 60 * 1000, message: 'Too many authentication attempts' } },
}));
vi.mock('../lib/nextauth-email-verification', () => ({
  sendNextAuthVerificationEmail: sendNextAuthVerificationEmailMock,
}));

import { POST } from '../app/api/auth/resend-verification/route';

describe('auth resend-verification route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resends verification only for unverified users', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'pending@example.com',
      name: 'Pending User',
      emailVerified: null,
    });

    const req = new NextRequest('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'pending@example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(sendNextAuthVerificationEmailMock).toHaveBeenCalledWith({
      userId: 'user_1',
      email: 'pending@example.com',
      name: 'Pending User',
    });
  });

  it('returns a generic success response when the account is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'missing@example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(sendNextAuthVerificationEmailMock).not.toHaveBeenCalled();
  });
});