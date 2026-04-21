import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthSafeMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_1' })));
const cancelPendingEmailChangeForActiveProviderMock = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const supportsManagedPendingEmailChangeMock = vi.hoisted(() => vi.fn(() => true));
const loggerMock = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../lib/auth', () => ({ getAuthSafe: getAuthSafeMock }));
vi.mock('../lib/pending-email-change', () => ({
  cancelPendingEmailChangeForActiveProvider: cancelPendingEmailChangeForActiveProviderMock,
  supportsManagedPendingEmailChange: supportsManagedPendingEmailChangeMock,
}));
vi.mock('../lib/logger', () => ({ Logger: loggerMock }));

import { DELETE } from '../app/api/user/pending-email-change/route';

describe('DELETE /api/user/pending-email-change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsManagedPendingEmailChangeMock.mockReturnValue(true);
  });

  it('cancels pending email changes through the active provider helper', async () => {
    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(cancelPendingEmailChangeForActiveProviderMock).toHaveBeenCalledWith('user_1');
  });

  it('returns 400 when the active provider does not manage pending email changes', async () => {
    supportsManagedPendingEmailChangeMock.mockReturnValue(false);

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Not supported for the active auth provider.');
    expect(cancelPendingEmailChangeForActiveProviderMock).not.toHaveBeenCalled();
  });
});