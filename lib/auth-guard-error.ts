import { NextResponse } from 'next/server';
import { Logger } from './logger';
import type { ModeratorSection } from './moderator';
import { incrementMetric } from './metrics';

export type AuthGuardCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

export interface AuthGuardFailureMeta {
  source: string;
  reason: string;
  section?: ModeratorSection;
  userId?: string | null;
  extra?: Record<string, unknown>;
}

const CODE_TO_MESSAGE: Record<AuthGuardCode, string> = {
  UNAUTHENTICATED: 'Unauthorized',
  FORBIDDEN: 'Forbidden'
};

export class AuthGuardError extends Error {
  readonly code: AuthGuardCode;
  readonly status: number;
  readonly source: string;
  readonly reason: string;
  readonly section?: ModeratorSection;
  readonly userId?: string | null;
  readonly extra?: Record<string, unknown>;

  constructor(code: AuthGuardCode, meta: AuthGuardFailureMeta) {
    super(CODE_TO_MESSAGE[code]);
    this.name = 'AuthGuardError';
    this.code = code;
    this.status = code === 'UNAUTHENTICATED' ? 401 : 403;
    this.source = meta.source;
    this.reason = meta.reason;
    this.section = meta.section;
    this.userId = meta.userId ?? null;
    this.extra = meta.extra;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthGuardError);
    }
  }

  get publicMessage(): string {
    return this.message;
  }
}

function logAuthGuardFailure(code: AuthGuardCode, meta: AuthGuardFailureMeta): void {
  const { source, reason, section, userId, extra } = meta;
  const logPayload: Record<string, unknown> = {
    code,
    source,
    reason,
    section: section ?? null,
    userId: userId ? `user_${userId.slice(0, 8)}...` : null
  };

  if (extra && Object.keys(extra).length > 0) {
    logPayload.extra = extra;
  }

  // Auth guard denials are expected in non-authenticated contexts (static render,
  // build-time checks, unauthenticated requests). Emit a debug-level message to
  // avoid spamming warnings during builds while still recording the event in
  // logs when debug-level is enabled.
  Logger.debug('Auth guard denied access', logPayload);

  incrementMetric('auth.guard.denied', 1, {
    code,
    source,
    section: section ?? 'none',
    reason
  });
}

export function raiseAuthGuardError(code: AuthGuardCode, meta: AuthGuardFailureMeta): never {
  logAuthGuardFailure(code, meta);
  throw new AuthGuardError(code, meta);
}

export function isAuthGuardError(error: unknown): error is AuthGuardError {
  return error instanceof AuthGuardError;
}

export function toAuthGuardErrorResponse(error: unknown) {
  if (!isAuthGuardError(error)) return null;

  return NextResponse.json(
    {
      error: error.publicMessage,
      code: error.code,
      reason: error.reason
    },
    {
      status: error.status,
      headers: {
        'X-Auth-Error-Code': error.code,
        'Cache-Control': 'no-store'
      }
    }
  );
}
