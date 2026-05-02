import { describe, expect, it } from 'vitest';
import { resolveRequestOrigin, resolveSameOriginUrl } from '../lib/request-origin';

function createHeaders(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

describe('request origin helpers', () => {
  const forwardedHost = 'public-preview.example.test';

  it('prefers forwarded host and proto over the internal request url', () => {
    const origin = resolveRequestOrigin({
      url: 'http://localhost:3000/api/auth/verify-email?token=abc',
      headers: createHeaders({
        'x-forwarded-host': forwardedHost,
        'x-forwarded-proto': 'https',
      }),
    });

    expect(origin).toBe(`https://${forwardedHost}`);
  });

  it('builds same-origin redirects from the forwarded origin', () => {
    const url = resolveSameOriginUrl({
      url: 'http://localhost:3000/api/auth/verify-email?token=abc',
      headers: createHeaders({
        'x-forwarded-host': forwardedHost,
        'x-forwarded-proto': 'https',
      }),
    }, '/sign-in?verification=success');

    expect(url).toBe(`https://${forwardedHost}/sign-in?verification=success`);
  });
});