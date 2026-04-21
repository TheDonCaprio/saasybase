import { describe, expect, it, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../lib/logger', () => ({ Logger: loggerMock }));

import { BetterAuthProvider } from '../lib/auth-provider/providers/betterauth';

describe('BetterAuthProvider capability contract', () => {
  it('advertises only the local-mode capabilities currently supported', () => {
    const provider = new BetterAuthProvider();

    expect(provider.supportsFeature('organizations')).toBe(true);
    expect(provider.supportsFeature('session_management')).toBe(true);
    expect(provider.supportsFeature('oauth')).toBe(true);
    expect(provider.supportsFeature('magic_link')).toBe(true);
    expect(provider.supportsFeature('organization_invites')).toBe(false);
    expect(provider.supportsFeature('webhooks')).toBe(false);
    expect(provider.supportsFeature('middleware')).toBe(false);
  });

  it('treats inbound webhook verification as a no-op in local mode', async () => {
    const provider = new BetterAuthProvider();

    await expect(
      provider.verifyWebhook({
        body: '{}',
        headers: {},
      })
    ).resolves.toBeNull();

    expect(loggerMock.debug).toHaveBeenCalledWith(
      'BetterAuthProvider.verifyWebhook skipped',
      expect.objectContaining({
        message: 'Local Better Auth does not consume inbound auth webhooks.',
      })
    );
  });

  it('returns no standalone middleware object because middleware is resolved centrally', () => {
    const provider = new BetterAuthProvider();

    expect(provider.getMiddleware()).toBeNull();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});