import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Logger } from '../../../../lib/logger';

function buildRedirectUrl(req: NextRequest, params: Record<string, string | null>) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const url = new URL('/checkout/return', origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function verifyPaymentLinkSignature(payload: string, signature: string, secret: string) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature || '', 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const paymentId = params.get('razorpay_payment_id');
  const paymentLinkId = params.get('razorpay_payment_link_id');
  const referenceId = params.get('razorpay_payment_link_reference_id') || '';
  const linkStatus = params.get('razorpay_payment_link_status') || '';
  const signature = params.get('razorpay_signature') || '';

  const provider = 'razorpay';
  const since = String(Date.now());

  if (!paymentLinkId || !paymentId || !linkStatus || !signature) {
    const fallbackUrl = buildRedirectUrl(req, {
      provider,
      status: 'error',
      since,
    });
    return NextResponse.redirect(fallbackUrl);
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!secret) {
    Logger.warn('Razorpay callback missing secret', { paymentLinkId, paymentId });
    const fallbackUrl = buildRedirectUrl(req, {
      provider,
      status: 'error',
      since,
    });
    return NextResponse.redirect(fallbackUrl);
  }

  const payload = `${paymentLinkId}|${referenceId}|${linkStatus}|${paymentId}`;
  const valid = verifyPaymentLinkSignature(payload, signature, secret);
  if (!valid) {
    Logger.warn('Razorpay callback signature mismatch', {
      paymentLinkId,
      paymentId,
      linkStatus,
    });
    const failUrl = buildRedirectUrl(req, {
      provider,
      status: 'error',
      since,
    });
    return NextResponse.redirect(failUrl);
  }

  const normalizedStatus = linkStatus.toLowerCase();
  const status = normalizedStatus === 'paid' ? 'success' : normalizedStatus;

  const redirectUrl = buildRedirectUrl(req, {
    provider,
    status,
    session_id: paymentLinkId,
    payment_id: paymentId,
    since,
  });

  return NextResponse.redirect(redirectUrl);
}
