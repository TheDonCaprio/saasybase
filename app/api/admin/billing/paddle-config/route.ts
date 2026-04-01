import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { adminRateLimit } from '@/lib/rateLimit';
import { Logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getIdByProvider } from '@/lib/utils/provider-ids';
import { Prisma } from '@prisma/client';

type PaddleErrorEnvelope = {
  error?: {
    type?: string;
    code?: string;
    detail?: string;
    documentation_url?: string;
  };
  meta?: { request_id?: string };
};

type PaddleRequestError = Error & { paddle?: unknown; status?: number };

function asPaddleErrorEnvelope(input: unknown): PaddleErrorEnvelope | null {
  if (!input || typeof input !== 'object') return null;
  return input as PaddleErrorEnvelope;
}

function getPaddleApiBaseUrl(): string {
  const explicit = process.env.PADDLE_API_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const env = (process.env.PADDLE_ENV || '').toLowerCase();
  const isSandbox = env === 'sandbox';
  return isSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

async function paddleRequest<T>(apiKey: string, baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body || {}) as PaddleErrorEnvelope;
    const code = err?.error?.code;
    const detail = err?.error?.detail;
    const msg = typeof detail === 'string' && detail.trim()
      ? detail
      : typeof code === 'string' && code.trim()
        ? code
        : `Paddle API request failed (${res.status})`;
    const e = new Error(msg) as PaddleRequestError;
    e.paddle = body;
    e.status = res.status;
    throw e;
  }

  return body as T;
}

/**
 * GET /api/admin/billing/paddle-config
 * Admin-only health/config check for Paddle.
 *
 * Detects:
 * - missing env vars
 * - invalid API key (basic API ping)
 * - missing Default Payment Link (checkout probe)
 */
export async function GET(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-billing:paddle-config', { limit: 60, windowMs: 60_000 });
    if (!rl.success && !rl.allowed) {
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } },
      );
    }

    const apiKeySet = Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_API_KEY !== 'xxx');
    const webhookSecretSet = Boolean(process.env.PADDLE_WEBHOOK_SECRET && process.env.PADDLE_WEBHOOK_SECRET !== 'xxx');
    const baseUrl = getPaddleApiBaseUrl();

    const result: {
      provider: 'paddle';
      apiBaseUrl: string;
      env: { apiKeySet: boolean; webhookSecretSet: boolean };
      apiReachable: boolean;
      issues: Array<{ code: string; detail: string; documentationUrl?: string; requestId?: string }>;
      probe?: { usedPriceId?: string; usedCustomerEmail?: string };
    } = {
      provider: 'paddle',
      apiBaseUrl: baseUrl,
      env: { apiKeySet, webhookSecretSet },
      apiReachable: false,
      issues: [],
    };

    if (!apiKeySet) {
      result.issues.push({
        code: 'missing_api_key',
        detail: 'PADDLE_API_KEY is not set.',
      });
      return NextResponse.json(result, { status: 200 });
    }

    const apiKey = process.env.PADDLE_API_KEY as string;

    // 1) Basic ping: list one price. This validates API key + base URL.
    try {
      await paddleRequest(apiKey, baseUrl, '/prices?per_page=1');
      result.apiReachable = true;
    } catch (e: unknown) {
      const paddle = e && typeof e === 'object' ? asPaddleErrorEnvelope((e as PaddleRequestError).paddle) : null;
      result.issues.push({
        code: 'api_unreachable',
        detail: e instanceof Error ? e.message : 'Failed to reach Paddle API.',
        documentationUrl: paddle?.error?.documentation_url,
        requestId: paddle?.meta?.request_id,
      });
      Logger.error('Admin Paddle config check: API ping failed', { actorId, error: e instanceof Error ? e.message : String(e), paddle });
      return NextResponse.json(result, { status: 200 });
    }

    // 2) Checkout probe: create a customer + transaction using an existing Paddle priceId.
    // This is the only reliable way (in practice) to detect missing Default Payment Link.
    const where: Prisma.PlanWhereInput = {
      OR: [
        { externalPriceIds: { contains: 'pri_' } },
        { externalPriceId: { startsWith: 'pri_' } },
      ],
    };

    const plan = await prisma.plan.findFirst({
      where,
      select: {
        id: true,
        name: true,
        externalPriceIds: true,
        externalPriceId: true,
      },
    });

    const priceId =
      (plan ? getIdByProvider(plan.externalPriceIds, 'paddle', null) : null)
      || (plan?.externalPriceId && plan.externalPriceId.startsWith('pri_') ? plan.externalPriceId : null);

    if (!priceId) {
      result.issues.push({
        code: 'no_paddle_prices_configured',
        detail: 'No Paddle price IDs (pri_...) found on any plan. Run “Sync providers” first.',
      });
      return NextResponse.json(result, { status: 200 });
    }

    const probeEmail = `paddle-config-check+${Date.now()}@example.com`;
    result.probe = { usedPriceId: priceId, usedCustomerEmail: probeEmail };

    try {
      const customerRes = await paddleRequest<{ data?: { id?: string } }>(apiKey, baseUrl, '/customers', {
        method: 'POST',
        body: JSON.stringify({
          email: probeEmail,
          name: 'Paddle Config Check',
          custom_data: { configCheck: true },
        }),
      });
      const customerId = customerRes?.data?.id;
      if (!customerId || typeof customerId !== 'string') {
        result.issues.push({
          code: 'probe_customer_failed',
          detail: 'Could not create a probe customer on Paddle.',
        });
        return NextResponse.json(result, { status: 200 });
      }

      const txnRes = await paddleRequest<{ data?: { id?: string; checkout?: { url?: string | null } | null } }>(
        apiKey,
        baseUrl,
        '/transactions',
        {
          method: 'POST',
          body: JSON.stringify({
            items: [{ price_id: priceId, quantity: 1 }],
            customer_id: customerId,
            custom_data: { configCheck: true },
          }),
        },
      );

      const checkoutUrl = txnRes?.data?.checkout?.url;
      if (!checkoutUrl) {
        result.issues.push({
          code: 'probe_no_checkout_url',
          detail: 'Paddle created a transaction but did not return a checkout URL.',
        });
      }
    } catch (e: unknown) {
      const paddle = e && typeof e === 'object' ? asPaddleErrorEnvelope((e as PaddleRequestError).paddle) : null;
      const code = paddle?.error?.code;
      if (code === 'transaction_default_checkout_url_not_set') {
        result.issues.push({
          code: 'default_payment_link_not_set',
          detail:
            'A Default Payment Link is not configured in Paddle Dashboard (Checkout settings). This is required for API-created transactions to produce a checkout URL.',
          documentationUrl: paddle?.error?.documentation_url,
          requestId: paddle?.meta?.request_id,
        });
      } else {
        result.issues.push({
          code: 'checkout_probe_failed',
          detail: e instanceof Error ? e.message : 'Checkout probe failed.',
          documentationUrl: paddle?.error?.documentation_url,
          requestId: paddle?.meta?.request_id,
        });
      }

      Logger.error('Admin Paddle config check: checkout probe failed', {
        actorId,
        error: e instanceof Error ? e.message : String(e),
        paddle,
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const res = toAuthGuardErrorResponse(err);
    if (res) return res;
    Logger.error('Admin Paddle config check failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Failed to check Paddle configuration' }, { status: 500 });
  }
}
