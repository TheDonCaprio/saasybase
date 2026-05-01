import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn(() => ({})),
}));

vi.mock('better-auth/client/plugins', () => ({
  magicLinkClient: vi.fn(() => ({})),
  organizationClient: vi.fn(() => ({})),
}));

import { resolveBetterAuthClientBaseUrl } from '../lib/better-auth-client';

const originalPublicBetterAuthUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL = originalPublicBetterAuthUrl;
  process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
});

describe('resolveBetterAuthClientBaseUrl', () => {
  it('prefers the active browser origin over stale env values', () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    expect(resolveBetterAuthClientBaseUrl('https://example.ngrok-free.app')).toBe('https://example.ngrok-free.app');
  });

  it('falls back to the Better Auth public url when no browser origin is available', () => {
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'https://auth.example.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    expect(resolveBetterAuthClientBaseUrl(undefined)).toBe('https://auth.example.com');
  });

  it('falls back to the public app url when the Better Auth url is unset', () => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    expect(resolveBetterAuthClientBaseUrl(undefined)).toBe('https://app.example.com');
  });
});