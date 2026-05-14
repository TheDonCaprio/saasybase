import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdminMock = vi.hoisted(() => vi.fn(async () => 'admin_1'));
const toAuthGuardErrorResponseMock = vi.hoisted(() => vi.fn(() => null));
const adminRateLimitMock = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 }))
);
const recordAdminActionMock = vi.hoisted(() => vi.fn(async () => undefined));
const revalidatePathMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  setting: {
    upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: string }; create: { value: string } }) => ({
      key: where.key,
      value: update.value ?? create.value,
    })),
  },
  $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations as Promise<unknown>[])),
}));

vi.mock('../lib/auth', () => ({
  requireAdmin: requireAdminMock,
  toAuthGuardErrorResponse: toAuthGuardErrorResponseMock,
}));
vi.mock('../lib/rateLimit', () => ({ adminRateLimit: adminRateLimitMock }));
vi.mock('../lib/admin-actions', () => ({ recordAdminAction: recordAdminActionMock }));
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('../lib/payment/provider-config', () => ({ PAYMENT_PROVIDERS: {}, getActivePaymentProvider: () => 'stripe' }));

import { normalizeAdminSettingValue, validateAdminSettingValue } from '../lib/admin-settings-validation';
import { PATCH, POST } from '../app/api/admin/settings/route';

describe('admin settings validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue('admin_1');
    toAuthGuardErrorResponseMock.mockReturnValue(null);
    adminRateLimitMock.mockResolvedValue({ success: true, allowed: true, remaining: 9, reset: Date.now() + 60_000 });
  });

  it('rejects non-numeric recurring downgrade limits on POST', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', value: 'abc' }),
      })
    );

		const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE must be a non-negative whole number.');
  });

  it('rejects negative recurring downgrade limits on PATCH', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', value: '-1' }),
      })
    );

		const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE must be a non-negative whole number.');
  });

  it('normalizes valid recurring downgrade limits before saving', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', value: ' 02 ' }),
      })
    );

		const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.setting).toEqual({ key: 'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', value: '2' });
    expect(prismaMock.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: '2' },
        create: { key: 'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', value: '2' },
      })
    );
  });

  it('shares the same validator with the client-side helper', () => {
    expect(validateAdminSettingValue('RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', '3')).toBeNull();
    expect(validateAdminSettingValue('RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', '')).toBe(
      'RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE must be a non-negative whole number.'
    );
    expect(normalizeAdminSettingValue('RECURRING_DOWNGRADE_IMMEDIATE_LIMIT_PER_CYCLE', ' 03 ')).toBe('3');
  });
});