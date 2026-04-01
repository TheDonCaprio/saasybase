import { describe, expect, it } from 'vitest';
import { isMaintenanceBypassPath } from '../lib/maintenance-mode';
import {
  requiresFreePlanResetTracking,
  shouldResetFreePlanTokensAt,
} from '../lib/free-plan-renewal';

describe('maintenance mode path bypasses', () => {
  it('allows admin, auth, webhook, cron, and health paths through', () => {
    expect(isMaintenanceBypassPath('/maintenance')).toBe(true);
    expect(isMaintenanceBypassPath('/admin')).toBe(true);
    expect(isMaintenanceBypassPath('/admin/settings')).toBe(true);
    expect(isMaintenanceBypassPath('/auth/magic-link')).toBe(true);
    expect(isMaintenanceBypassPath('/api/admin/settings')).toBe(true);
    expect(isMaintenanceBypassPath('/api/auth/callback/nodemailer')).toBe(true);
    expect(isMaintenanceBypassPath('/api/webhooks/payments')).toBe(true);
    expect(isMaintenanceBypassPath('/api/cron/process-expiry')).toBe(true);
    expect(isMaintenanceBypassPath('/api/health')).toBe(true);
    expect(isMaintenanceBypassPath('/sign-in')).toBe(true);
  });

  it('blocks regular app and public api paths', () => {
    expect(isMaintenanceBypassPath('/')).toBe(false);
    expect(isMaintenanceBypassPath('/pricing')).toBe(false);
    expect(isMaintenanceBypassPath('/dashboard')).toBe(false);
    expect(isMaintenanceBypassPath('/api/checkout')).toBe(false);
  });
});

describe('free plan renewal schedule', () => {
  const now = new Date(2026, 3, 1, 12, 0, 0, 0);

  it('tracks resets for daily and monthly renewals only', () => {
    expect(requiresFreePlanResetTracking('daily')).toBe(true);
    expect(requiresFreePlanResetTracking('monthly')).toBe(true);
    expect(requiresFreePlanResetTracking('one-time')).toBe(false);
    expect(requiresFreePlanResetTracking('unlimited')).toBe(false);
  });

  it('resets daily plans once per day', () => {
    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'daily',
        freeTokensLastResetAt: new Date(2026, 2, 31, 12, 0, 0, 0),
        now,
      })
    ).toBe(true);

    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'daily',
        freeTokensLastResetAt: new Date(2026, 3, 1, 0, 0, 0, 0),
        now,
      })
    ).toBe(false);
  });

  it('resets monthly plans once per month', () => {
    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'monthly',
        freeTokensLastResetAt: new Date(2026, 2, 31, 12, 0, 0, 0),
        now,
      })
    ).toBe(true);

    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'monthly',
        freeTokensLastResetAt: new Date(2026, 3, 1, 0, 0, 0, 0),
        now,
      })
    ).toBe(false);
  });

  it('never auto-resets one-time or unlimited plans', () => {
    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'one-time',
        freeTokensLastResetAt: null,
        now,
      })
    ).toBe(false);

    expect(
      shouldResetFreePlanTokensAt({
        renewalType: 'unlimited',
        freeTokensLastResetAt: null,
        now,
      })
    ).toBe(false);
  });
});
