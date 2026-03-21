import { describe, expect, it } from 'vitest';

import { getVisiblePendingViewerInvites, type ViewerPendingTeamInvite } from '../lib/team-invite-utils';

const invites: ViewerPendingTeamInvite[] = [
  {
    id: 'invite-1',
    token: 'token-1',
    email: 'user@example.com',
    role: 'MEMBER',
    organization: {
      id: 'org-current',
      name: 'Current Workspace',
    },
  },
  {
    id: 'invite-2',
    token: 'token-2',
    email: 'user@example.com',
    role: 'ADMIN',
    organization: {
      id: 'org-second',
      name: 'Second Workspace',
    },
  },
  {
    id: 'invite-3',
    token: 'token-3',
    email: 'user@example.com',
    role: 'MEMBER',
    organization: {
      id: 'org-second',
      name: 'Second Workspace Duplicate',
    },
  },
  {
    id: 'invite-4',
    token: 'token-4',
    email: 'user@example.com',
    role: 'MEMBER',
    organization: {
      id: 'org-third',
      name: 'Third Workspace',
    },
  },
];

describe('getVisiblePendingViewerInvites', () => {
  it('filters out the active workspace invite and keeps other workspaces', () => {
    expect(getVisiblePendingViewerInvites(invites, 'org-current')).toEqual([
      invites[1],
      invites[3],
    ]);
  });

  it('deduplicates multiple invites for the same workspace', () => {
    expect(getVisiblePendingViewerInvites(invites, null)).toEqual([
      invites[0],
      invites[1],
      invites[3],
    ]);
  });

  it('returns an empty array when no invites are available', () => {
    expect(getVisiblePendingViewerInvites(undefined, 'org-current')).toEqual([]);
  });
});