// Centralized error handling and logging for the microSaaS
import { NextResponse } from 'next/server';
import { Logger as SecureLogger } from './logger';
import { randomUUID } from 'crypto';

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

// Logging utility
export class Logger {
  private static log(level: 'info' | 'warn' | 'error', message: string, meta?: unknown) {
    const timestamp = new Date().toISOString();
    const logEntry: Record<string, unknown> = {
      timestamp,
      level,
      message
    };

    if (meta !== undefined) {
      logEntry.meta = meta;
    }

    if (process.env.NODE_ENV === 'development') {
      console[level](`[${timestamp}] ${level.toUpperCase()}: ${message}`, meta || '');
    } else {
      // In production, you might want to send to external logging service
      console[level](JSON.stringify(logEntry));
    }
  }

  static info(message: string, meta?: unknown) {
    this.log('info', message, meta);
  }

  static warn(message: string, meta?: unknown) {
    this.log('warn', message, meta);
  }

  static error(message: string, error?: unknown, meta?: unknown) {
    // Build a safe error payload from unknown input
    let errorPayload: Record<string, unknown> | undefined;

    if (error) {
      if (error instanceof Error) {
        errorPayload = {
          message: error.message,
          stack: error.stack
        } as Record<string, unknown>;

        if (error instanceof AppError) {
          errorPayload.code = error.code;
          errorPayload.statusCode = error.statusCode;
        }
      } else if (typeof error === 'object' && error !== null) {
        const eRec = error as Record<string, unknown>;
        errorPayload = {};
        if (typeof eRec['message'] === 'string') errorPayload.message = eRec['message'] as string;
        if (typeof eRec['stack'] === 'string') errorPayload.stack = eRec['stack'] as string;
      }
    }

    // Merge meta (if it's an object) with the error payload in a safe way
    let combinedMeta: unknown = meta ?? undefined;
    if (errorPayload) {
      const metaRec = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
      combinedMeta = {
        ...metaRec,
        error: errorPayload
      } as Record<string, unknown>;
    }

    this.log('error', message, combinedMeta);
  }
}

// Error response helper for API routes with enhanced security
export function createErrorResponse(error: Error | AppError, defaultMessage: string = 'Internal server error') {
  // Log the error securely
  SecureLogger.error('API Error', error);

  if (error instanceof AppError && error.isOperational) {
    // Safe to expose operational errors
    const body: Record<string, unknown> = {
      error: error.message,
      code: error.code
    };

    if (error.context && process.env.NODE_ENV === 'development') {
      body.context = error.context;
    }

    return NextResponse.json(body, {
      status: error.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': randomUUID() // Add request ID for tracking
      }
    });
  }

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production' ? defaultMessage : error.message;
  const requestId = randomUUID();
  
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
    } catch (error) {
      // Log unexpected errors
      SecureLogger.error('Unhandled error in API route', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      // Convert unknown errors to AppError
      throw new AppError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'INTERNAL_ERROR',
        500,
        false
      );
    }
  };
}

// Safe error logging that doesn't expose sensitive data
export function logSecurely(level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  SecureLogger[level](message, data as unknown);
}
