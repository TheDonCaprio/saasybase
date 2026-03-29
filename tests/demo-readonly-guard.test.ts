import { describe, expect, it } from 'vitest';
import { isDemoReadOnlyExemptPath, shouldBlockDemoReadOnlyMutation } from '../lib/demo-readonly';

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
});
