import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
const setMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  organizationMembership: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

const getActiveTeamSubscriptionMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: getMock,
    set: setMock,
  })),
}));
vi.mock('../lib/auth-provider', () => ({
  authService: {
    getSession: vi.fn(async () => ({ userId: 'user_1' })),
  },
}));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/organization-access', () => ({
  getActiveTeamSubscription: getActiveTeamSubscriptionMock,
}));

import { GET } from '../app/api/user/active-org/route';

describe('GET /api/user/active-org', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockReturnValue({ value: 'org_1' });
  });

  it('prefers the owner team subscription plan over stale organization metadata', async () => {
    prismaMock.organizationMembership.findMany.mockResolvedValueOnce([
      {
        organizationId: 'org_1',
        role: 'OWNER',
        organization: {
          id: 'org_1',
          name: 'Caprio Workspace',
          slug: 'caprio',
          ownerUserId: 'user_1',
          plan: { name: 'Team' },
        },
      },
    ]);
    getActiveTeamSubscriptionMock.mockResolvedValueOnce({
      id: 'sub_1',
      plan: { name: 'Team Plus' },
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.activeOrgId).toBe('org_1');
    expect(body.organizations).toEqual([
      {
        id: 'org_1',
        name: 'Caprio Workspace',
        slug: 'caprio',
        role: 'OWNER',
        isOwner: true,
        planName: 'Team Plus',
      },
    ]);
  });
});