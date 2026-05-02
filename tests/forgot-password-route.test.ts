import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const sendEmailMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn(async () => ({ allowed: true, reset: Date.now() + 60_000 })));
const getClientIPMock = vi.hoisted(() => vi.fn(() => '127.0.0.1'));
const loggerWarnMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  verificationToken: {
    deleteMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({ id: 'token_1' })),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/email', () => ({ sendEmail: sendEmailMock }));
vi.mock('../lib/rateLimit', () => ({ rateLimit: rateLimitMock, getClientIP: getClientIPMock }));
vi.mock('../lib/logger', () => ({ Logger: { warn: loggerWarnMock } }));

import { POST } from '../app/api/auth/forgot-password/route';

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  it('cleans up reset tokens and keeps a generic response when email delivery fails', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Example User',
    });
    sendEmailMock.mockResolvedValue({ success: false, error: 'domain not verified' });

    const request = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': 'public-preview.example.test',
        'x-forwarded-proto': 'https',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain('If an account with that email exists');
    expect(prismaMock.verificationToken.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledWith('Forgot password email failed', {
      email: 'user@example.com',
      userId: 'user_1',
      error: 'domain not verified',
    });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        actionUrl: expect.stringContaining('https://public-preview.example.test/sign-in?mode=reset-password&token='),
        dashboardUrl: 'https://public-preview.example.test/dashboard',
      }),
    }));
  });
});