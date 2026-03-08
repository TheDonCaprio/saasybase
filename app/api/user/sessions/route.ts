/**
 * User Sessions API Route
 * =========================
 * Lists active sessions for the authenticated user.
 * Used by the NextAuth client hooks (`user.getSessions()`).
 * Also works with Clerk — calls through the auth abstraction.
 *
 * For NextAuth with JWT strategy, there are no DB session records.
 * We return a synthetic "current session" entry based on request headers.
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { authService } from '@/lib/auth-provider';

const isNextAuth = process.env.AUTH_PROVIDER === 'nextauth';

export async function GET() {
  try {
    const session = await authService.getSession();
    if (!session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await authService.getUserSessions(session.userId);

    // If the provider returned sessions, map and return them (Clerk path)
    if (sessions.length > 0) {
      return NextResponse.json(
        sessions.map((s) => ({
          id: s.id,
          status: s.status,
          lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
          latestActivity: s.activity ?? null,
        }))
      );
    }

    // For JWT-based NextAuth: synthesize a "current session" entry from request headers
    if (isNextAuth) {
      const hdrs = await headers();
      const ua = hdrs.get('user-agent') || '';
      const forwarded = hdrs.get('x-forwarded-for');
      const realIp = hdrs.get('x-real-ip');
      const ipAddress = forwarded?.split(',')[0]?.trim() || realIp || '127.0.0.1';

      // Basic UA parsing
      const isMobile = /mobile|android|iphone|ipad/i.test(ua);
      const deviceType = isMobile ? 'mobile' : /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop';
      let browserName = 'Unknown';
      if (/edg/i.test(ua)) browserName = 'Edge';
      else if (/chrome|chromium|crios/i.test(ua)) browserName = 'Chrome';
      else if (/firefox|fxios/i.test(ua)) browserName = 'Firefox';
      else if (/safari/i.test(ua)) browserName = 'Safari';
      else if (/opera|opr/i.test(ua)) browserName = 'Opera';

      return NextResponse.json([
        {
          id: `jwt-${session.userId}`,
          status: 'active',
          lastActiveAt: new Date().toISOString(),
          latestActivity: {
            browserName,
            deviceType,
            ipAddress,
            isMobile,
            city: null,
            country: null,
          },
        },
      ]);
    }

    return NextResponse.json([]);
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
