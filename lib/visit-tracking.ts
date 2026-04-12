import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getRequestIp } from './request-ip';

export function shouldTrackVisit(request: NextRequest): boolean {
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    return false;
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/admin/') ||
    pathname.includes('.')
  ) {
    return false;
  }

  const userAgent = request.headers.get('user-agent') || '';
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'facebook', 'twitter',
    'linkedin', 'google', 'bing', 'yahoo', 'duckduck', 'baidu',
    'yandex', 'pinterest', 'whatsapp', 'telegram', 'discord',
    'lighthouse', 'pagespeed', 'gtmetrix', 'pingdom', 'uptimerobot'
  ];

  return !botPatterns.some((pattern) => userAgent.toLowerCase().includes(pattern));
}

export function getOrCreateVisitSessionId(request: NextRequest): string {
  return request.cookies.get('session-id')?.value || generateSessionId();
}

export async function trackVisit(request: NextRequest, sessionId = getOrCreateVisitSessionId(request)) {
  try {
    if (!shouldTrackVisit(request)) {
      return;
    }

    const { pathname } = request.nextUrl;

    const userAgent = request.headers.get('user-agent') || '';

    const ip = getRequestIp(request) ?? 'unknown';
    const referrer = request.headers.get('referer') || 'direct';

    const country = request.headers.get('cf-ipcountry') || 
                   getCountryFromIP(ip) || 
                   'Unknown';

    createVisitRecord({
      sessionId,
      ip,
      userAgent,
      country,
      referrer,
      path: pathname,
    }).catch(error => {
      const e = toError(error);
      Logger.warn('Failed to track visit', { error: e.message });
    });

  } catch (error: unknown) {
    const e = toError(error);
    Logger.warn('Visit tracking error', { error: e.message });
  }
}

async function createVisitRecord(data: {
  sessionId: string;
  ip: string;
  userAgent: string;
  country: string;
  referrer: string;
  path: string;
}) {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!base) {
      Logger.warn('Visit tracking skipped because NEXT_PUBLIC_APP_URL is not configured');
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (process.env.NODE_ENV === 'production') {
      const internalApiToken = process.env.INTERNAL_API_TOKEN;
      if (!internalApiToken) {
        Logger.warn('Visit tracking skipped because INTERNAL_API_TOKEN is not configured in production');
        return;
      }
      headers.Authorization = `Bearer ${internalApiToken}`;
    } else {
      headers['X-Internal-API'] = 'true';
    }

    await fetch(`${base}/api/internal/track-visit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  } catch (error: unknown) {
    const e = toError(error);
    Logger.warn('Failed to create visit record', { error: e.message });
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getCountryFromIP(ip: string): string | null {
  // Simplified IP to country mapping
  // In production, use a proper geolocation service
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return 'US'; // Default for local IPs
  }
  return null;
}

export function addVisitTrackingHeaders(response: NextResponse, sessionId?: string) {
  if (sessionId) {
    response.cookies.set('session-id', sessionId, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
  }
  return response;
}
