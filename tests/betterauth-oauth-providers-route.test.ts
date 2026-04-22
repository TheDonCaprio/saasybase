import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/auth/oauth-providers/route';

describe('Better Auth OAuth providers route', () => {
  const originalEnv = {
    AUTH_PROVIDER: process.env.AUTH_PROVIDER,
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.NEXT_PUBLIC_AUTH_PROVIDER,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };

  afterEach(() => {
    process.env.AUTH_PROVIDER = originalEnv.AUTH_PROVIDER;
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = originalEnv.NEXT_PUBLIC_AUTH_PROVIDER;
    process.env.GITHUB_CLIENT_ID = originalEnv.GITHUB_CLIENT_ID;
    process.env.GITHUB_CLIENT_SECRET = originalEnv.GITHUB_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
  });

  it('returns false for all providers outside the Better Auth lane', async () => {
    process.env.AUTH_PROVIDER = 'nextauth';
    process.env.GITHUB_CLIENT_ID = 'github-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-secret';

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      authProvider: 'nextauth',
      github: false,
      google: false,
    });
  });

  it('reports only the Better Auth social providers that are fully configured', async () => {
    process.env.AUTH_PROVIDER = 'betterauth';
    process.env.GITHUB_CLIENT_ID = 'github-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-secret';
    process.env.GOOGLE_CLIENT_ID = 'google-id';
    process.env.GOOGLE_CLIENT_SECRET = '';

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      authProvider: 'betterauth',
      github: true,
      google: false,
    });
  });
});
