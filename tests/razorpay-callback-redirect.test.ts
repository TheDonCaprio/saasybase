import crypto from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../lib/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET } from '../app/checkout/razorpay/callback/route';

describe('Razorpay callback redirects', () => {
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterAll(() => {
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
  });

  it('redirects successful callbacks to dashboard with confirm params', async () => {
    const payload = 'order_123|pay_123';
    const signature = crypto.createHmac('sha256', 'test_secret').update(payload).digest('hex');
    const req = new NextRequest(`http://localhost/checkout/razorpay/callback?razorpay_order_id=order_123&razorpay_payment_id=pay_123&razorpay_signature=${signature}`);

    const res = await GET(req);
    const location = res.headers.get('location');

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(location).toContain('/dashboard?');
    expect(location).toContain('purchase=success');
    expect(location).toContain('status=success');
    expect(location).toContain('session_id=order_123');
    expect(location).toContain('payment_id=pay_123');
    expect(location).not.toContain('/checkout/return');
  });

  it('redirects invalid signatures to dashboard failure state', async () => {
    const req = new NextRequest('http://localhost/checkout/razorpay/callback?razorpay_order_id=order_123&razorpay_payment_id=pay_123&razorpay_signature=bad');

    const res = await GET(req);
    const location = res.headers.get('location');

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(location).toContain('/dashboard?');
    expect(location).toContain('purchase=failed');
    expect(location).toContain('status=error');
    expect(location).not.toContain('/checkout/return');
  });
});