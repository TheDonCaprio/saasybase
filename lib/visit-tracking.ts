import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getEnv } from './env';
import { Logger } from './logger';
import { toError } from './runtime-guards';
import { getRequestIp } from './request-ip';

export async function trackVisit(request: NextRequest) {
  try {
    // Skip tracking for certain paths and bots
    const { pathname } = request.nextUrl;
    
    // Skip API routes, static files, and admin routes
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/admin/') ||
      pathname.includes('.') ||
      pathname.startsWith('/sign-in') ||
      pathname.startsWith('/sign-up')
    ) {
      return;
    }

    // Skip known bots and crawlers
    const userAgent = request.headers.get('user-agent') || '';
    const botPatterns = [
      'bot', 'crawler', 'spider', 'scraper', 'facebook', 'twitter',
      'linkedin', 'google', 'bing', 'yahoo', 'duckduck', 'baidu',
      'yandex', 'pinterest', 'whatsapp', 'telegram', 'discord',
      'lighthouse', 'pagespeed', 'gtmetrix', 'pingdom', 'uptimerobot'
    ];
    
    if (botPatterns.some(pattern => userAgent.toLowerCase().includes(pattern))) {
      return;
    }

    // Extract visit information
    const ip = getRequestIp(request) ?? 'unknown';
    
    const referrer = request.headers.get('referer') || 'direct';
    const sessionId = request.cookies.get('session-id')?.value || generateSessionId();
    
    // Get geographic data (simplified - in production you'd use a service like MaxMind)
    const country = request.headers.get('cf-ipcountry') || 
                   getCountryFromIP(ip) || 
                   'Unknown';

    // Create visit record asynchronously to not block the request
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
    // Use fetch to call an internal API endpoint; require validated NEXT_PUBLIC_APP_URL
    const base = getEnv().NEXT_PUBLIC_APP_URL;
    await fetch(`${base}/api/internal/track-visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API': 'true'
      },
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
  if (sessionId && !response.cookies.get('session-id')) {
    response.cookies.set('session-id', sessionId, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
  }
  return response;
}
