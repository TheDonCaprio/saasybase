import { describe, expect, it } from 'vitest';

import { getDefaultModeratorPermissions } from '../lib/moderator';

describe('moderator default permissions', () => {
  it('enables only support inbox access on fresh installs', () => {
    expect(getDefaultModeratorPermissions()).toEqual({
      users: false,
      transactions: false,
      purchases: false,
      subscriptions: false,
      support: true,
      notifications: false,
      blog: false,
      analytics: false,
      traffic: false,
      organizations: false,
    });
  });
});