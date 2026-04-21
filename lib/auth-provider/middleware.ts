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

import {
  clerkMiddleware as clerkAuthMiddleware,
  createRouteMatcher as createClerkRouteMatcher,
} from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { Logger } from '@/lib/logger';

const AUTH_PROVIDER = process.env.AUTH_PROVIDER || 'clerk';

type MiddlewareHandler = (auth: unknown, req: NextRequest) => void | Response | Promise<void | Response>;
type MiddlewareWrapper = (req: NextRequest) => Promise<void | Response>;
type AuthMiddlewareExport = (handler: MiddlewareHandler) => MiddlewareWrapper;
type RouteMatcherRequest = { nextUrl: { pathname: string } };
type AuthRouteMatcher = (req: RouteMatcherRequest) => boolean;
type CreateAuthRouteMatcherExport = (patterns: string[]) => AuthRouteMatcher;
type LoadedAuthMiddleware = {
  authMiddleware: AuthMiddlewareExport;
  createAuthRouteMatcher: CreateAuthRouteMatcherExport;
};

// ---------------------------------------------------------------------------
// Clerk middleware
// ---------------------------------------------------------------------------

async function _getNextAuthMiddleware(): Promise<LoadedAuthMiddleware> {
  const { auth } = await import('../nextauth.config');

  // NextAuth's `auth` works as middleware when exported as the default
  // from middleware.ts. It populates `req.auth` with the session.
  // We wrap it to match the same shape as clerkMiddleware.
  const authMiddleware: AuthMiddlewareExport = (
    handler: MiddlewareHandler
  ) => {
    return auth(async (req: unknown) => {
      // Extract the session from req.auth (populated by NextAuth middleware)
      const request = req as NextRequest & { auth?: unknown };
      return handler(request.auth, request);
    }) as MiddlewareWrapper;
  };

  // Route matcher compatible with Clerk's createRouteMatcher API
  const createAuthRouteMatcher: CreateAuthRouteMatcherExport = (patterns: string[]) => {
    const regexes = patterns.map((p) => {
      // Convert glob-like patterns to regex: `/admin(.*)` → /^\/admin(.*)$/
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\.\\\*/, '.*')
        .replace(/\\\(/, '(')
        .replace(/\\\)/, ')');
      return new RegExp(`^${escaped}$`);
    });

    return (req: RouteMatcherRequest) => {
      return regexes.some((rx) => rx.test(req.nextUrl.pathname));
    };
  };

  return { authMiddleware, createAuthRouteMatcher };
}

async function _getBetterAuthMiddleware(): Promise<LoadedAuthMiddleware> {
  const { betterAuthServer } = await import('../better-auth');

  const authMiddleware: AuthMiddlewareExport = (
    handler: MiddlewareHandler
  ) => {
    return async (req: NextRequest) => {
      const auth = async () => {
        try {
          const session = await betterAuthServer.api.getSession({
            headers: req.headers,
          }) as {
            session: {
              id: string;
              activeOrganizationId?: string | null;
            };
            user: {
              id: string;
            };
          } | null;

          if (!session) {
            return null;
          }

          return {
            userId: session.user.id,
            orgId: session.session.activeOrganizationId ?? null,
            sessionId: session.session.id,
            user: {
              id: session.user.id,
            },
            isAuthenticated: true,
          };
        } catch (error) {
          Logger.warn('Better Auth proxy session lookup failed', { error });
          return null;
        }
      };

      return handler(auth, req);
    };
  };

  const createAuthRouteMatcher: CreateAuthRouteMatcherExport = (patterns: string[]) => {
    const regexes = patterns.map((p) => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\.\\\*/, '.*')
        .replace(/\\\(/, '(')
        .replace(/\\\)/, ')');
      return new RegExp(`^${escaped}$`);
    });

    return (req: RouteMatcherRequest) => {
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

export const authMiddleware: AuthMiddlewareExport = AUTH_PROVIDER === 'nextauth'
  ? (() => {
      // NextAuth: dynamic import wrapper
      return (handler: MiddlewareHandler) => {
        return async (req: NextRequest) => {
          const { authMiddleware: mw } = await _getNextAuthMiddleware();
          const wrapped = mw(handler);
          return wrapped(req);
        };
      };
    })()
  : AUTH_PROVIDER === 'betterauth'
    ? (() => {
        return (handler: MiddlewareHandler) => {
          return async (req: NextRequest) => {
            const { authMiddleware: mw } = await _getBetterAuthMiddleware();
            const wrapped = mw(handler);
            return wrapped(req);
          };
        };
      })()
  : (clerkAuthMiddleware as unknown as AuthMiddlewareExport);

export const createAuthRouteMatcher: CreateAuthRouteMatcherExport = AUTH_PROVIDER === 'nextauth'
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
  : AUTH_PROVIDER === 'betterauth'
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
  : (createClerkRouteMatcher as CreateAuthRouteMatcherExport);
