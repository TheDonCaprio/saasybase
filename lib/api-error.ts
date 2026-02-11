import { NextResponse } from 'next/server';

/**
 * Standardized API error response format.
 * All API routes should use this for consistent error handling.
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Custom API Error class for throwing standardized errors.
 * Can be caught and converted to proper JSON responses.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 400,
    options?: { code?: string; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }

  /**
   * Convert the error to a NextResponse JSON object.
   */
  toResponse(): NextResponse<ApiErrorResponse> {
    const body: ApiErrorResponse = { error: this.message };
    if (this.code) body.code = this.code;
    if (this.details) body.details = this.details;
    return NextResponse.json(body, { status: this.statusCode });
  }

  // Common factory methods for frequently used errors
  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(message, 401, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(message, 403, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(message, 404, { code: 'NOT_FOUND' });
  }

  static badRequest(message: string, code?: string): ApiError {
    return new ApiError(message, 400, { code: code || 'BAD_REQUEST' });
  }

  static conflict(message: string, code?: string): ApiError {
    return new ApiError(message, 409, { code: code || 'CONFLICT' });
  }

  static rateLimited(message = 'Too many requests'): ApiError {
    return new ApiError(message, 429, { code: 'RATE_LIMITED' });
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(message, 500, { code: 'INTERNAL_ERROR' });
  }

  static paymentRequired(message: string): ApiError {
    return new ApiError(message, 402, { code: 'PAYMENT_REQUIRED' });
  }
}

/**
 * Helper to create a standardized error response.
 * Use this when you don't need to throw an error.
 */
export function errorResponse(
  message: string,
  statusCode: number = 400,
  options?: { code?: string; details?: Record<string, unknown> }
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = { error: message };
  if (options?.code) body.code = options.code;
  if (options?.details) body.details = options.details;
  return NextResponse.json(body, { status: statusCode });
}

/**
 * Helper to handle errors in API routes.
 * Converts ApiError instances to proper responses, handles unknown errors gracefully.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message;
    return errorResponse(message, 500, { code: 'INTERNAL_ERROR' });
  }

  // Fallback for unknown error types
  return errorResponse('An unexpected error occurred', 500, { code: 'INTERNAL_ERROR' });
}
