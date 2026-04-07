import { describe, expect, it } from 'vitest';
import { shouldReloadOnBackNavigation } from '@/lib/auth-provider/client/should-reload-on-back-navigation';

describe('shouldReloadOnBackNavigation', () => {
  it('returns true for bfcache restores', () => {
    expect(shouldReloadOnBackNavigation({ persisted: true })).toBe(true);
  });

  it('returns true for back-forward navigation entries', () => {
    expect(shouldReloadOnBackNavigation({ persisted: false }, 'back_forward')).toBe(true);
  });

  it('returns false for normal navigations', () => {
    expect(shouldReloadOnBackNavigation({ persisted: false }, 'navigate')).toBe(false);
  });
});