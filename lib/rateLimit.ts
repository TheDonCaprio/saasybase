import { RateLimitError } from './errors';
import { Logger } from './logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { toError } from './runtime-guards';
import { getRequestIp } from './request-ip';

const CLEANUP_THRESHOLD = 100;
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let cleanupCounter = 0;

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  skipOnError?: boolean;
  message?: string;
}

export interface RateLimitResult {
  success: boolean;
  allowed: boolean;
  remaining?: number;
  reset: number;
  resetTime?: Date;
  hits?: number;
  error?: string;
}

export interface RateLimitContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
}
// Enhanced rate limiting with persistent storage
export async function rateLimit(
  key: string,
  config: RateLimitConfig,
  context: RateLimitContext = {}
): Promise<RateLimitResult> {
  try {
    const { limit, windowMs } = config;
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const windowEnd = new Date(windowStartMs + windowMs);

    const contextData = {
      actorId: context.actorId ?? null,
      route: context.route ?? null,
      method: context.method ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ? context.userAgent.slice(0, 255) : null
    };

    const txResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitBucket.findUnique({
        where: { rate_limit_key_window_unique: { key, windowStart } }
      });

      if (!existing) {
        const created = await tx.rateLimitBucket.create({
          data: {
            key,
            windowStart,
            windowEnd,
            hits: 1,
            firstRequestAt: nowDate,
            lastRequestAt: nowDate,
            ...contextData
          }
        });

        return { bucket: created, hits: 1, allowed: true } as const;
      }

      const nextHits = existing.hits + 1;
      const updatedMetadata = {
        actorId: contextData.actorId ?? existing.actorId,
        route: contextData.route ?? existing.route,
        method: contextData.method ?? existing.method,
        ip: contextData.ip ?? existing.ip,
        userAgent: contextData.userAgent ?? existing.userAgent,
        lastRequestAt: nowDate
      };

      if (nextHits > limit) {
        await tx.rateLimitBucket.update({
          where: { rate_limit_key_window_unique: { key, windowStart } },
          data: updatedMetadata
        });

        return { bucket: existing, hits: existing.hits, allowed: false } as const;
      }

      const updated = await tx.rateLimitBucket.update({
        where: { rate_limit_key_window_unique: { key, windowStart } },
        data: {
          hits: nextHits,
          ...updatedMetadata
        }
      });

      return { bucket: updated, hits: nextHits, allowed: true } as const;
    });

    if (++cleanupCounter >= CLEANUP_THRESHOLD) {
      cleanupCounter = 0;
      const cutoff = new Date(nowMs - CLEANUP_MAX_AGE_MS);
      void prisma.rateLimitBucket
        .deleteMany({ where: { windowEnd: { lt: cutoff } } })
        .catch((err: unknown) =>
          Logger.warn('Rate limiter cleanup failed', { error: toError(err).message })
        );
    }

    if (!txResult.allowed) {
      Logger.warn('Rate limit exceeded', {
        key: key.substring(0, 32),
        limit,
        windowMs,
        actorId: context.actorId ?? undefined
      });

      return {
        success: true,
        allowed: false,
        remaining: 0,
        reset: txResult.bucket.windowEnd.getTime(),
        resetTime: txResult.bucket.windowEnd,
        hits: txResult.hits,
        error: config.message || 'Rate limit exceeded'
      };
    }

    return {
      success: true,
      allowed: true,
      remaining: Math.max(0, limit - txResult.hits),
      reset: txResult.bucket.windowEnd.getTime(),
      resetTime: txResult.bucket.windowEnd,
      hits: txResult.hits
    };
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Rate limiting error', { message: err.message, stack: err.stack });

    if (config.skipOnError) {
      return {
        success: false,
        allowed: true,
        reset: Date.now() + config.windowMs,
        error: 'Rate limit check failed, allowing request'
      };
    }

    return {
      success: false,
      allowed: false,
      reset: Date.now() + config.windowMs,
      error: 'Rate limit service unavailable'
    };
  }
}

// Enhanced rate limit middleware for API routes
export function withRateLimit(
  identifier: (req: NextRequest) => string | Promise<string>,
  config: RateLimitConfig
) {
  return async (req: NextRequest, handler: () => Promise<Response>) => {
    try {
      const key = await identifier(req);
      const result = await rateLimit(key, config, {
        route: req.nextUrl.pathname,
        method: req.method,
        ip: getClientIP(req),
        userAgent: req.headers.get('user-agent')
      });
      
      if (!result.success && !result.allowed) {
        Logger.error('Rate limit service error', { key: key.substring(0, 10) + '...', error: result.error });
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      }
      
      if (!result.allowed) {
        const resetIn = Math.ceil((result.reset - Date.now()) / 1000);
        return NextResponse.json(
          { 
            error: result.error || 'Rate limit exceeded',
            retryAfter: resetIn
          },
          { 
            status: 429,
            headers: {
              'Retry-After': resetIn.toString(),
              'X-RateLimit-Limit': config.limit.toString(),
              'X-RateLimit-Reset': result.reset.toString(),
            }
          }
        );
      }
      
      const response = await handler();
      
      // Add rate limit headers to successful responses
      if (result.remaining !== undefined) {
        response.headers.set('X-RateLimit-Limit', config.limit.toString());
        response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
        response.headers.set('X-RateLimit-Reset', result.reset.toString());
      }
      
      return response;
    } catch (error) {
      // Next.js runs middleware while generating static pages during `next build`.
      // The rate limiter relies on persistent storage (Prisma/DB) which may be
      // unavailable in CI/build environments. During build, fail open so the
      // build can complete.
      const isNextBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
      if (isNextBuildPhase && !(error instanceof RateLimitError)) {
        return handler();
      }

      if (config.skipOnError && !(error instanceof RateLimitError)) {
        return handler();
      }

      const err = toError(error);
      Logger.error('Rate limit middleware error', { message: err.message, stack: err.stack });

      throw error;
    }
  };
}

// Common rate limit configurations with enhanced security
export const RATE_LIMITS = {
  API_GENERAL: { 
    limit: 100, 
    windowMs: 15 * 60 * 1000, // 100 requests per 15 minutes
    message: 'Too many API requests'
  },
  API_SENSITIVE: { 
    limit: 10, 
    windowMs: 15 * 60 * 1000, // 10 requests per 15 minutes
    message: 'Too many sensitive operations'
  },
  CHECKOUT: { 
    limit: 5, 
    windowMs: 60 * 1000, // 5 checkouts per minute
    message: 'Too many checkout attempts'
  },
  WEBHOOK: { 
    limit: 1000, 
    windowMs: 60 * 1000, // 1000 webhooks per minute
    skipOnError: true 
  },
  EXPORT: { 
    limit: 20, 
    windowMs: 60 * 1000, // 20 exports per minute
    message: 'Export limit exceeded'
  },
  AUTH: {
    limit: 20,
    windowMs: 15 * 60 * 1000, // 20 auth attempts per 15 minutes
    message: 'Too many authentication attempts'
  }
} as const;

// Helper function to get client IP for rate limiting
export function getClientIP(req: NextRequest): string {
  // Try multiple headers for IP detection
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback to header-based extraction (NextRequest.ip is not available in newer Next.js)
  return getRequestIp(req) ?? 'unknown';
}

// Helper function to create rate limit key
export function createRateLimitKey(req: NextRequest, prefix: string = 'api'): string {
  const ip = getClientIP(req);
  const userAgent = req.headers.get('user-agent')?.slice(0, 50) || 'unknown';
  
  // Create a composite key for better rate limiting
  return `${prefix}:${ip}:${userAgent}`;
}

// Helper for admin-oriented actions. Use actorId when available, otherwise fallback to IP.
export async function adminRateLimit(
  actorId: string | null | undefined,
  req: NextRequest,
  prefix: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const ip = getClientIP(req);
  const key = actorId ? `${prefix}:user:${actorId}` : `${prefix}:ip:${ip}`;
  return rateLimit(key, config, {
    actorId: actorId ?? null,
    ip,
    userAgent: req.headers.get('user-agent') ?? null,
    route: req.nextUrl?.pathname ?? null,
    method: req.method ?? null
  });
}
