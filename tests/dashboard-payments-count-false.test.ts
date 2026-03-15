import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  payment: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ userId: 'user_1' })),
}));
const getActiveCurrencyAsyncMock = vi.hoisted(() => vi.fn(async () => 'USD'));
const formatCurrencyMock = vi.hoisted(() => vi.fn((amountCents: number, currency: string) => `${currency}:${amountCents}`));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth-provider', () => ({ authService: authServiceMock }));
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
vi.mock('../lib/utils/currency', () => ({ formatCurrency: formatCurrencyMock }));
vi.mock('../lib/payment/registry', () => ({ getActiveCurrencyAsync: getActiveCurrencyAsyncMock }));
vi.mock('../lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET } from '../app/api/dashboard/payments/route';

describe('GET /api/dashboard/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.payment.findMany.mockResolvedValue([
      {
        id: 'pay_1',
        amountCents: 1500,
        subtotalCents: 1500,
        discountCents: 0,
        couponCode: null,
        currency: 'usd',
        status: 'PAID',
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
        subscription: null,
        plan: {
          id: 'plan_1',
          name: 'Starter',
          tokenLimit: null,
          tokenName: null,
        },
      },
    ]);
  });

  it('skips totalCount when count=false and still returns a payment list', async () => {
    const request = new NextRequest('http://localhost/api/dashboard/payments?page=2&limit=10&count=false');

    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(prismaMock.payment.count).not.toHaveBeenCalled();
    expect(body.totalCount).toBeNull();
    expect(Array.isArray(body.payments)).toBe(true);
    expect(body.payments).toHaveLength(1);
    expect(body.totalSpent).toBe(1500);
    expect(body.totalSpentFormatted).toBe('USD:1500');
  });
});