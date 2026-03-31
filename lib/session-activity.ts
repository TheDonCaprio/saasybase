import { Logger } from './logger';
import { toError } from './runtime-guards';

type HeaderReader = {
  get(name: string): string | null;
};

type GeoLookupResult = {
  city: string | null;
  country: string | null;
};

export type PersistedSessionActivityData = {
  lastActiveAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  city?: string | null;
  country?: string | null;
};

export type SessionActivitySnapshot = {
  browserName: string | null;
  browserVersion: string | null;
  deviceType: string | null;
  isMobile: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
};

const GEOLOOKUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEOLOOKUP_TIMEOUT_MS = 1500;
const SESSION_ACTIVITY_REFRESH_MS = 5 * 60 * 1000;

const geoLookupCache = new Map<string, { expiresAt: number; value: GeoLookupResult | null }>();

function firstForwardedForIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function normalizeIpAddress(value: string | null): string | null {
  if (!value) return null;

  let ip = value.trim();
  if (!ip || ip.toLowerCase() === 'unknown') {
    return null;
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, '');
  }

  return ip;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;

  if (
    normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === 'localhost'
    || normalized === '0.0.0.0'
  ) {
    return true;
  }

  if (
    normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || normalized.startsWith('169.254.')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
  ) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number.parseInt(match172[1] ?? '', 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  const match100 = normalized.match(/^100\.(\d{1,3})\./);
  if (match100) {
    const secondOctet = Number.parseInt(match100[1] ?? '', 10);
    if (secondOctet >= 64 && secondOctet <= 127) {
      return true;
    }
  }

  return false;
}

export function getRequestIpFromHeaders(headers: HeaderReader): string | null {
  return normalizeIpAddress(
    firstForwardedForIp(headers.get('x-forwarded-for'))
      || headers.get('x-real-ip')
      || headers.get('cf-connecting-ip')
      || headers.get('x-client-ip')
      || headers.get('x-forwarded')
      || null
  );
}

function readBrowserVersion(ua: string, pattern: RegExp): string | null {
  const match = ua.match(pattern);
  return match?.[1] ?? null;
}

export function parseUserAgent(userAgent: string | null): Omit<SessionActivitySnapshot, 'userAgent' | 'ipAddress' | 'city' | 'country'> {
  const ua = userAgent?.trim() ?? '';
  const lower = ua.toLowerCase();

  const isTablet = /ipad|tablet/.test(lower);
  const isMobile = !isTablet && /mobile|android|iphone|ipod/.test(lower);

  let browserName = 'Unknown';
  let browserVersion: string | null = null;

  if (/edg\//i.test(ua)) {
    browserName = 'Edge';
    browserVersion = readBrowserVersion(ua, /edg\/([\d.]+)/i);
  } else if (/opr\//i.test(ua)) {
    browserName = 'Opera';
    browserVersion = readBrowserVersion(ua, /opr\/([\d.]+)/i);
  } else if (/firefox|fxios/i.test(ua)) {
    browserName = 'Firefox';
    browserVersion = readBrowserVersion(ua, /(?:firefox|fxios)\/([\d.]+)/i);
  } else if (/chrome|chromium|crios/i.test(ua)) {
    browserName = 'Chrome';
    browserVersion = readBrowserVersion(ua, /(?:chrome|chromium|crios)\/([\d.]+)/i);
  } else if (/safari/i.test(ua) && !/chrome|chromium|crios|opr|edg/i.test(ua)) {
    browserName = 'Safari';
    browserVersion = readBrowserVersion(ua, /version\/([\d.]+)/i);
  }

  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  return {
    browserName,
    browserVersion,
    deviceType,
    isMobile,
  };
}

function getIpinfoLiteToken(): string | null {
  const token = process.env.IPINFO_LITE_TOKEN?.trim();
  return token ? token : null;
}

async function lookupGeoForIp(ipAddress: string | null, headers?: HeaderReader): Promise<GeoLookupResult | null> {
  const ip = normalizeIpAddress(ipAddress);
  const headerCountry = headers?.get('cf-ipcountry')?.trim() || null;
  const fallback = headerCountry && headerCountry !== 'XX' && headerCountry !== 'T1'
    ? { city: null, country: headerCountry }
    : null;

  const token = getIpinfoLiteToken();

  if (!ip || !token || isPrivateOrLocalIp(ip)) {
    return fallback;
  }

  const now = Date.now();
  const cached = geoLookupCache.get(ip);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), GEOLOOKUP_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: controller?.signal,
    });

    if (!response.ok) {
      geoLookupCache.set(ip, { expiresAt: now + GEOLOOKUP_CACHE_TTL_MS, value: fallback });
      return fallback;
    }

    const payload = await response.json() as {
      country?: string | null;
      country_code?: string | null;
      error?: {
        title?: string;
        message?: string;
      };
    };

    if (payload.error) {
      geoLookupCache.set(ip, { expiresAt: now + GEOLOOKUP_CACHE_TTL_MS, value: fallback });
      return fallback;
    }

    const value: GeoLookupResult = {
      city: null,
      country: typeof payload.country === 'string' && payload.country.trim().length > 0
        ? payload.country.trim()
        : typeof payload.country_code === 'string' && payload.country_code.trim().length > 0
          ? payload.country_code.trim()
          : fallback?.country ?? null,
    };

    geoLookupCache.set(ip, { expiresAt: now + GEOLOOKUP_CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    Logger.debug('Session geo lookup failed', { ip, error: toError(error).message });
    geoLookupCache.set(ip, { expiresAt: now + GEOLOOKUP_CACHE_TTL_MS, value: fallback });
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function resolveSessionActivityFromHeaders(headers: HeaderReader): Promise<SessionActivitySnapshot> {
  const userAgent = headers.get('user-agent')?.slice(0, 512) ?? null;
  const ipAddress = getRequestIpFromHeaders(headers);
  const parsedUserAgent = parseUserAgent(userAgent);
  const geo = await lookupGeoForIp(ipAddress, headers);

  return {
    ...parsedUserAgent,
    userAgent,
    ipAddress,
    city: geo?.city ?? null,
    country: geo?.country ?? null,
  };
}

export function shouldRefreshSessionActivity(
  current: PersistedSessionActivityData,
  next: SessionActivitySnapshot,
  now: Date = new Date(),
): boolean {
  if (!current.lastActiveAt) {
    return true;
  }

  if (now.getTime() - current.lastActiveAt.getTime() >= SESSION_ACTIVITY_REFRESH_MS) {
    return true;
  }

  if ((current.userAgent ?? null) !== next.userAgent) {
    return true;
  }

  if ((current.ipAddress ?? null) !== next.ipAddress) {
    return true;
  }

  if (!current.city && next.city) {
    return true;
  }

  if (!current.country && next.country) {
    return true;
  }

  return false;
}