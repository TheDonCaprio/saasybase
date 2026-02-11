import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  // NOTE: Dashboard pages already enforce auth via server-side guards
  // (see `requireAuth()` usage under `app/dashboard/*`). Keeping dashboard
  // out of edge middleware avoids Clerk dev-browser handshake redirect loops
  // that can bounce between `/sign-in` and `/dashboard` in development.
  '/admin(.*)',
  '/api/admin(.*)',
]);

// Allow a development bypass: when running locally you can set DEV_ADMIN_ID and
// the proxy will skip Clerk protection so tests and CLI tools can hit
// /admin and /api/admin routes. Production behavior is unchanged.
const devBypass = process.env.NODE_ENV !== 'production' && !!process.env.DEV_ADMIN_ID;

export default clerkMiddleware(async (auth: unknown, req: NextRequest) => {
  if (!isProtectedRoute(req)) {
    return;
  }

  if (devBypass) {
    // Skip protection in dev when DEV_ADMIN_ID is present — the API route
    // handlers themselves still call `requireAdmin()` which will use the
    // DEV_ADMIN_ID bypass when appropriate.
    return;
  }

  // Clerk's middleware API has changed across major versions:
  // - Some versions pass `auth` as a function (call it to get { userId, ... })
  // - Others pass `auth` as an object directly
  // Treat both as supported to avoid auth/redirect loops.
  let authResult: unknown = null;
  try {
    authResult = typeof auth === 'function' ? (auth as () => unknown)() : auth;
    if (
      authResult &&
      (typeof authResult === 'object' || typeof authResult === 'function') &&
      'then' in (authResult as Record<string, unknown>) &&
      typeof (authResult as Record<string, unknown>).then === 'function'
    ) {
      authResult = await (authResult as Promise<unknown>);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('proxy: auth resolution failed', error);
  }

  const userId =
    authResult && typeof authResult === 'object' && authResult !== null && 'userId' in authResult
      ? (authResult as { userId?: unknown }).userId
      : null;

  if (typeof userId === 'string' && userId.length > 0) {
    // User is authenticated; let them through to the page/API handler.
    // The handler will decide if they have sufficient permissions (admin vs moderator).
    return;
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
