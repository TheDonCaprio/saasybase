import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  paymentAuthorization: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/logger', () => ({ Logger: loggerMock }));

import {
  findReusablePaymentAuthorizationCode,
  persistReusablePaymentAuthorization,
  revealPaymentAuthorizationCode,
  sealPaymentAuthorizationCode,
} from '../lib/payment/payment-authorization-storage';

describe('payment authorization storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_SECRET = '12345678901234567890123456789012';
  });

  it('encrypts and decrypts authorization codes with ENCRYPTION_SECRET', () => {
    const sealed = sealPaymentAuthorizationCode('AUTH_test_code_123');

    expect(sealed).toContain('enc:v1:');
    expect(sealed).not.toContain('AUTH_test_code_123');
    expect(revealPaymentAuthorizationCode(sealed)).toBe('AUTH_test_code_123');
  });

  it('updates a legacy plaintext authorization row to encrypted storage', async () => {
    prismaMock.paymentAuthorization.findFirst.mockResolvedValueOnce({ id: 'auth_row_1' });

    await persistReusablePaymentAuthorization({
      provider: 'paystack',
      userId: 'user_1',
      customerId: 'CUS_1',
      authorizationCode: 'AUTH_plaintext_1',
      reusable: true,
      channel: 'card',
      brand: 'visa',
      bank: 'Test Bank',
      last4: '4242',
      expMonth: '12',
      expYear: '2030',
    });

    expect(prismaMock.paymentAuthorization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'auth_row_1' },
      data: expect.objectContaining({
        authorizationCode: expect.stringContaining('enc:v1:'),
      }),
    }));
    expect(prismaMock.paymentAuthorization.create).not.toHaveBeenCalled();
  });

  it('prefers exact customer authorization matches before null-customer fallbacks', async () => {
    prismaMock.paymentAuthorization.findFirst
      .mockResolvedValueOnce({ authorizationCode: sealPaymentAuthorizationCode('AUTH_exact_1') });

    const code = await findReusablePaymentAuthorizationCode({
      provider: 'paystack',
      userId: 'user_1',
      customerId: 'CUS_exact_1',
    });

    expect(code).toBe('AUTH_exact_1');
    expect(prismaMock.paymentAuthorization.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.paymentAuthorization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customerId: 'CUS_exact_1',
        userId: 'user_1',
        provider: 'paystack',
        reusable: true,
      }),
    }));
  });

  it('falls back to null-customer authorization only when no exact match exists', async () => {
    prismaMock.paymentAuthorization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ authorizationCode: sealPaymentAuthorizationCode('AUTH_fallback_1') });

    const code = await findReusablePaymentAuthorizationCode({
      provider: 'paystack',
      userId: 'user_1',
      customerId: 'CUS_missing_1',
    });

    expect(code).toBe('AUTH_fallback_1');
    expect(prismaMock.paymentAuthorization.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: null,
          userId: 'user_1',
          provider: 'paystack',
          reusable: true,
        }),
      }),
    );
  });
});