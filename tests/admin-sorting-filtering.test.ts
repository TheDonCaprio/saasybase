import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  payment: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  subscription: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../lib/auth', () => ({
  requireAdminOrModerator: vi.fn(async () => ({ userId: 'admin_1' })),
  toAuthGuardErrorResponse: vi.fn(() => null),
}));

vi.mock('../lib/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../lib/rateLimit', () => ({
  adminRateLimit: vi.fn(async () => ({
    success: true,
    allowed: true,
    remaining: 999,
    reset: Date.now() + 60_000,
    error: null,
  })),
}));

// paymentService is only used when mapping results; keep it minimal
vi.mock('../lib/payment/service', () => ({
  paymentService: {
    getDashboardUrl: vi.fn(() => null),
  },
}));

import { GET as getAdminPayments } from '../app/api/admin/payments/route';
import { GET as getAdminSubscriptions } from '../app/api/admin/subscriptions/route';
import { GET as getAdminPurchases } from '../app/api/admin/purchases/route';
import { GET as getAdminUserPayments } from '../app/api/admin/users/[userId]/payments/route';

describe('Admin list sorting/filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.subscription.count.mockResolvedValue(0);
  });

  it('supports payments sortBy=expiresAt (orders by subscription.expiresAt)', async () => {
    const req = { url: 'http://localhost/api/admin/payments?page=1&limit=50&sortBy=expiresAt&sortOrder=desc' } as any;
    const res = await getAdminPayments(req);

    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.payment.findMany.mock.calls[0]?.[0] as any;
    expect(args.orderBy?.[0]).toEqual({ subscription: { expiresAt: 'desc' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payments).toEqual([]);
  });

  it('supports purchases sort=expiresAt (orders by subscription.expiresAt)', async () => {
    const req = { url: 'http://localhost/api/admin/purchases?page=1&limit=50&sort=expiresAt&order=desc' } as any;
    const res = await getAdminPurchases(req);

    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.payment.findMany.mock.calls[0]?.[0] as any;
    expect(args.orderBy?.[0]).toEqual({ subscription: { expiresAt: 'desc' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.purchases).toEqual([]);
  });

  it('treats subscriptions status=ACTIVE as access-based (expiresAt > now, not scheduled cancel)', async () => {
    const req = { url: 'http://localhost/api/admin/subscriptions?page=1&limit=50&status=ACTIVE' } as any;
    const res = await getAdminSubscriptions(req);

    expect(prismaMock.subscription.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0] as any;

    expect(args.where?.status).toBe('ACTIVE');
    expect(args.where?.canceledAt).toBeNull();
    expect(args.where?.expiresAt?.gt).toBeInstanceOf(Date);

    expect(res.status).toBe(200);
  });

  it('treats subscriptions status=EXPIRED as access-based (expiresAt <= now) even if status not normalized', async () => {
    const req = { url: 'http://localhost/api/admin/subscriptions?page=1&limit=50&status=EXPIRED' } as any;
    const res = await getAdminSubscriptions(req);

    expect(prismaMock.subscription.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.subscription.findMany.mock.calls[0]?.[0] as any;

    // When no search filter is present, EXPIRED becomes a top-level OR.
    const or = args.where?.OR as any[] | undefined;
    expect(Array.isArray(or)).toBe(true);
    expect(or?.some((c) => c?.status === 'EXPIRED')).toBe(true);
    expect(or?.some((c) => c?.expiresAt?.lte instanceof Date && c?.status?.not === 'CANCELLED')).toBe(true);

    expect(res.status).toBe(200);
  });

  it('paginates user payments with page/limit (uses skip)', async () => {
    prismaMock.payment.findMany.mockResolvedValueOnce([]);
    prismaMock.payment.count.mockResolvedValueOnce(60);

    const req = { url: 'http://localhost/api/admin/users/user_1/payments?page=2&limit=25' } as any;
    const res = await getAdminUserPayments(req, { params: { userId: 'user_1' } } as any);

    expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.payment.findMany.mock.calls[0]?.[0] as any;
    expect(args.skip).toBe(25);
    expect(args.take).toBe(25);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentPage).toBe(2);
    expect(body.totalPages).toBe(3);
  });
});
