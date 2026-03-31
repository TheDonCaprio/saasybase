import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const compareMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  session: {
    create: vi.fn(),
  },
}));

const rateLimitMock = vi.hoisted(() => vi.fn());
const getClientIPMock = vi.hoisted(() => vi.fn());
const resolveSessionActivityFromHeadersMock = vi.hoisted(() => vi.fn(async () => ({
  browserName: 'Chrome',
  browserVersion: '123.0',
  deviceType: 'desktop',
  isMobile: false,
  userAgent: 'Mozilla/5.0 Chrome/123.0 Safari/537.36',
  ipAddress: '203.0.113.10',
  city: 'Lagos',
  country: 'Nigeria',
})));

vi.mock('bcryptjs', () => ({
  default: {
    compare: compareMock,
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/rateLimit', () => ({
  RATE_LIMITS: { AUTH: { limit: 5, windowMs: 900000, message: 'Too many attempts' } },
  rateLimit: rateLimitMock,
  getClientIP: getClientIPMock,
}));
vi.mock('../lib/session-activity', () => ({
  resolveSessionActivityFromHeaders: resolveSessionActivityFromHeadersMock,
}));

import { POST } from '../app/api/auth/credentials-login/route';

describe('POST /api/auth/credentials-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIPMock.mockReturnValue('127.0.0.1');
    rateLimitMock.mockResolvedValue({ allowed: true, reset: Date.now() + 60000 });
  });

  it('rejects invalid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      password: 'hashed',
      emailVerified: new Date(),
    });
    compareMock.mockResolvedValue(false);

    const request = new NextRequest('http://localhost/api/auth/credentials-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid email or password. Please try again.');
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('rejects unverified users', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      password: 'hashed',
      emailVerified: null,
    });
    compareMock.mockResolvedValue(true);

    const request = new NextRequest('http://localhost/api/auth/credentials-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('creates a database session and sets the auth cookie on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      password: 'hashed',
      emailVerified: new Date(),
    });
    compareMock.mockResolvedValue(true);
    prismaMock.session.create.mockResolvedValue({ id: 'sess_1' });

    const request = new NextRequest('http://localhost/api/auth/credentials-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'secret123' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();
    const cookieHeader = response.headers.get('set-cookie') || '';

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        userAgent: 'Mozilla/5.0 Chrome/123.0 Safari/537.36',
        ipAddress: '203.0.113.10',
        city: 'Lagos',
        country: 'Nigeria',
        lastActiveAt: expect.any(Date),
      }),
    });
    expect(cookieHeader).toContain('authjs.session-token=');
  });
});