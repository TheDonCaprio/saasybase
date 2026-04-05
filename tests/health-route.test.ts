import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const checkDatabaseConnectionMock = vi.hoisted(() => vi.fn());
const getAuthProviderMock = vi.hoisted(() => vi.fn());
const getAllConfiguredAuthProvidersMock = vi.hoisted(() => vi.fn());
const getActiveAuthProviderNameMock = vi.hoisted(() => vi.fn());
const getPaymentProviderMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/prisma', () => ({
  checkDatabaseConnection: checkDatabaseConnectionMock,
}));

vi.mock('../lib/auth-provider/factory', () => ({
  AuthProviderFactory: {
    getProvider: getAuthProviderMock,
    getAllConfiguredProviders: getAllConfiguredAuthProvidersMock,
    getActiveProviderName: getActiveAuthProviderNameMock,
  },
}));

vi.mock('../lib/payment/factory', () => ({
  PaymentProviderFactory: {
    getProvider: getPaymentProviderMock,
  },
}));

import { GET } from '../app/api/health/route';

const originalEnv = { ...process.env };

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DATABASE_URL: 'file:./dev.db',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      ENCRYPTION_SECRET: '12345678901234567890123456789012',
      PAYMENT_PROVIDER: 'paddle',
      AUTH_PROVIDER: 'nextauth',
      PADDLE_API_KEY: 'paddle_secret',
      AUTH_SECRET: 'auth_secret',
    };

    checkDatabaseConnectionMock.mockResolvedValue({ healthy: true });
    getActiveAuthProviderNameMock.mockReturnValue('nextauth');
    getAllConfiguredAuthProvidersMock.mockReturnValue([{ name: 'nextauth', provider: { name: 'nextauth' } }]);
    getAuthProviderMock.mockReturnValue({ name: 'nextauth' });
    getPaymentProviderMock.mockReturnValue({ name: 'paddle' });
  });

  it('returns a minimal payload in production when unauthorized', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
    };
    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.INTERNAL_API_TOKEN;

    const res = await GET(new NextRequest('http://localhost/api/health'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
    expect(checkDatabaseConnectionMock).not.toHaveBeenCalled();
    expect(getAuthProviderMock).not.toHaveBeenCalled();
    expect(getPaymentProviderMock).not.toHaveBeenCalled();
  });

  it('reports provider-aware auth and payment checks for configured providers', async () => {
    const req = new NextRequest('http://localhost/api/health');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks).toEqual({
      environment: true,
      database: true,
      auth: true,
      payments: true,
    });
    expect(body.providers.auth.active).toBe('nextauth');
    expect(body.providers.auth.configured).toEqual(['nextauth']);
    expect(body.providers.payments.active).toBe('paddle');
    expect(body.providers.payments.configured).toContain('paddle');
    expect(body.checks).not.toHaveProperty('clerk');
    expect(body.checks).not.toHaveProperty('stripe');
    expect(body.errors).toEqual([]);
  });
});