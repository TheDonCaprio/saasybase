import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  verificationToken: {
    deleteMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({})),
  },
}));

vi.mock('../lib/email', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('../lib/prisma', () => ({
  prisma: prismaMock,
}));

describe('nextauth email verification helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('throws when verification delivery fails', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'domain not verified' });

    const { sendNextAuthVerificationEmail } = await import('../lib/nextauth-email-verification');

    await expect(
      sendNextAuthVerificationEmail({
        userId: 'user_1',
        email: 'user@example.com',
        name: 'User Example',
      })
    ).rejects.toThrow('domain not verified');
  });

  it('throws when magic link delivery fails', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'resend rejected sender' });

    const { sendNextAuthMagicLinkEmail } = await import('../lib/nextauth-email-verification');

    await expect(
      sendNextAuthMagicLinkEmail({
        userId: 'user_1',
        email: 'user@example.com',
        name: 'User Example',
        url: 'http://localhost:3000/api/auth/callback/nodemailer?token=abc&email=user%40example.com',
        expires: new Date('2026-03-31T12:00:00.000Z'),
      })
    ).rejects.toThrow('resend rejected sender');
  });

  it('uses an explicit runtime base url for verification emails when provided', async () => {
    sendEmailMock.mockResolvedValue({ success: true });

    const { sendNextAuthVerificationEmail } = await import('../lib/nextauth-email-verification');

    await sendNextAuthVerificationEmail({
      userId: 'user_1',
      email: 'user@example.com',
      name: 'User Example',
      baseUrl: 'https://192.168.1.50:3000',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        actionUrl: expect.stringContaining('https://192.168.1.50:3000/api/auth/verify-email?token='),
      }),
    }));
  });
});