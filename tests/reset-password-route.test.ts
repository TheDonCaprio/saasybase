import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const hashPasswordMock = vi.hoisted(() => vi.fn(async () => 'hashed-password-123'));
const validatePasswordStrengthMock = vi.hoisted(() => vi.fn(() => ({ valid: true, message: '' })));
const loggerErrorMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  verificationToken: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  user: {
    update: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(async () => ({ count: 2 })),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/nextauth.config', () => ({ hashPassword: hashPasswordMock }));
vi.mock('../lib/rateLimit', () => ({ rateLimit: rateLimitMock, getClientIP: getClientIPMock }));
vi.mock('../lib/password-policy', () => ({ validatePasswordStrength: validatePasswordStrengthMock }));
vi.mock('../lib/logger', () => ({ Logger: { error: loggerErrorMock } }));

import { POST } from '../app/api/auth/reset-password/route';

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true, reset: Date.now() + 60_000 });
    validatePasswordStrengthMock.mockReturnValue({ valid: true, message: '' });
    hashPasswordMock.mockResolvedValue('hashed-password-123');
  });

  it('returns 429 when rate limited', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, reset: Date.now() + 30_000 });

    const request = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token', email: 'user@example.com', password: 'Password1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
  });

  it('rejects invalid or expired reset links when the token lookup fails', async () => {
    prismaMock.verificationToken.findFirst.mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token', email: 'user@example.com', password: 'Password1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid or expired reset link');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('cleans up expired tokens and returns a specific expiry message', async () => {
    prismaMock.verificationToken.findFirst.mockResolvedValueOnce({
      identifier: 'pwd-reset:user@example.com',
      token: 'hashed',
      expires: new Date(Date.now() - 60_000),
    });

    const request = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token', email: 'user@example.com', password: 'Password1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Reset link has expired');
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'pwd-reset:user@example.com', token: expect.any(String) },
    });
  });

  it('hashes the new password, revokes sessions, and deletes tokens on success', async () => {
    prismaMock.verificationToken.findFirst.mockResolvedValueOnce({
      identifier: 'pwd-reset:user@example.com',
      token: 'hashed',
      expires: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValueOnce({ id: 'user_1' });

    const request = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token', email: 'user@example.com', password: 'Password1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Password has been reset successfully');
    expect(hashPasswordMock).toHaveBeenCalledWith('Password1');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      data: { password: 'hashed-password-123', tokenVersion: { increment: 1 } },
      select: { id: true },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenLastCalledWith({
      where: { identifier: 'pwd-reset:user@example.com' },
    });
  });
});