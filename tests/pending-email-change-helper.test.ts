import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({ providerName: 'nextauth' }));
const getPendingEmailChangeForUserMock = vi.hoisted(() => vi.fn());
const cancelPendingEmailChangeMock = vi.hoisted(() => vi.fn());
const getBetterAuthPendingEmailChangeForUserMock = vi.hoisted(() => vi.fn());
const cancelBetterAuthPendingEmailChangeMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/nextauth-email-verification', () => ({
  getPendingEmailChangeForUser: getPendingEmailChangeForUserMock,
  cancelPendingEmailChange: cancelPendingEmailChangeMock,
}));
vi.mock('../lib/better-auth-email-change', () => ({
  getBetterAuthPendingEmailChangeForUser: getBetterAuthPendingEmailChangeForUserMock,
  cancelBetterAuthPendingEmailChange: cancelBetterAuthPendingEmailChangeMock,
}));

import {
  cancelPendingEmailChangeForActiveProvider,
  getPendingEmailChangeForActiveProvider,
  supportsManagedPendingEmailChange,
} from '../lib/pending-email-change';

describe('pending email change helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.providerName = 'nextauth';
  });

  it('uses the NextAuth backend when NextAuth is active', async () => {
    getPendingEmailChangeForUserMock.mockResolvedValueOnce({
      newEmail: 'next@example.com',
      expires: new Date('2026-04-21T12:00:00.000Z'),
    });

    const pending = await getPendingEmailChangeForActiveProvider('user_1');
    await cancelPendingEmailChangeForActiveProvider('user_1');

    expect(pending).toMatchObject({ newEmail: 'next@example.com' });
    expect(getPendingEmailChangeForUserMock).toHaveBeenCalledWith('user_1');
    expect(cancelPendingEmailChangeMock).toHaveBeenCalledWith('user_1');
    expect(getBetterAuthPendingEmailChangeForUserMock).not.toHaveBeenCalled();
  });

  it('uses the Better Auth backend when Better Auth is active', async () => {
    authServiceMock.providerName = 'betterauth';
    getBetterAuthPendingEmailChangeForUserMock.mockResolvedValueOnce({
      newEmail: 'next@example.com',
      expires: new Date('2026-04-21T12:00:00.000Z'),
    });

    const pending = await getPendingEmailChangeForActiveProvider('user_1');
    await cancelPendingEmailChangeForActiveProvider('user_1');

    expect(pending).toMatchObject({ newEmail: 'next@example.com' });
    expect(getBetterAuthPendingEmailChangeForUserMock).toHaveBeenCalledWith('user_1');
    expect(cancelBetterAuthPendingEmailChangeMock).toHaveBeenCalledWith('user_1');
    expect(getPendingEmailChangeForUserMock).not.toHaveBeenCalled();
  });

  it('reports unsupported providers cleanly', async () => {
    authServiceMock.providerName = 'clerk';

    expect(supportsManagedPendingEmailChange()).toBe(false);
    await expect(getPendingEmailChangeForActiveProvider('user_1')).resolves.toBeNull();
    await expect(cancelPendingEmailChangeForActiveProvider('user_1')).resolves.toBeNull();
  });
});