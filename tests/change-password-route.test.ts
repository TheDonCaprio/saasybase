import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

const authServiceMock = vi.hoisted(() => ({
  providerName: 'nextauth',
  getSession: vi.fn(async () => ({ userId: 'user_1' })),
}));

const betterAuthServerMock = vi.hoisted(() => ({
  api: {
    changePassword: vi.fn(async () => ({ user: { id: 'user_1' } })),
  },
}));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
}));

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/rateLimit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, reset: Date.now() + 60_000 })),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('../lib/password-policy', () => ({
  validatePasswordStrength: vi.fn(() => ({ valid: true })),
}));
vi.mock('../lib/better-auth', () => ({
  betterAuthServer: betterAuthServerMock,
}));
vi.mock('../lib/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '../app/api/user/change-password/route';

describe('POST /api/user/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.providerName = 'nextauth';
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1' });
  });

  it('delegates Better Auth password changes to the Better Auth server API', async () => {
    authServiceMock.providerName = 'betterauth';

    const response = await POST(new NextRequest('http://localhost/api/user/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'old-pass', newPassword: 'NewPassword123!' }),
      headers: { 'content-type': 'application/json' },
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Password changed successfully');
    expect(betterAuthServerMock.api.changePassword).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        currentPassword: 'old-pass',
        newPassword: 'NewPassword123!',
        revokeOtherSessions: false,
      },
    });
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { password: expect.any(String) },
    });
    const hashedPassword = prismaMock.user.update.mock.calls[0]?.[0]?.data?.password;
    expect(typeof hashedPassword).toBe('string');
    await expect(bcrypt.compare('NewPassword123!', hashedPassword)).resolves.toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('maps Better Auth invalid-password errors to the existing route contract', async () => {
    authServiceMock.providerName = 'betterauth';
    betterAuthServerMock.api.changePassword.mockRejectedValueOnce({
      status: 400,
      message: 'Invalid password',
    });

    const response = await POST(new NextRequest('http://localhost/api/user/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'wrong-pass', newPassword: 'NewPassword123!' }),
      headers: { 'content-type': 'application/json' },
    }));

    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Current password is incorrect');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});