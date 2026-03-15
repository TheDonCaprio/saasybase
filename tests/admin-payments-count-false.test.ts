import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  payment: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const requireAdminOrModeratorMock = vi.hoisted(() => vi.fn(async () => undefined));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const getActiveCurrencyAsyncMock = vi.hoisted(() => vi.fn(async () => 'USD'));
const formatCurrencyMock = vi.hoisted(() => vi.fn((amountCents: number, currency: string) => `${currency}:${amountCents}`));
const buildDashboardUrlMock = vi.hoisted(() => vi.fn(() => null));
const paymentServiceMock = vi.hoisted(() => ({
  getDashboardUrl: vi.fn(() => 'https://dashboard.example.test/payment/pay_1'),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: requireAdminOrModeratorMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/queryUtils', () => ({
  stripMode: vi.fn((value: unknown) => value),
  isPrismaModeError: vi.fn(() => false),
  buildStringContainsFilter: vi.fn((value: string) => ({ contains: value })),
  sanitizeWhereForInsensitiveSearch: vi.fn((value: unknown) => value),
}));
vi.mock('../lib/runtime-guards', () => ({
  asRecord: vi.fn((value: unknown) => (typeof value === 'object' && value !== null ? value : null)),
  toError: vi.fn((error: unknown) => (error instanceof Error ? error : new Error(String(error)))),
}));
vi.mock('../lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../lib/payment/service', () => ({ paymentService: paymentServiceMock }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrencyAsync: getActiveCurrencyAsyncMock }));
vi.mock('../lib/utils/currency', () => ({ formatCurrency: formatCurrencyMock }));
vi.mock('../lib/payment/provider-config', () => ({ buildDashboardUrl: buildDashboardUrlMock }));

import { GET } from '../app/api/admin/payments/route';

describe('GET /api/admin/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.payment.findMany.mockResolvedValue([
      {
        id: 'pay_1',
        amountCents: 1999,
        subtotalCents: 2499,
        discountCents: 500,
        currency: 'usd',
        status: 'PAID',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
        externalPaymentId: 'ext_pay_1',
        paymentProvider: 'stripe',
        user: {
          id: 'user_1',
          email: 'user@example.com',
          name: 'User Example',
          role: 'USER',
          imageUrl: null,
          externalCustomerId: 'cus_123',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        subscription: null,
        plan: {
          id: 'plan_1',
          name: 'Starter',
          description: 'Starter plan',
        },
      },
    ]);
  });

  it('omits totalCount work when count=false and still returns payments', async () => {
    const request = new NextRequest('http://localhost/api/admin/payments?page=2&limit=10&count=false');

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(prismaMock.payment.count).not.toHaveBeenCalled();
    expect(body.totalCount).toBeNull();
    expect(Array.isArray(body.payments)).toBe(true);
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toEqual(
      expect.objectContaining({
        id: 'pay_1',
        amountCents: 1999,
        amountFormatted: 'USD:1999',
      }),
    );
  });
});