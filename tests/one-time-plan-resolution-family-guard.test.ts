import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { resolveOneTimeCheckoutDisposition } from '../lib/payment/one-time-plan-resolution';

describe('resolveOneTimeCheckoutDisposition plan-family guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns replace_non_recurring when active one-time family mismatches purchased one-time family', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_active_team',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      plan: { autoRenew: false, supportsOrganizations: true },
    });

    const result = await resolveOneTimeCheckoutDisposition({
      userId: 'user_1',
      now: new Date('2026-03-01T00:00:00.000Z'),
      planSupportsOrganizations: false,
    });

    expect(result.mode).toBe('replace_non_recurring');
    expect(result.latestActive?.id).toBe('sub_active_team');
  });

  it('returns extend_non_recurring when active and purchased one-time families match', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_active_personal',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      plan: { autoRenew: false, supportsOrganizations: false },
    });

    const result = await resolveOneTimeCheckoutDisposition({
      userId: 'user_1',
      now: new Date('2026-03-01T00:00:00.000Z'),
      planSupportsOrganizations: false,
    });

    expect(result.mode).toBe('extend_non_recurring');
  });
});
