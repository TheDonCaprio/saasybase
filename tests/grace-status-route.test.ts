import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth', () => ({ requireUser: vi.fn(async () => 'user_1') }));
vi.mock('../lib/settings', () => ({ getPaidTokensNaturalExpiryGraceHours: vi.fn(async () => 24) }));

import { GET } from '../app/api/user/grace-status/route';

describe('GET /api/user/grace-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns inGrace=false when user has a valid subscription', async () => {
    prismaMock.subscription.findFirst.mockResolvedValueOnce({ id: 'sub_valid' });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inGrace).toBe(false);
  });

  it('returns inGrace=true with graceEndsAt when latest expired is within grace', async () => {
    // hasValid query
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    // latestExpiredWithinGrace query
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      expiresAt,
      plan: { supportsOrganizations: true, autoRenew: false, name: 'Team' },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inGrace).toBe(true);
    expect(typeof body.graceEndsAt).toBe('string');
    expect(new Date(body.graceEndsAt).getTime()).toBeGreaterThan(expiresAt.getTime());
  });

  it('treats CANCELLED within grace as inGrace=true', async () => {
    // hasValid query
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    // latestEndedWithinGrace query
    const expiresAt = new Date(Date.now() - 30 * 60 * 1000);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      expiresAt,
      plan: { supportsOrganizations: true, autoRenew: false, name: 'Team' },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inGrace).toBe(true);
    expect(new Date(body.expiresAt).toISOString()).toBe(expiresAt.toISOString());
  });
});
