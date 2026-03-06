import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findFirst: vi.fn(),
  },
  payment: {
    findFirst: vi.fn(),
  },
}));

const authMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_1', orgId: null })));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('../lib/payment/service', () => ({ paymentService: { provider: { name: 'stripe' }, processWebhookEvent: vi.fn() } }));
vi.mock('../lib/payment/factory', () => ({ PaymentProviderFactory: { getProviderByName: vi.fn(() => null) } }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET } from '../app/api/checkout/confirm/route';

describe('GET /api/checkout/confirm team setup flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns requiresOrganizationSetup for team-plan payments when user has no owned workspace', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      id: 'pay_1',
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      subscriptionId: null,
      plan: { name: 'Team Plan', autoRenew: false, supportsOrganizations: true },
      subscription: null,
    });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=sess_1');
    const res = await GET(req);
    const body = (await res.json()) as { requiresOrganizationSetup?: boolean; setupUrl?: string };

    expect(res.status).toBe(200);
    expect(body.requiresOrganizationSetup).toBe(true);
    expect(body.setupUrl).toContain('/dashboard/team');
  });

  it('does not require setup when user already owns a workspace', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: 'org_1' });
    prismaMock.payment.findFirst.mockResolvedValueOnce({
      id: 'pay_2',
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      subscriptionId: null,
      plan: { name: 'Team Plan', autoRenew: false, supportsOrganizations: true },
      subscription: null,
    });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=sess_2');
    const res = await GET(req);
    const body = (await res.json()) as { requiresOrganizationSetup?: boolean; setupUrl?: string };

    expect(res.status).toBe(200);
    expect(body.requiresOrganizationSetup).toBeUndefined();
    expect(body.setupUrl).toBeUndefined();
  });
});
