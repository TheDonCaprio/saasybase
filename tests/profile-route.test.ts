import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
  },
  organization: {
    count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth', () => ({ 
  requireUser: vi.fn(async () => 'user_1'),
  getAuthSafe: vi.fn(async () => ({ userId: 'user_1', orgId: 'org_1' }))
}));
vi.mock('../lib/settings', () => ({
  getDefaultTokenLabel: vi.fn(async () => 'credits'),
  getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24),
  // Used by lib/formatDate.server.ts
  getFormatSetting: vi.fn(async () => ({ mode: 'iso', timezone: 'UTC' })),
  getUserFormatSetting: vi.fn(async () => ({ mode: 'iso', timezone: 'UTC' })),
}));
vi.mock('../lib/formatDate.server', () => ({ formatDateServer: vi.fn(async (d: Date) => d.toISOString()) }));
vi.mock('../lib/moderator', () => ({
  fetchModeratorPermissions: vi.fn(async () => ({})),
  buildAdminLikePermissions: vi.fn(() => ({})),
}));
const userPlanContextMock = vi.hoisted(() => ({
  getEffectiveMemberTokenCap: vi.fn(() => null),
  getMemberCapStrategy: vi.fn(() => null),
  getMemberSharedTokenBalance: vi.fn(() => null),
  getOrganizationPlanContext: vi.fn<[], Promise<unknown>>(async () => null),
}));

vi.mock('../lib/user-plan-context', () => userPlanContextMock);
const sendNextAuthVerificationEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
const sendNextAuthEmailChangeVerificationMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../lib/nextauth-email-verification', () => ({
  sendNextAuthVerificationEmail: sendNextAuthVerificationEmailMock,
  sendNextAuthEmailChangeVerification: sendNextAuthEmailChangeVerificationMock,
}));
vi.mock('../lib/auth-provider', () => ({ authService: { providerName: 'nextauth' } }));

import { GET, PATCH } from '../app/api/user/profile/route';

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes paidTokens even when subscription is null', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'caprio@capriofiles.com',
      name: 'Caprio',
      role: 'USER',
      tokenBalance: 123,
      freeTokenBalance: 5,
    });

    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.subscription).toBe(null);
    expect(body.paidTokens).toEqual({ tokenName: 'credits', remaining: 123, isUnlimited: false, displayRemaining: '123' });
  });

  it('uses subscription tokenName for paidTokens when active subscription exists', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'caprio@capriofiles.com',
      name: 'Caprio',
      role: 'USER',
      tokenBalance: 250,
      freeTokenBalance: 0,
    });

    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      plan: { name: 'Pro', tokenLimit: 1000, tokenName: 'Pro Credits', durationHours: 720 },
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.subscription?.tokenName).toBe('Pro Credits');
    expect(body.paidTokens).toEqual({ tokenName: 'Pro Credits', remaining: 250, isUnlimited: false, displayRemaining: '250' });
  });

  it('marks paid tokens as unlimited when the active plan has no token limit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'caprio@capriofiles.com',
      name: 'Caprio',
      role: 'USER',
      tokenBalance: 0,
      freeTokenBalance: 0,
    });

    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      plan: { name: 'Unlimited Pro', tokenLimit: null, tokenName: 'Credits', durationHours: 720, supportsOrganizations: false },
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paidTokens).toEqual({ tokenName: 'Credits', remaining: 0, isUnlimited: true, displayRemaining: 'Unlimited' });
    expect(body.subscription.tokens).toMatchObject({
      total: null,
      used: null,
      remaining: 0,
      isUnlimited: true,
      displayRemaining: 'Unlimited',
    });
  });

  it('includes organization.expiresAt for workspace members', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'member@capriofiles.com',
      name: 'Member',
      role: 'USER',
      tokenBalance: 0,
      freeTokenBalance: 0,
    });

    // First subscription lookup: personal subscription (none)
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    // Organization context is present (member)
    userPlanContextMock.getOrganizationPlanContext.mockResolvedValueOnce({
      role: 'MEMBER',
      organization: {
        id: 'org_1',
        name: 'Caprio Workspace',
        slug: 'caprio',
        ownerUserId: 'owner_1',
        seatLimit: 5,
        tokenBalance: 0,
        tokenPoolStrategy: 'SHARED_FOR_ORG',
        memberTokenCap: null,
        memberCapStrategy: null,
        memberCapResetIntervalHours: null,
        planId: 'plan_team',
        plan: {
          id: 'plan_team',
          name: 'Team',
          shortDescription: null,
          description: null,
          priceCents: 0,
          durationHours: 720,
          autoRenew: true,
          recurringInterval: 'month',
          tokenLimit: 1000,
          tokenName: 'credits',
          organizationTokenPoolStrategy: 'SHARED_FOR_ORG',
        },
      },
      membership: null,
    });

    // Second subscription lookup: owner's team subscription for org expiry
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      expiresAt: new Date('2031-02-03T04:05:06.000Z'),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.subscription).toBe(null);
    expect(body.organization?.expiresAt).toBe('2031-02-03T04:05:06.000Z');
    expect(body.planSource).toBe('ORGANIZATION');
  });

  it('keeps the existing email active until a new email is verified', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      name: 'Caprio Files',
      email: 'current@example.com',
      password: 'hashed',
    });
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.update.mockResolvedValueOnce({
      id: 'user_1',
      name: 'Caprio Files',
      email: 'current@example.com',
    });

    const req = new Request('http://localhost/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({ firstName: 'Caprio', lastName: 'Files', email: 'next@example.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { name: 'Caprio Files' },
      select: { id: true, name: true, email: true },
    });
    expect(sendNextAuthEmailChangeVerificationMock).toHaveBeenCalledWith({
      userId: 'user_1',
      currentEmail: 'current@example.com',
      newEmail: 'next@example.com',
      name: 'Caprio Files',
    });
    expect(body.emailChangePending).toBe(true);
    expect(body.user.email).toBe('current@example.com');
  });
});
