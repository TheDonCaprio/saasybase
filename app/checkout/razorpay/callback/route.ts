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

function verifySubscriptionSignature(subscriptionId: string, paymentId: string, signature: string, secret: string) {
  const payloadA = `${subscriptionId}|${paymentId}`;
  const payloadB = `${paymentId}|${subscriptionId}`;
  return (
    verifyPaymentLinkSignature(payloadA, signature, secret)
    || verifyPaymentLinkSignature(payloadB, signature, secret)
  );
}

function verifyOrderSignature(orderId: string, paymentId: string, signature: string, secret: string) {
  const payload = `${orderId}|${paymentId}`;
  return verifyPaymentLinkSignature(payload, signature, secret);
}

async function fetchPaymentContext(paymentId: string) {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret) return null;

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return null;
    return {
      subscriptionId: typeof data.subscription_id === 'string' ? data.subscription_id : null,
      paymentLinkId: typeof data.payment_link_id === 'string' ? data.payment_link_id : null,
      orderId: typeof data.order_id === 'string' ? data.order_id : null,
    };
  } catch {
    return null;
  }
}

function getParam(params: URLSearchParams | Map<string, string>, key: string) {
  if (params instanceof URLSearchParams) return params.get(key);
  return params.get(key) ?? null;
}

async function handleCallback(
  req: NextRequest,
  params: URLSearchParams | Map<string, string>,
) {
  const paymentId = getParam(params, 'razorpay_payment_id');
  let paymentLinkId = getParam(params, 'razorpay_payment_link_id');
  const referenceId = getParam(params, 'razorpay_payment_link_reference_id') || '';
  const linkStatus = getParam(params, 'razorpay_payment_link_status') || '';
  const signature = getParam(params, 'razorpay_signature') || '';
  let subscriptionId = getParam(params, 'razorpay_subscription_id');
  let orderId = getParam(params, 'razorpay_order_id');

  const provider = 'razorpay';
  const since = String(Date.now());

  if (!paymentLinkId && !subscriptionId && paymentId && signature) {
    const context = await fetchPaymentContext(paymentId);
    if (context?.subscriptionId) {
      subscriptionId = context.subscriptionId;
    } else if (context?.paymentLinkId) {
      paymentLinkId = context.paymentLinkId;
    } else if (context?.orderId) {
      orderId = context.orderId;
    }
  }

  if (!paymentLinkId && subscriptionId && paymentId && signature) {
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!secret) {
      Logger.warn('Razorpay subscription callback missing secret', { subscriptionId, paymentId });
      const fallbackUrl = buildRedirectUrl(req, {
        provider,
        status: 'error',
        since,
      });
      return NextResponse.redirect(fallbackUrl);
    }

    const valid = verifySubscriptionSignature(subscriptionId, paymentId, signature, secret);
    if (!valid) {
      Logger.warn('Razorpay subscription callback signature mismatch', {
        subscriptionId,
        paymentId,
      });
      const failUrl = buildRedirectUrl(req, {
        provider,
        status: 'error',
        since,
      });
      return NextResponse.redirect(failUrl);
    }

    const redirectUrl = buildRedirectUrl(req, {
      provider,
      status: 'success',
      session_id: subscriptionId,
      payment_id: paymentId,
      since,
    });

    return NextResponse.redirect(redirectUrl);
  }

  if (!paymentLinkId && !subscriptionId && orderId && paymentId && signature) {
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!secret) {
      Logger.warn('Razorpay order callback missing secret', { orderId, paymentId });
      const fallbackUrl = buildRedirectUrl(req, {
        provider,
        status: 'error',
        since,
      });
      return NextResponse.redirect(fallbackUrl);
    }

    const valid = verifyOrderSignature(orderId, paymentId, signature, secret);
    if (!valid) {
      Logger.warn('Razorpay order callback signature mismatch', {
        orderId,
        paymentId,
      });
      const failUrl = buildRedirectUrl(req, {
        provider,
        status: 'error',
        since,
      });
      return NextResponse.redirect(failUrl);
    }

    const redirectUrl = buildRedirectUrl(req, {
      provider,
      status: 'success',
      session_id: orderId,
      payment_id: paymentId,
      since,
    });

    return NextResponse.redirect(redirectUrl);
  }

  if (!paymentLinkId || !paymentId || !linkStatus || !signature) {
    // For subscription payments, we only get payment_id and signature (no payment_link fields)
    // This is expected behavior, so we log at DEBUG level to reduce noise
    if (paymentId && signature && subscriptionId) {
      Logger.debug('Razorpay subscription callback handled without payment link fields', {
        paymentId: Boolean(paymentId),
        subscriptionId: Boolean(subscriptionId),
      });
    } else {
      const keys = params instanceof URLSearchParams ? Array.from(params.keys()) : Array.from(params.keys());
      const keysList = keys.join(',');
      Logger.debug('Razorpay callback missing some fields', {
        paymentId: Boolean(paymentId),
        paymentLinkId: Boolean(paymentLinkId),
        subscriptionId: Boolean(subscriptionId),
        orderId: Boolean(orderId),
        linkStatus: Boolean(linkStatus),
        signature: Boolean(signature),
        keysList,
      });
    }

    if (paymentId && signature) {
      const pendingUrl = buildRedirectUrl(req, {
        provider,
        status: 'success',
        payment_id: paymentId,
        since,
      });
      return NextResponse.redirect(pendingUrl);
    }

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

export async function GET(req: NextRequest) {
  return handleCallback(req, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const params = new Map<string, string>();

  try {
    const form = await req.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') params.set(key, value);
    }
  } catch {
    // ignore form parsing errors
  }

  if (params.size === 0) {
    try {
      const json = await req.json();
      if (json && typeof json === 'object') {
        for (const [key, value] of Object.entries(json)) {
          if (typeof value === 'string') params.set(key, value);
        }
      }
    } catch {
      // ignore JSON parsing errors
    }
  }

  if (params.size === 0) {
    for (const [key, value] of req.nextUrl.searchParams.entries()) {
      params.set(key, value);
    }
  }

  if (params.size === 0) {
    Logger.warn('Razorpay callback received no parameters');
  }

  return handleCallback(req, params);
}
