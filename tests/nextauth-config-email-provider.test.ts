import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedProvider = {
  id?: string;
  type?: string;
  server?: unknown;
  sendVerificationRequest?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

type CapturedNextAuthConfig = {
  providers?: CapturedProvider[];
  adapter?: {
    createUser?: (user: { email?: string | null; name?: string | null; image?: string | null; emailVerified?: Date | null }) => Promise<unknown>;
    updateUser?: (user: { id?: string; email?: string | null; name?: string | null; image?: string | null; emailVerified?: Date | null }) => Promise<unknown>;
  };
};

type CapturedEmailProvider = CapturedProvider & {
  sendVerificationRequest: (...args: unknown[]) => unknown;
};

const nextAuthMock = vi.hoisted(() => vi.fn((config) => {
  globalThis.__capturedNextAuthConfig = config;

  return {
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}));

const prismaAdapterMock = vi.hoisted(() => vi.fn(() => ({})));
const credentialsProviderMock = vi.hoisted(() => vi.fn((config) => ({ id: 'credentials', type: 'credentials', ...config })));
const githubProviderMock = vi.hoisted(() => vi.fn((config) => ({ id: 'github', type: 'oauth', ...config })));
const googleProviderMock = vi.hoisted(() => vi.fn((config) => ({ id: 'google', type: 'oauth', ...config })));
const sendNextAuthMagicLinkEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
const sendNextAuthVerificationEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
const prismaMock = vi.hoisted(() => ({
  rateLimitBucket: {
    findUnique: vi.fn(),
  },
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

declare global {
  var __capturedNextAuthConfig: CapturedNextAuthConfig | undefined;
}

vi.mock('next-auth', () => ({
  default: nextAuthMock,
}));

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: prismaAdapterMock,
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: credentialsProviderMock,
}));

vi.mock('next-auth/providers/github', () => ({
  default: githubProviderMock,
}));

vi.mock('next-auth/providers/google', () => ({
  default: googleProviderMock,
}));

vi.mock('../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../lib/nextauth-email-verification', () => ({
  sendNextAuthMagicLinkEmail: sendNextAuthMagicLinkEmailMock,
  sendNextAuthVerificationEmail: sendNextAuthVerificationEmailMock,
}));

vi.mock('../lib/rateLimit', () => ({
  rateLimit: vi.fn(),
  RATE_LIMITS: {
    AUTH: {
      limit: 20,
      windowMs: 15 * 60 * 1000,
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

function getCapturedEmailProvider(): CapturedEmailProvider {
  const providers = globalThis.__capturedNextAuthConfig?.providers ?? [];
  const provider = providers.find((candidate: { type?: string; id?: string }) => candidate.type === 'email' && candidate.id === 'nodemailer');
  if (!provider) {
    throw new Error('Expected the NextAuth config to register the nodemailer email provider');
  }
  if (typeof provider.sendVerificationRequest !== 'function') {
    throw new Error('Expected the nodemailer email provider to define sendVerificationRequest');
  }
  return provider as CapturedEmailProvider;
}

async function loadConfigModule(): Promise<CapturedNextAuthConfig | undefined> {
  vi.resetModules();
  globalThis.__capturedNextAuthConfig = undefined;
  await import('../lib/nextauth.config');
  return globalThis.__capturedNextAuthConfig;
}

describe('nextauth email provider config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'no-reply@example.com';
    process.env.NEXT_PUBLIC_APP_DOMAIN = 'example.com';
  });

  it('registers a custom email provider without requiring SMTP settings', async () => {
    await loadConfigModule();

    const provider = getCapturedEmailProvider();

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(prismaAdapterMock).toHaveBeenCalledTimes(1);
    expect(provider).toMatchObject({
      id: 'nodemailer',
      type: 'email',
      name: 'Email',
      from: 'no-reply@example.com',
      maxAge: 15 * 60,
    });
    expect(provider.server).toBeUndefined();
    expect(typeof provider.sendVerificationRequest).toBe('function');
  });

  it('routes verified-user magic links through the shared email helper', async () => {
    await loadConfigModule();
    const provider = getCapturedEmailProvider();
    const expires = new Date('2026-03-31T12:00:00.000Z');

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Verified User',
      emailVerified: new Date('2026-03-01T00:00:00.000Z'),
    });

    await provider.sendVerificationRequest({
      identifier: 'Verified@example.com',
      url: 'http://localhost:3000/api/auth/callback/nodemailer?token=abc&email=verified%40example.com',
      expires,
      provider,
      token: 'abc',
      theme: {},
      request: new Request('http://localhost:3000/api/auth/signin/nodemailer', { method: 'POST' }),
    });

    expect(sendNextAuthMagicLinkEmailMock).toHaveBeenCalledWith({
      userId: 'user_1',
      email: 'verified@example.com',
      name: 'Verified User',
      url: 'http://localhost:3000/api/auth/callback/nodemailer?token=abc&email=verified%40example.com',
      expires,
    });
    expect(sendNextAuthVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('routes unverified-user requests through the shared verification helper', async () => {
    await loadConfigModule();
    const provider = getCapturedEmailProvider();

    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_2',
      name: 'Pending User',
      emailVerified: null,
    });

    await provider.sendVerificationRequest({
      identifier: 'Pending@example.com',
      url: 'http://localhost:3000/api/auth/callback/nodemailer?token=abc&email=pending%40example.com',
      expires: new Date('2026-03-31T12:00:00.000Z'),
      provider,
      token: 'abc',
      theme: {},
      request: new Request('http://localhost:3000/api/auth/signin/nodemailer', { method: 'POST' }),
    });

    expect(sendNextAuthVerificationEmailMock).toHaveBeenCalledWith({
      userId: 'user_2',
      email: 'pending@example.com',
      name: 'Pending User',
    });
    expect(sendNextAuthMagicLinkEmailMock).not.toHaveBeenCalled();
  });

  it('maps adapter image fields onto imageUrl for OAuth user writes', async () => {
    const config = await loadConfigModule();
    const adapter = config?.adapter;

    prismaMock.user.create.mockResolvedValue({
      id: 'user_3',
      email: 'oauth@example.com',
      name: 'OAuth User',
      imageUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
      emailVerified: null,
    });
    prismaMock.user.update.mockResolvedValue({
      id: 'user_3',
      email: 'oauth@example.com',
      name: 'OAuth User',
      imageUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
      emailVerified: null,
    });

    const created = await adapter?.createUser?.({
      email: 'oauth@example.com',
      name: 'OAuth User',
      image: 'https://avatars.githubusercontent.com/u/1?v=4',
      emailVerified: null,
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: 'oauth@example.com',
        name: 'OAuth User',
        imageUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
        emailVerified: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        emailVerified: true,
      },
    });
    expect(created).toMatchObject({
      id: 'user_3',
      email: 'oauth@example.com',
      name: 'OAuth User',
      image: 'https://avatars.githubusercontent.com/u/1?v=4',
      emailVerified: null,
    });

    const updated = await adapter?.updateUser?.({
      id: 'user_3',
      image: 'https://avatars.githubusercontent.com/u/2?v=4',
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_3' },
      data: {
        imageUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
      },
      select: {
        id: true,
        email: true,
        name: true,
        imageUrl: true,
        emailVerified: true,
      },
    });
    expect(updated).toMatchObject({
      id: 'user_3',
      image: 'https://avatars.githubusercontent.com/u/2?v=4',
    });
  });
});