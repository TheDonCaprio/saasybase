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
  name: 'paystack',
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
vi.mock('../lib/payment/factory', () => ({ PaymentProviderFactory: { getProviderByName: vi.fn(() => providerMock) } }));
vi.mock('../lib/auth-provider', () => ({ authService: { getSession: authMock } }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET } from '../app/api/checkout/confirm/route';

describe('GET /api/checkout/confirm paystack self-heal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organization.findFirst.mockResolvedValue(null);
  });

  it('hydrates a recent pending Paystack team payment and returns team setup fields', async () => {
    providerMock.getCheckoutSession.mockResolvedValueOnce({
      id: 'sess_paystack_1',
      customerId: 'CUS_paystack_1',
      paymentStatus: 'paid',
      metadata: {
        userId: 'user_1',
        priceId: 'PLN_team_1',
        planCode: 'PLN_team_1',
      },
      lineItems: [{ priceId: 'PLN_team_1' }],
    });

    prismaMock.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay_pending',
        status: 'PENDING_SUBSCRIPTION',
        createdAt: new Date('2026-05-10T20:00:00.000Z'),
        subscriptionId: null,
        plan: { name: 'Team Plan', autoRenew: true, supportsOrganizations: true },
        subscription: null,
      })
      .mockResolvedValueOnce({
        id: 'pay_done',
        status: 'SUCCEEDED',
        createdAt: new Date('2026-05-10T20:01:00.000Z'),
        subscriptionId: 'sub_local_1',
        plan: { name: 'Team Plan', autoRenew: true, supportsOrganizations: true },
        subscription: {
          id: 'sub_local_1',
          status: 'ACTIVE',
          organizationId: null,
          plan: { name: 'Team Plan', supportsOrganizations: true },
        },
      });

    paymentServiceMock.recoverPendingPaystackSubscriptionForCheckout.mockResolvedValueOnce({
      id: 'sub_local_1',
      userId: 'user_1',
      plan: { autoRenew: true },
    });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=sess_paystack_1');
    const res = await GET(req);
    const body = await res.json() as { completed?: boolean; requiresOrganizationSetup?: boolean; setupUrl?: string };

    expect(res.status).toBe(200);
    expect(body.completed).toBe(true);
    expect(body.requiresOrganizationSetup).toBe(true);
    expect(body.setupUrl).toContain('/dashboard/team');
    expect(paymentServiceMock.recoverPendingPaystackSubscriptionForCheckout).toHaveBeenCalledWith({
      userId: 'user_1',
      customerId: 'CUS_paystack_1',
      priceId: 'PLN_team_1',
      paymentId: null,
      sessionId: 'sess_paystack_1',
    });
  });

  it('treats paystack payment_id as the provider session reference and does not resolve early on a pending subscription payment', async () => {
    providerMock.getCheckoutSession.mockResolvedValueOnce({
      id: 'paystack_ref_1',
      customerId: 'CUS_paystack_1',
      paymentStatus: 'paid',
      metadata: {
        userId: 'user_1',
        priceId: 'PLN_team_1',
        planCode: 'PLN_team_1',
      },
      lineItems: [{ priceId: 'PLN_team_1' }],
    });

    prismaMock.payment.findFirst
      .mockResolvedValueOnce({
        id: 'pay_pending_fast_path',
        status: 'PENDING_SUBSCRIPTION',
        createdAt: new Date('2026-05-10T20:00:00.000Z'),
        subscriptionId: null,
        plan: { name: 'Team Plan', autoRenew: true, supportsOrganizations: true },
        subscription: null,
      })
      .mockResolvedValueOnce({
        id: 'pay_pending_lookup',
        status: 'PENDING_SUBSCRIPTION',
        createdAt: new Date('2026-05-10T20:00:10.000Z'),
        subscriptionId: null,
        plan: { name: 'Team Plan', autoRenew: true, supportsOrganizations: true },
        subscription: null,
      });

    paymentServiceMock.recoverPendingPaystackSubscriptionForCheckout.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/checkout/confirm?payment_id=paystack_ref_1');
    const res = await GET(req);
    const body = await res.json() as { completed?: boolean; pending?: boolean };

    expect(res.status).toBe(200);
    expect(body.completed).toBe(false);
    expect(body.pending).toBe(true);
    expect(providerMock.getCheckoutSession).toHaveBeenCalledWith('paystack_ref_1');
    expect(paymentServiceMock.recoverPendingPaystackSubscriptionForCheckout).toHaveBeenCalledWith({
      userId: 'user_1',
      customerId: 'CUS_paystack_1',
      priceId: 'PLN_team_1',
      paymentId: 'paystack_ref_1',
      sessionId: 'paystack_ref_1',
    });
  });
});