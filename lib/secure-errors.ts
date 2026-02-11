// Centralized error handling and logging for the microSaaS
import { NextResponse } from 'next/server';
import { toError } from './runtime-guards';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: unknown;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string, details?: unknown) {
    super(
      field ? `${field}: ${message}` : message,
      'VALIDATION_ERROR',
      400,
      true,
      details
    );
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
  }
}

export class PaymentError extends AppError {
  constructor(message: string) {
    super(message, 'PAYMENT_ERROR', 402);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
  }
}

// Error response helper for API routes with enhanced security
export function createErrorResponse(error: unknown, defaultMessage: string = 'Internal server error') {
  const err = toError(error);
  if (err instanceof AppError && err.isOperational) {
    // Safe to expose operational errors. Only include context in development after sanitizing.
    const body: Record<string, unknown> = {
      error: safeErrorMessage(err.message),
      code: (err as AppError).code,
    };

    if (process.env.NODE_ENV === 'development') {
      const appErr = err as AppError;
      if (typeof appErr.context !== 'undefined') {
        body.context = sanitizeContext(appErr.context);
      }
    }

    return NextResponse.json(
      body,
      {
        status: (err as AppError).statusCode,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': crypto.randomUUID(), // Add request ID for tracking
        }
      }
    );
  }
  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production' ? defaultMessage : err.message;
  const requestId = crypto.randomUUID();

  return NextResponse.json(
    {
      error: message,
      code: 'INTERNAL_ERROR',
      requestId // Include request ID for support purposes
    },
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    }
  );
}

// Enhanced async error wrapper for API routes
export function withErrorHandling<T extends unknown[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      const err = toError(error);
      if (err instanceof AppError) throw err;

      // Convert unknown errors to AppError (don't expose internal details)
      throw new AppError(
        err.message || 'Unknown error occurred',
        'INTERNAL_ERROR',
        500,
        false
      );
    }
  };
}

// Convert unknown to a safe string message
export function safeErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

// Sanitize context so it can be safely JSON-serialized without leaking functions or prototypes
export function sanitizeContext(ctx: unknown): Record<string, unknown> {
  if (ctx && typeof ctx === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      if (typeof v === 'function') continue;
      if (typeof v === 'object') {
        try {
          out[k] = JSON.parse(JSON.stringify(v));
        } catch {
          out[k] = String(v);
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return { value: ctx };
}
