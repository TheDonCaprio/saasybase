import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));
const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const parseVerificationIdentifierMock = vi.hoisted(() => vi.fn());
const sendNextAuthVerificationEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
const sendWelcomeIfNotSentMock = vi.hoisted(() => vi.fn(async () => undefined));
const loggerErrorMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({ id: 'user_1' })),
  },
  verificationToken: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
  getClientIP: getClientIPMock,
  RATE_LIMITS: { AUTH: { limit: 20, windowMs: 15 * 60 * 1000, message: 'Too many authentication attempts' } },
}));
vi.mock('../lib/nextauth-email-verification', () => ({
  parseVerificationIdentifier: parseVerificationIdentifierMock,
  sendNextAuthVerificationEmail: sendNextAuthVerificationEmailMock,
}));
vi.mock('../lib/welcome', () => ({ sendWelcomeIfNotSent: sendWelcomeIfNotSentMock }));
vi.mock('../lib/logger', () => ({ Logger: { error: loggerErrorMock } }));

import { GET, POST } from '../app/api/auth/verify-email/route';

describe('auth verify-email route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true, reset: Date.now() + 60_000 });
  });

  it('rate limits authenticated verification resend requests', async () => {
    authServiceMock.getSession.mockResolvedValueOnce({ userId: 'user_1' });
    rateLimitMock.mockResolvedValueOnce({ allowed: false, reset: Date.now() + 30_000 });

    const response = await POST(new NextRequest('http://localhost/api/auth/verify-email', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toContain('Too many verification email requests');
  });

  it('sends a verification email for authenticated unverified users', async () => {
    authServiceMock.getSession.mockResolvedValueOnce({ userId: 'user_1' });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'pending@example.com',
      name: 'Pending User',
      emailVerified: null,
    });

    const response = await POST(new NextRequest('http://localhost/api/auth/verify-email', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Verification email sent');
    expect(sendNextAuthVerificationEmailMock).toHaveBeenCalledWith({
      userId: 'user_1',
      email: 'pending@example.com',
      name: 'Pending User',
    });
  });

  it('redirects expired or missing verification tokens to the sign-in error path', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/auth/verify-email?token=raw-token&email=user@example.com'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/sign-in?error=expired-verification-link');
  });

  it('marks matching email verification tokens as verified and sends the welcome email', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValueOnce({
      identifier: 'verify:user@example.com',
      token: 'hashed-token',
      expires: new Date(Date.now() + 60_000),
    });
    parseVerificationIdentifierMock.mockReturnValueOnce({ kind: 'email-verify', email: 'user@example.com' });
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'user_1' });

    const response = await GET(new NextRequest('http://localhost/api/auth/verify-email?token=raw-token&email=user@example.com'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/sign-in?verification=success');
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      data: { emailVerified: expect.any(Date) },
    });
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: 'verify:user@example.com' } });
    expect(sendWelcomeIfNotSentMock).toHaveBeenCalledWith('user_1', 'user@example.com');
  });

  it('applies pending email-change verification and redirects back to profile', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValueOnce({
      identifier: 'email-change:user_1:new@example.com',
      token: 'hashed-token',
      expires: new Date(Date.now() + 60_000),
    });
    parseVerificationIdentifierMock.mockReturnValueOnce({
      kind: 'email-change',
      userId: 'user_1',
      newEmail: 'new@example.com',
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'user_1', name: 'Test User', email: 'old@example.com' });
    prismaMock.user.findFirst.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/auth/verify-email?token=raw-token&email=new@example.com'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/dashboard/profile?emailChange=success');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        email: 'new@example.com',
        emailVerified: expect.any(Date),
      },
    });
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: 'email-change:user_1:new@example.com' } });
  });
});