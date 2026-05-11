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

const providerMock = vi.hoisted(() => ({
  name: 'paddle',
  getCheckoutSession: vi.fn(),
}));

const paymentServiceMock = vi.hoisted(() => ({
  provider: providerMock,
  processWebhookEvent: vi.fn(),
  recoverPendingPaystackSubscriptionForCheckout: vi.fn(),
}));

const authMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_1', orgId: null })));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/payment/service', () => ({ paymentService: paymentServiceMock }));
vi.mock('../lib/payment/factory', () => ({ PaymentProviderFactory: { getProviderByName: vi.fn(() => null) } }));
vi.mock('../lib/auth-provider', () => ({ authService: { getSession: authMock } }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET } from '../app/api/checkout/confirm/route';

describe('GET /api/checkout/confirm paddle completed session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findFirst.mockResolvedValue(null);
  });

  it('confirms a Paddle transaction with completed status without waiting for webhook delivery', async () => {
    providerMock.getCheckoutSession.mockResolvedValueOnce({
      id: 'txn_paddle_1',
      paymentIntentId: 'txn_paddle_1',
      paymentStatus: 'completed',
      metadata: {
        userId: 'user_1',
        priceId: 'pri_paddle_team_1',
      },
      lineItems: [{ priceId: 'pri_paddle_team_1' }],
    });

    prismaMock.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay_paddle_1',
        status: 'SUCCEEDED',
        createdAt: new Date('2026-05-11T12:00:00.000Z'),
        subscriptionId: 'sub_paddle_local_1',
        plan: { name: 'Team Plan', autoRenew: true, supportsOrganizations: true },
        subscription: {
          id: 'sub_paddle_local_1',
          status: 'ACTIVE',
          organizationId: null,
          plan: { name: 'Team Plan', supportsOrganizations: true },
        },
      });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=txn_paddle_1');
    const res = await GET(req);
    const body = await res.json() as { completed?: boolean; requiresOrganizationSetup?: boolean; setupUrl?: string };

    expect(res.status).toBe(200);
    expect(body.completed).toBe(true);
    expect(body.requiresOrganizationSetup).toBe(true);
    expect(body.setupUrl).toContain('/dashboard/team');
    expect(paymentServiceMock.processWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'checkout.completed',
      originalEvent: expect.objectContaining({ provider: 'paddle' }),
      payload: expect.objectContaining({
        id: 'txn_paddle_1',
        paymentStatus: 'paid',
      }),
    }));
  });
});