// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Vitest will allow us to mock the settings module used by paidTokens.
vi.mock('../../lib/settings', () => ({
  shouldResetPaidTokensOnExpiryForUser: vi.fn(),
  shouldResetPaidTokensOnRenewalForPlanAutoRenew: vi.fn()
}));

import * as paidTokens from '../../lib/paidTokens';
import * as settings from '../../lib/settings';

describe('paidTokens.shouldClearPaidTokensOnExpiry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns true when explicit requestFlag is true', async () => {
    const res = await paidTokens.shouldClearPaidTokensOnExpiry({ userId: 'u1', requestFlag: true });
    expect(res).toBe(true);
  });

  it('returns false when explicit requestFlag is false', async () => {
    const res = await paidTokens.shouldClearPaidTokensOnExpiry({ userId: 'u1', requestFlag: false });
    expect(res).toBe(false);
  });

  it('honors subscription.clearPaidTokensOnExpiry when present', async () => {
    const sub = { id: 's1', clearPaidTokensOnExpiry: true } as any;
    const res = await paidTokens.shouldClearPaidTokensOnExpiry({ subscription: sub });
    expect(res).toBe(true);
  });

  it('honors subscription.clearPaidTokensOnExpiry=false when present', async () => {
    const sub = { id: 's1', clearPaidTokensOnExpiry: false } as any;
    const res = await paidTokens.shouldClearPaidTokensOnExpiry({ subscription: sub });
    expect(res).toBe(false);
  });

  it('falls back to settings.shouldResetPaidTokensOnExpiryForUser', async () => {
    (settings.shouldResetPaidTokensOnExpiryForUser as any).mockResolvedValueOnce(true);
    const res = await paidTokens.shouldClearPaidTokensOnExpiry({ userId: 'u2' });
    expect(res).toBe(true);
  });
});

describe('paidTokens.shouldClearPaidTokensOnRenewal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns true when explicit requestFlag is true', async () => {
    const res = await paidTokens.shouldClearPaidTokensOnRenewal(true, true);
    expect(res).toBe(true);
  });

  it('returns false when explicit requestFlag is false', async () => {
    const res = await paidTokens.shouldClearPaidTokensOnRenewal(true, false);
    expect(res).toBe(false);
  });

  it('falls back to settings.shouldResetPaidTokensOnRenewalForPlanAutoRenew', async () => {
    (settings.shouldResetPaidTokensOnRenewalForPlanAutoRenew as any).mockResolvedValueOnce(false);
    const res = await paidTokens.shouldClearPaidTokensOnRenewal(true);
    expect(res).toBe(false);
  });
});
