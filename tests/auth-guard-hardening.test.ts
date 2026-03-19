import { describe, expect, it, vi, beforeEach } from 'vitest';
import { raiseAuthGuardError } from '../lib/auth-guard-error';
import { Logger } from '../lib/logger';
import { incrementMetric } from '../lib/metrics';

vi.mock('../lib/logger', () => ({
  Logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/metrics', () => ({
  incrementMetric: vi.fn(),
}));

describe('Auth Guard Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('elevates FORBIDDEN errors to Logger.warn', () => {
    try {
      raiseAuthGuardError('FORBIDDEN', {
        source: 'test',
        reason: 'role-mismatch',
        userId: 'user_1234567890',
      });
    } catch {
      // expected throw
    }

    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auth guard denied access (FORBIDDEN)'),
      expect.objectContaining({
        code: 'FORBIDDEN',
        userId: 'user_user_123...',
        reason: 'role-mismatch',
      })
    );
    expect(Logger.debug).not.toHaveBeenCalled();
  });

  it('elevates unexpected UNAUTHENTICATED errors to Logger.warn', () => {
    try {
      raiseAuthGuardError('UNAUTHENTICATED', {
        source: 'test',
        reason: 'token-expired',
      });
    } catch {
      // expected throw
    }

    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auth guard denied access (UNAUTHENTICATED)'),
      expect.objectContaining({
        code: 'UNAUTHENTICATED',
        reason: 'token-expired',
      })
    );
  });

  it('uses Logger.debug for routine missing-session UNAUTHENTICATED errors', () => {
    try {
      raiseAuthGuardError('UNAUTHENTICATED', {
        source: 'test',
        reason: 'missing-session',
      });
    } catch {
      // expected throw
    }

    expect(Logger.debug).toHaveBeenCalledWith(
      'Auth guard denied access',
      expect.objectContaining({
        code: 'UNAUTHENTICATED',
        reason: 'missing-session',
      })
    );
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it('increments metrics with enhanced tags', () => {
    try {
      raiseAuthGuardError('FORBIDDEN', {
        source: 'test',
        reason: 'role-mismatch',
        section: 'organizations',
      });
    } catch {
      // expected throw
    }

    expect(incrementMetric).toHaveBeenCalledWith(
      'auth.guard.denied',
      1,
      expect.objectContaining({
        code: 'FORBIDDEN',
        source: 'test',
        section: 'organizations',
        reason: 'role-mismatch',
        isDevBypass: expect.any(String),
      })
    );
  });

  it('skips elevation during build phase', () => {
    const originalNextPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = 'phase-production-build';

    try {
      raiseAuthGuardError('FORBIDDEN', {
        source: 'test',
        reason: 'role-mismatch',
      });
    } catch {
      // expected throw
    }

    expect(Logger.debug).toHaveBeenCalled();
    expect(Logger.warn).not.toHaveBeenCalled();

    process.env.NEXT_PHASE = originalNextPhase;
  });
});
