import { authMiddleware, createAuthRouteMatcher } from '@/lib/auth-provider/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { shouldBlockDemoReadOnlyMutation } from '@/lib/demo-readonly';
import { prisma } from '@/lib/prisma';
import { isMaintenanceBypassPath, isMaintenanceModeEnabled } from '@/lib/maintenance-mode';
import { canUseLocalhostDevBypass } from '@/lib/dev-admin-bypass';
import { addVisitTrackingHeaders, getOrCreateVisitSessionId, shouldTrackVisit, trackVisit } from '@/lib/visit-tracking';
import { Logger } from '@/lib/logger';

function proxyWarn(message: string, error?: unknown) {
  if (process.env.NODE_ENV !== 'development') return;
  Logger.warn(message, error);
}

type ProxyAuthResult = {
  userId?: unknown;
  user?: unknown;
  isAuthenticated?: unknown;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(
    value
    && (typeof value === 'object' || typeof value === 'function')
    && 'then' in (value as Record<string, unknown>)
    && typeof (value as Record<string, unknown>).then === 'function'
  );
}

async function resolveAuthResult(auth: unknown): Promise<ProxyAuthResult | null> {
  try {
    const maybeResult = typeof auth === 'function' ? (auth as () => unknown)() : auth;
    const resolved = isPromiseLike(maybeResult) ? await maybeResult : maybeResult;
    return resolved && typeof resolved === 'object' ? (resolved as ProxyAuthResult) : null;
  } catch (error) {
    proxyWarn('proxy: auth resolution failed', error);
    return null;
  }
}

function extractAuthenticatedUserId(authResult: unknown): string | null {
  if (!authResult || typeof authResult !== 'object') {
    return null;
  }

  if ('userId' in authResult) {
    const userId = (authResult as { userId?: unknown }).userId;
    if (typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
  }

  if ('user' in authResult) {
    const user = (authResult as { user?: unknown }).user;
    if (user && typeof user === 'object' && 'id' in user) {
      const userId = (user as { id?: unknown }).id;
      if (typeof userId === 'string' && userId.length > 0) {
        return userId;
      }
    }
  }

  return null;
}

function isAuthenticated(authResult: ProxyAuthResult | null): boolean {
  if (!authResult) {
    return false;
  }

  if (typeof authResult.isAuthenticated === 'boolean') {
    return authResult.isAuthenticated;
  }

  return extractAuthenticatedUserId(authResult) !== null;
}

async function isAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role === 'ADMIN';
  } catch (error) {
    proxyWarn('proxy: admin role lookup failed', error);
    return false;
  }
}

const isProtectedRoute = createAuthRouteMatcher([
  // NOTE: Dashboard pages already enforce auth via server-side guards
  // (see `requireAuth()` usage under `app/dashboard/*`). Keeping dashboard
  // out of edge middleware avoids Clerk dev-browser handshake redirect loops
  // that can bounce between `/sign-in` and `/dashboard` in development.
  '/admin(.*)',
  '/api/admin(.*)',
]);

const demoReadOnlyMode = process.env.DEMO_READ_ONLY_MODE === 'true';

async function continueWithVisitTracking(req: NextRequest) {
  const response = NextResponse.next();

  if (!shouldTrackVisit(req)) {
    return response;
  }

  const existingSessionId = req.cookies.get('session-id')?.value;
  const sessionId = existingSessionId ?? getOrCreateVisitSessionId(req);
  await trackVisit(req, sessionId);
  return addVisitTrackingHeaders(response, existingSessionId ? undefined : sessionId);
}

export default authMiddleware(async (auth: unknown, req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  if (shouldBlockDemoReadOnlyMutation({
    enabled: demoReadOnlyMode,
    method: req.method,
    pathname,
  })) {
    return NextResponse.json(
      {
        error: 'Demo mode is read-only. Editing actions are disabled in this environment.',
      },
      {
        status: 403,
        headers: {
          'X-Demo-Read-Only': 'true',
        },
      }
    );
  }

  const authResult = await resolveAuthResult(auth);

  if (await isMaintenanceModeEnabled()) {
    const userId = extractAuthenticatedUserId(authResult);
    const adminBypass = await isAdminUser(userId);

    if (!adminBypass && !isMaintenanceBypassPath(pathname)) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json(
          {
            error: 'Maintenance mode is enabled. Please try again later.',
          },
          {
            status: 503,
            headers: {
              'Retry-After': '300',
              'X-Maintenance-Mode': 'true',
            },
          }
        );
      }

      const maintenanceUrl = new URL('/maintenance', req.url);
      const requestedPath = `${pathname}${req.nextUrl.search ?? ''}`;
      maintenanceUrl.searchParams.set('from', requestedPath);
      return NextResponse.rewrite(maintenanceUrl, {
        headers: {
          'X-Maintenance-Mode': 'true',
        },
      });
    }
  }

  if (!isProtectedRoute(req)) {
    return continueWithVisitTracking(req);
  }

  if (canUseLocalhostDevBypass(req.nextUrl.hostname)) {
    // Skip protection in dev when DEV_ADMIN_ID is present — the API route
    // handlers themselves still call `requireAdmin()` which will use the
    // DEV_ADMIN_ID bypass when appropriate.
    return;
  }

  // Clerk's middleware callback exposes an auth helper that is invoked as
  // `auth()` in current docs, while older integrations sometimes passed an
  // object directly. Support both shapes so a package upgrade does not change
  // how protected routes are recognized.
  if (isAuthenticated(authResult)) {
    // User is authenticated; let them through to the page/API handler.
    // The handler will decide if they have sufficient permissions (admin vs moderator).
    return continueWithVisitTracking(req);
  }

  // User is NOT authenticated. For API routes, return JSON 401.
  if (req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow direct access to the centralized access-denied page so guards can
  // redirect users there without being intercepted by proxy and bounced
  // to sign-in. This avoids redirect loops for moderators and keeps the UX
  // consistent.
  try {
    if (req.nextUrl.pathname === '/access-denied') {
      return;
    }
  } catch {
    // ignore parse errors and continue with standard sign-in redirect below
  }

  // For HTML routes, redirect to sign-in so they can authenticate.
  // After sign-in, Clerk will redirect them back here, at which point
  // they'll be authenticated and the page guard can check role/permissions.
  const search = req.nextUrl.search ?? '';
  const requestedPath = `${req.nextUrl.pathname}${search}`;
  const safeReturnPath = requestedPath.startsWith('/') ? requestedPath : '/dashboard';
  const signInUrl = new URL('/sign-in', req.url);
  signInUrl.searchParams.set('redirect_url', safeReturnPath);

  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
