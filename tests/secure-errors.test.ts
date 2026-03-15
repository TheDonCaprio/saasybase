import { describe, expect, it } from 'vitest';

import { AppError, createErrorResponse, sanitizeContext } from '../lib/secure-errors';

describe('lib/secure-errors', () => {
  it('returns sanitized context for operational errors in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

    const context = { userId: 'u_123', details: { a: 1 }, fn: () => 'hidden' };
    const error = new AppError('Bad input', 'VALIDATION_ERROR', 400, true, context);

    const response = createErrorResponse(error);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: 'Bad input',
        code: 'VALIDATION_ERROR',
        context: { userId: 'u_123', details: { a: 1 } },
      }),
    );

    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it('sanitizeContext strips function properties', () => {
    expect(sanitizeContext({ userId: 'u_123', fn: () => 'hidden' })).toEqual({ userId: 'u_123' });
  });
});