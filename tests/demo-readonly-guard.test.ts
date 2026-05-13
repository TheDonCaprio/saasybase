import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoReadOnlyCheckoutInitiationPath, isDemoReadOnlyExemptPath, isDemoReadOnlyIdentityExempt, shouldBlockDemoReadOnlyMutation } from '../lib/demo-readonly';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo read-only guard', () => {
  it('does not block when mode is disabled', () => {
    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: false,
        method: 'POST',
        pathname: '/api/admin/settings',
      })
    ).toBe(false);
  });

  it('blocks mutating admin API calls when mode is enabled', () => {
    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'POST',
        pathname: '/api/admin/settings',
      })
    ).toBe(true);

    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'DELETE',
        pathname: '/api/admin/users/user_123',
      })
    ).toBe(true);
  });

  it('allows read-only API calls in demo mode', () => {
    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'GET',
        pathname: '/api/admin/settings?key=SITE_NAME',
      })
    ).toBe(false);
  });

  it('blocks checkout initiation paths even when they use GET', () => {
    expect(isDemoReadOnlyCheckoutInitiationPath('/api/checkout')).toBe(true);
    expect(isDemoReadOnlyCheckoutInitiationPath('/api/checkout/embedded')).toBe(true);
    expect(isDemoReadOnlyCheckoutInitiationPath('/api/checkout/confirm')).toBe(false);

    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'GET',
        pathname: '/api/checkout/embedded',
      })
    ).toBe(true);
  });

  it('allows auth and webhook write paths', () => {
    expect(isDemoReadOnlyExemptPath('/api/auth/login-status')).toBe(true);
    expect(isDemoReadOnlyExemptPath('/api/webhooks/payments')).toBe(true);
    expect(isDemoReadOnlyExemptPath('/api/stripe/webhook')).toBe(true);

    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'POST',
        pathname: '/api/auth/login-status',
      })
    ).toBe(false);

    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'POST',
        pathname: '/api/webhooks/payments',
      })
    ).toBe(false);
  });

  it('allows exact exempt user IDs to bypass demo read-only mode', () => {
    vi.stubEnv('DEMO_READ_ONLY_EXEMPT_USER_IDS', 'user_123, user_456');

    expect(isDemoReadOnlyIdentityExempt({ userId: 'user_123' })).toBe(true);
    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'POST',
        pathname: '/api/admin/settings',
        userId: 'user_123',
      })
    ).toBe(false);
  });

  it('allows exact exempt emails to bypass demo read-only mode', () => {
    vi.stubEnv('DEMO_READ_ONLY_EXEMPT_EMAILS', 'owner@example.com');

    expect(isDemoReadOnlyIdentityExempt({ email: 'OWNER@example.com' })).toBe(true);
    expect(
      shouldBlockDemoReadOnlyMutation({
        enabled: true,
        method: 'POST',
        pathname: '/api/admin/settings',
        email: 'owner@example.com',
      })
    ).toBe(false);
  });
});
