/**
 * Auth Provider – Middleware Helpers (Conditional Dispatch)
 * ===========================================================
 * Server-side only. Uses `AUTH_PROVIDER` (not NEXT_PUBLIC_ since this
 * runs in the Edge/Node middleware, not the browser).
 *
 * For Clerk: re-exports `clerkMiddleware` and `createRouteMatcher`.
 * For NextAuth: wraps NextAuth's `auth` as middleware + provides a
 *               route matcher compatible with the same API.
 */

const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'clerk';

// ---------------------------------------------------------------------------
// Clerk middleware
// ---------------------------------------------------------------------------

async function _getClerkMiddleware() {
  const mod = await import('@clerk/nextjs/server');
  return {
    authMiddleware: mod.clerkMiddleware,
    createAuthRouteMatcher: mod.createRouteMatcher,
  };
}

// ---------------------------------------------------------------------------
// NextAuth middleware
// ---------------------------------------------------------------------------

async function _getNextAuthMiddleware() {
  const { auth } = await import('../nextauth.config');

  // NextAuth's `auth` works as middleware when exported as the default
  // from middleware.ts. It populates `req.auth` with the session.
  // We wrap it to match the same shape as clerkMiddleware.
  const authMiddleware = (
    handler: (auth: unknown, req: import('next/server').NextRequest) => void | Response | Promise<void | Response>
  ) => {
    return auth(async (req: unknown) => {
      // Extract the session from req.auth (populated by NextAuth middleware)
      const request = req as import('next/server').NextRequest & { auth?: unknown };
      return handler(request.auth, request);
    }) as unknown;
  };

  // Route matcher compatible with Clerk's createRouteMatcher API
  const createAuthRouteMatcher = (patterns: string[]) => {
    const regexes = patterns.map((p) => {
      // Convert glob-like patterns to regex: `/admin(.*)` → /^\/admin(.*)$/
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\.\\\*/, '.*')
        .replace(/\\\(/, '(')
        .replace(/\\\)/, ')');
      return new RegExp(`^${escaped}$`);
    });

    return (req: import('next/server').NextRequest) => {
      return regexes.some((rx) => rx.test(req.nextUrl.pathname));
    };
  };

  return { authMiddleware, createAuthRouteMatcher };
}

// ---------------------------------------------------------------------------
// Conditional export
// ---------------------------------------------------------------------------

// For synchronous import compatibility in proxy.ts, we use a sync wrapper
// that returns the middleware function (which itself is async-compatible).
// The proxy.ts exports `authMiddleware(async (auth, req) => { ... })`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authMiddleware: any = AUTH_PROVIDER === 'nextauth'
  ? (() => {
      // NextAuth: dynamic import wrapper
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (handler: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (req: any) => {
          const { authMiddleware: mw } = await _getNextAuthMiddleware();
          const wrapped = mw(handler);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (wrapped as any)(req);
        };
      };
    })()
  : (() => {
      // Clerk: synchronous re-export (clerkMiddleware is synchronous to call)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@clerk/nextjs/server');
      return mod.clerkMiddleware;
    })();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAuthRouteMatcher: any = AUTH_PROVIDER === 'nextauth'
  ? (patterns: string[]) => {
      const regexes = patterns.map((p) => {
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\.\\\*/, '.*')
          .replace(/\\\(/, '(')
          .replace(/\\\)/, ')');
        return new RegExp(`^${escaped}$`);
      });
      return (req: { nextUrl: { pathname: string } }) => {
        return regexes.some((rx) => rx.test(req.nextUrl.pathname));
      };
    }
  : (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@clerk/nextjs/server');
      return mod.createRouteMatcher;
    })();
