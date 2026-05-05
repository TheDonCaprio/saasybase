import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  payment: {
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  subscription: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  plan: {
    findMany: vi.fn(),
  },
  featureUsageLog: {
    groupBy: vi.fn(),
  },
  visitLog: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(() => {
    throw new Error('raw SQL should not be used by getAdminAnalytics');
  }),
  $executeRaw: vi.fn(() => {
    throw new Error('raw SQL should not be used by getAdminAnalytics');
  }),
}));

const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({
  Logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('admin analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'));
    vi.clearAllMocks();

    prismaMock.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 5000 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 3000 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 1000 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 400 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 200 } });

    prismaMock.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);

    prismaMock.user.findMany.mockResolvedValue([
      { createdAt: new Date('2026-05-01T10:00:00.000Z') },
      { createdAt: new Date('2026-05-01T11:00:00.000Z') },
      { createdAt: new Date('2026-05-02T09:00:00.000Z') },
    ]);

    prismaMock.subscription.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    prismaMock.payment.groupBy.mockResolvedValue([
      { planId: 'plan_pro', _sum: { amountCents: 3000 } },
      { planId: 'plan_basic', _sum: { amountCents: 0 } },
    ]);

    prismaMock.plan.findMany.mockResolvedValue([
      {
        id: 'plan_pro',
        name: 'Pro',
        subscriptions: [{ userId: 'user_1' }, { userId: 'user_2' }, { userId: 'user_1' }],
      },
      {
        id: 'plan_basic',
        name: 'Basic',
        subscriptions: [],
      },
    ]);

    prismaMock.featureUsageLog.groupBy
      .mockResolvedValueOnce([
        { feature: 'reports', _sum: { count: 9 }, _count: { userId: 3 } },
      ])
      .mockResolvedValueOnce([
        { feature: 'reports', _sum: { count: 6 }, _count: { userId: 2 } },
      ]);

    prismaMock.payment.findMany.mockResolvedValue([
      { createdAt: new Date('2026-05-01T10:00:00.000Z'), amountCents: 1000 },
      { createdAt: new Date('2026-05-01T12:00:00.000Z'), amountCents: 2000 },
      { createdAt: new Date('2026-05-03T15:00:00.000Z'), amountCents: 500 },
    ]);

    prismaMock.subscription.findMany.mockResolvedValue([
      { createdAt: new Date('2026-05-02T10:00:00.000Z') },
      { createdAt: new Date('2026-05-02T11:00:00.000Z') },
      { createdAt: new Date('2026-05-04T12:00:00.000Z') },
    ]);

    prismaMock.visitLog.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(4);

    prismaMock.visitLog.findMany.mockResolvedValue([
      { sessionId: 'sess_1', country: 'US', path: '/pricing' },
      { sessionId: 'sess_1', country: 'US', path: '/pricing' },
      { sessionId: 'sess_2', country: 'CA', path: '/docs' },
      { sessionId: 'sess_3', country: null, path: '/pricing' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds analytics without raw SQL and preserves aggregated output', async () => {
    const { getAdminAnalytics } = await import('../lib/admin-analytics');

    const result = await getAdminAnalytics('30d');

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(result.revenue.chartData).toEqual([
      { date: '2026-05-03', revenue: 5 },
      { date: '2026-05-01', revenue: 30 },
    ]);
    expect(result.users.growthData).toEqual([
      { date: '2026-05-02', users: 1 },
      { date: '2026-05-01', users: 2 },
    ]);
    expect(result.subscriptions.chartData).toEqual([
      { date: '2026-05-04', subscriptions: 1 },
      { date: '2026-05-02', subscriptions: 2 },
    ]);
    expect(result.visits.uniqueVisitors).toBe(3);
    expect(result.visits.countries).toEqual([
      { country: 'US', visits: 2, percentage: 25 },
      { country: 'CA', visits: 1, percentage: 12.5 },
    ]);
    expect(result.visits.pages).toEqual([
      { path: '/pricing', views: 3, percentage: 37.5 },
      { path: '/docs', views: 1, percentage: 12.5 },
    ]);
    expect(result.plans[0]).toEqual({
      id: 'plan_pro',
      name: 'Pro',
      revenue: 30,
      users: 2,
      percentage: 100,
    });
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});