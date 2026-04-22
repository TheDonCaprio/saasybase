import { afterEach, describe, expect, it, vi } from 'vitest';

const betterAuthMock = vi.hoisted(() => vi.fn(() => ({ api: {}, handler: {} })));

vi.mock('better-auth', () => ({
  betterAuth: betterAuthMock,
}));

vi.mock('better-auth/next-js', () => ({
  nextCookies: vi.fn(() => ({ id: 'nextCookies' })),
  toNextJsHandler: vi.fn(() => ({ GET: vi.fn(), POST: vi.fn() })),
}));

vi.mock('@better-auth/prisma-adapter', () => ({
  prismaAdapter: vi.fn(() => ({ id: 'adapter' })),
}));

vi.mock('better-auth/plugins', () => ({
  magicLink: vi.fn(() => ({ id: 'magicLink' })),
  organization: vi.fn(() => ({ id: 'organization' })),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {},
}));

vi.mock('../lib/email', () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock('../lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../lib/welcome', () => ({
  sendWelcomeIfNotSent: vi.fn(async () => undefined),
}));

describe('Better Auth social provider registration', () => {
  const originalEnv = {
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };

  afterEach(() => {
    process.env.GITHUB_CLIENT_ID = originalEnv.GITHUB_CLIENT_ID;
    process.env.GITHUB_CLIENT_SECRET = originalEnv.GITHUB_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
    betterAuthMock.mockClear();
    vi.resetModules();
  });

  function getCapturedConfig() {
    const calls = betterAuthMock.mock.calls as unknown as Array<[unknown]>;
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    return firstCall[0] as { socialProviders?: Record<string, () => Promise<unknown>> };
  }

  it('registers GitHub and Google providers when both credential pairs are configured', async () => {
    process.env.GITHUB_CLIENT_ID = 'github-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-secret';
    process.env.GOOGLE_CLIENT_ID = 'google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret';

    await import('../lib/better-auth');

    expect(betterAuthMock).toHaveBeenCalled();
    const config = getCapturedConfig();

    expect(config.socialProviders).toBeDefined();
    expect(Object.keys(config.socialProviders ?? {}).sort()).toEqual(['github', 'google']);
  });

  it('omits socialProviders when no OAuth credentials are configured', async () => {
    process.env.GITHUB_CLIENT_ID = '';
    process.env.GITHUB_CLIENT_SECRET = '';
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';

    await import('../lib/better-auth');

    expect(betterAuthMock).toHaveBeenCalled();
    const config = getCapturedConfig();

    expect(config.socialProviders).toBeUndefined();
  });
});