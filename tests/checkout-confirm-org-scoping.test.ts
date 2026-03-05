import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
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
}));

const authMock = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_1', orgId: 'org_auth' })));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/payment/service', () => ({ paymentService: paymentServiceMock }));
vi.mock('../lib/payment/factory', () => ({
  PaymentProviderFactory: {
    getProviderByName: vi.fn(() => providerMock),
  },
}));
vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('../lib/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET } from '../app/api/checkout/confirm/route';

describe('GET /api/checkout/confirm org scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects active org metadata from auth when provider session metadata omits org context', async () => {
    providerMock.getCheckoutSession.mockResolvedValueOnce({
      id: 'sess_1',
      paymentStatus: 'paid',
      metadata: { userId: 'user_1' },
      lineItems: [{ priceId: 'price_1' }],
    });

    prismaMock.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay_1',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
        subscriptionId: null,
        plan: { autoRenew: false, name: 'Top-up' },
        subscription: null,
      });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=sess_1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const event = paymentServiceMock.processWebhookEvent.mock.calls[0]?.[0];
    expect(event?.payload?.metadata).toMatchObject({
      activeClerkOrgId: 'org_auth',
      clerkOrgId: 'org_auth',
      orgId: 'org_auth',
    });
  });

  it('prefers org context from session metadata over auth orgId', async () => {
    providerMock.getCheckoutSession.mockResolvedValueOnce({
      id: 'sess_2',
      paymentStatus: 'paid',
      metadata: {
        userId: 'user_1',
        orgId: 'org_meta',
      },
      lineItems: [{ priceId: 'price_2' }],
    });

    prismaMock.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pay_2',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
        subscriptionId: null,
        plan: { autoRenew: false, name: 'Top-up' },
        subscription: null,
      });

    const req = new NextRequest('http://localhost/api/checkout/confirm?session_id=sess_2');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const event = paymentServiceMock.processWebhookEvent.mock.calls[0]?.[0];
    expect(event?.payload?.metadata).toMatchObject({
      activeClerkOrgId: 'org_meta',
      clerkOrgId: 'org_meta',
      orgId: 'org_meta',
    });
  });
});
