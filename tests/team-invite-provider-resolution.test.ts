import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(async (): Promise<{ userId: string; orgId: string | null }> => ({ userId: 'user_1', orgId: 'provider_org_1' })),
  getUser: vi.fn(async () => ({ email: 'invitee@example.com' })),
  supportsFeature: vi.fn(() => true),
  revokeOrganizationInvitation: vi.fn(async () => undefined),
}));

const prismaMock = vi.hoisted(() => ({
  organizationInvite: {
    findUnique: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
  organizationMembership: {
    count: vi.fn(async () => 0),
    findUnique: vi.fn(async () => null),
  },
  user: {
    findUnique: vi.fn(async () => ({ name: 'Owner User' })),
  },
}));

const ensureUserExistsMock = vi.hoisted(() => vi.fn(async () => ({ email: 'invitee@example.com' })));
const addOrConfirmClerkMembershipMock = vi.hoisted(() => vi.fn(async () => undefined));
const markInviteAcceptedMock = vi.hoisted(() => vi.fn(async () => undefined));
const syncOrganizationMembershipMock = vi.hoisted(() => vi.fn(async () => undefined));
const expireOrganizationInviteMock = vi.hoisted(() => vi.fn(async () => undefined));
const fetchTeamDashboardStateMock = vi.hoisted(() => vi.fn(async () => ({ access: { allowed: true, kind: 'OWNER' }, organization: null })));
const sendEmailMock = vi.hoisted(() => vi.fn(async () => ({ success: true })));

vi.mock('@/lib/auth-provider', () => ({ authService: authServiceMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/user-helpers', () => ({ ensureUserExists: ensureUserExistsMock }));
vi.mock('../lib/clerk-memberships', () => ({ addOrConfirmClerkMembership: addOrConfirmClerkMembershipMock }));
vi.mock('../lib/teams', () => ({
  markInviteAccepted: markInviteAcceptedMock,
  syncOrganizationMembership: syncOrganizationMembershipMock,
  expireOrganizationInvite: expireOrganizationInviteMock,
}));
vi.mock('../lib/team-dashboard', () => ({ fetchTeamDashboardState: fetchTeamDashboardStateMock }));
vi.mock('../lib/email', () => ({
  sendEmail: sendEmailMock,
  getSiteName: vi.fn(async () => 'SaaSyBase'),
  getSupportEmail: vi.fn(async () => 'support@example.com'),
}));
vi.mock('../lib/env', () => ({ getEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })) }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST as acceptPost } from '../app/api/team/invite/accept/route';
import { POST as resendPost } from '../app/api/team/invite/resend/route';
import { POST as declinePost } from '../app/api/team/invite/decline/route';

describe('team invite provider organization id resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.getSession.mockResolvedValue({ userId: 'user_1', orgId: 'provider_org_1' });
    authServiceMock.getUser.mockResolvedValue({ email: 'invitee@example.com' });
    authServiceMock.supportsFeature.mockReturnValue(true);
    prismaMock.organizationMembership.count.mockResolvedValue(0);
    prismaMock.organizationMembership.findUnique.mockResolvedValue(null);
  });

  it('accept uses the provider organization id when adding membership', async () => {
    prismaMock.organizationInvite.findUnique.mockResolvedValue({
      token: 'invite_token_1',
      email: 'invitee@example.com',
      status: 'PENDING',
      role: 'MEMBER',
      organizationId: 'org_local_1',
      organization: {
        id: 'org_local_1',
        providerOrganizationId: 'provider_org_1',
        seatLimit: 5,
        plan: { organizationSeatLimit: 5 },
      },
    });

    const req = new NextRequest('http://localhost/api/team/invite/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invite_token_1' }),
    });

    const res = await acceptPost(req);

    expect(res.status).toBe(200);
    expect(addOrConfirmClerkMembershipMock).toHaveBeenCalledWith({
      organizationId: 'provider_org_1',
      userId: 'user_1',
      role: 'org:member',
    });
    expect(syncOrganizationMembershipMock).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_local_1',
      providerOrganizationId: 'provider_org_1',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
  });

  it('resend authorizes when the active org reference matches the provider organization id', async () => {
    prismaMock.organizationInvite.findUnique.mockResolvedValue({
      token: 'invite_token_2',
      email: 'invitee@example.com',
      organizationId: 'org_local_1',
    });
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_local_1',
      ownerUserId: 'user_1',
      name: 'Acme',
      slug: 'acme',
      providerOrganizationId: 'provider_org_1',
    });

    const req = new NextRequest('http://localhost/api/team/invite/resend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invite_token_2' }),
    });

    const res = await resendPost(req);

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalled();
    expect(fetchTeamDashboardStateMock).toHaveBeenCalledWith('user_1', {
      forceSync: true,
      activeOrganizationId: 'provider_org_1',
    });
  });

  it('decline revokes the provider invitation using the provider organization id', async () => {
    authServiceMock.getSession.mockResolvedValueOnce({ userId: 'user_2', orgId: null });
    prismaMock.organizationInvite.findUnique.mockResolvedValue({
      token: 'invite_token_3',
      organizationId: 'org_local_1',
    });
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org_local_1',
      providerOrganizationId: 'provider_org_1',
      ownerUserId: 'owner_1',
    });

    const req = new NextRequest('http://localhost/api/team/invite/decline', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'invite_token_3' }),
    });

    const res = await declinePost(req);

    expect(res.status).toBe(200);
    expect(authServiceMock.revokeOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: 'provider_org_1',
      invitationId: 'invite_token_3',
      requestingUserId: 'owner_1',
    });
    expect(expireOrganizationInviteMock).toHaveBeenCalledWith('invite_token_3');
  });
});