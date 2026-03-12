import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());
const getActiveTeamSubscriptionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  organization: {
    findFirst: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/organization-access', () => ({ getActiveTeamSubscription: getActiveTeamSubscriptionMock }));

import { enforceTeamWorkspaceProvisioningGuard } from '../lib/dashboard-workspace-guard';

describe('dashboard workspace provisioning guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects users with a current team subscription and no workspace', async () => {
    getActiveTeamSubscriptionMock.mockResolvedValue({ id: 'sub_1' });
    prismaMock.organization.findFirst.mockResolvedValue(null);

    await enforceTeamWorkspaceProvisioningGuard('user_1');

    expect(getActiveTeamSubscriptionMock).toHaveBeenCalledWith('user_1', { includeGrace: false });
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/team?fromCheckout=1&provision=1');
  });

  it('does not redirect users whose team access only survives via grace after force-cancel/expiry', async () => {
    getActiveTeamSubscriptionMock.mockResolvedValue(null);

    await enforceTeamWorkspaceProvisioningGuard('user_1');

    expect(getActiveTeamSubscriptionMock).toHaveBeenCalledWith('user_1', { includeGrace: false });
    expect(prismaMock.organization.findFirst).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});