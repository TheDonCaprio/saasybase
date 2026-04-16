import { describe, expect, it } from 'vitest';

import { getOrganizationSuspensionStatus, getUserSuspensionStatus } from '../lib/account-suspension';

describe('account suspension helpers', () => {
  it('treats users with suspendedAt as suspended', () => {
    const status = getUserSuspensionStatus({
      suspendedAt: new Date('2026-04-16T10:00:00.000Z'),
      suspensionReason: 'Terms violation',
      suspensionIsPermanent: true,
    });

    expect(status.isSuspended).toBe(true);
    expect(status.suspensionReason).toBe('Terms violation');
    expect(status.suspensionIsPermanent).toBe(true);
  });

  it('treats organizations without suspendedAt as active', () => {
    const status = getOrganizationSuspensionStatus({
      suspendedAt: null,
      suspensionReason: null,
    });

    expect(status.isSuspended).toBe(false);
    expect(status.suspensionReason).toBe(null);
  });
});