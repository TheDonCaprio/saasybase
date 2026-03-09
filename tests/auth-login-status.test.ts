import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const compareMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ success: true, allowed: true, remaining: 19, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: compareMock },
  compare: compareMock,
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  getClientIP: getClientIPMock,
  RATE_LIMITS: { AUTH: { limit: 20, windowMs: 15 * 60 * 1000, message: 'Too many authentication attempts' } },
}));

import { POST } from '../app/api/auth/login-status/route';

describe('auth login-status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows sign-in for verified users with valid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'verified@example.com',
      name: 'Verified User',
      password: 'hashed',
      emailVerified: new Date(),
    });
    compareMock.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/auth/login-status', {
      method: 'POST',
      body: JSON.stringify({ email: 'verified@example.com', password: 'secret' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.canSignIn).toBe(true);
  });

  it('returns explicit unverified status for valid unverified credential logins', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_2',
      email: 'unverified@example.com',
      name: 'Unverified User',
      password: 'hashed',
      emailVerified: null,
    });
    compareMock.mockResolvedValue(true);

    const req = new NextRequest('http://localhost/api/auth/login-status', {
      method: 'POST',
      body: JSON.stringify({ email: 'unverified@example.com', password: 'secret' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(body.error).toBe('Your email is not verified.');
  });

  it('returns a generic invalid-credentials response for bad passwords', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_3',
      email: 'verified@example.com',
      name: 'Verified User',
      password: 'hashed',
      emailVerified: new Date(),
    });
    compareMock.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/auth/login-status', {
      method: 'POST',
      body: JSON.stringify({ email: 'verified@example.com', password: 'wrong' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Invalid email or password. Please try again.');
  });
});