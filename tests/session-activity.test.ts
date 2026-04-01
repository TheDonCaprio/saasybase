import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('session activity helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.IPINFO_LITE_TOKEN;
  });

  it('parses browser, version, and device type from the user agent', async () => {
    const { parseUserAgent } = await import('../lib/session-activity');

    expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toEqual({
      browserName: 'Safari',
      browserVersion: '17.4',
      deviceType: 'mobile',
      isMobile: true,
    });
  });

  it('resolves country for public IP addresses via IPinfo Lite', async () => {
    process.env.IPINFO_LITE_TOKEN = 'test_token';

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ country: 'Nigeria', country_code: 'NG' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveSessionActivityFromHeaders } = await import('../lib/session-activity');
    const activity = await resolveSessionActivityFromHeaders({
      get(name: string) {
        if (name === 'user-agent') return 'Mozilla/5.0 Chrome/123.0 Safari/537.36';
        if (name === 'x-forwarded-for') return '203.0.113.10';
        return null;
      },
    });

    expect(activity).toEqual({
      browserName: 'Chrome',
      browserVersion: '123.0',
      deviceType: 'desktop',
      isMobile: false,
      userAgent: 'Mozilla/5.0 Chrome/123.0 Safari/537.36',
      ipAddress: '203.0.113.10',
      city: null,
      country: 'Nigeria',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ipinfo.io/lite/203.0.113.10?token=test_token',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('skips external geo lookup for local IP addresses', async () => {
    process.env.IPINFO_LITE_TOKEN = 'test_token';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { resolveSessionActivityFromHeaders } = await import('../lib/session-activity');
    const activity = await resolveSessionActivityFromHeaders({
      get(name: string) {
        if (name === 'user-agent') return 'Mozilla/5.0 Firefox/124.0';
        if (name === 'x-forwarded-for') return '127.0.0.1';
        return null;
      },
    });

    expect(activity.city).toBeNull();
    expect(activity.country).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses country.is when no IPinfo token is configured', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ country: 'US' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveSessionActivityFromHeaders } = await import('../lib/session-activity');
    const activity = await resolveSessionActivityFromHeaders({
      get(name: string) {
        if (name === 'user-agent') return 'Mozilla/5.0 Chrome/123.0 Safari/537.36';
        if (name === 'x-forwarded-for') return '198.51.100.20';
        return null;
      },
    });

    expect(activity.country).toBe('US');
    expect(activity.city).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.country.is/198.51.100.20',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});