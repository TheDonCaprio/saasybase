import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { getSetting, setSetting, clearSettingsCache, SETTING_DEFAULTS } from '../../../../lib/settings';
import { prisma } from '../../../../lib/prisma';
import { Logger } from '../../../../lib/logger';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { adminRateLimit } from '../../../../lib/rateLimit';
import { PAYMENT_PROVIDERS, getActivePaymentProvider } from '../../../../lib/payment/provider-config';

function normalizeCurrencyCode(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : String(raw ?? '');
  return value.trim().replace(/^['"]|['"]$/g, '').toUpperCase();
}

function isRestrictedCurrencyProvider(providerId: string): boolean {
  const id = (providerId || '').toLowerCase();
  return id === 'paystack' || id === 'razorpay';
}

export async function GET(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-settings:list', { limit: 240, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin settings GET', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });
    const defaults = SETTING_DEFAULTS as Record<string, string>;
    const fallback = defaults[key] ?? '';
    const value = await getSetting(key, fallback);
    const res = NextResponse.json({ key, value });
    // attach rate limit headers
    res.headers.set('X-RateLimit-Limit', '240');
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to load admin setting', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to load setting' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-settings:write', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin settings POST', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const body: unknown = await req.json();
    const b = asRecord(body);
    const key = typeof b?.key === 'string' ? b.key : undefined;
    const value = b?.value;
    if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });

    // Server-side validation for provider-restricted currency selection.
    if (key === 'DEFAULT_CURRENCY') {
      const desired = normalizeCurrencyCode(value);

      if (!desired || !/^[A-Z]{3}$/.test(desired)) {
        return NextResponse.json({ error: 'DEFAULT_CURRENCY must be a 3-letter ISO currency code (e.g. USD)' }, { status: 400 });
      }

      const activeProviderId = getActivePaymentProvider();
      if (isRestrictedCurrencyProvider(activeProviderId)) {
        const config = PAYMENT_PROVIDERS[activeProviderId.toLowerCase()];
        const supported = (config?.supportedCurrencies || []).map((c) => String(c).toUpperCase());
        if (supported.length > 0 && !supported.includes(desired)) {
          return NextResponse.json(
            { error: `Currency ${desired} is not supported by the active provider (${config?.displayName || activeProviderId}).` },
            { status: 400 }
          );
        }
      }
    }

    const result = await setSetting(key, String(value ?? ''));
    const res = NextResponse.json({ key: result.key, value: result.value });
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    res.headers.set('X-RateLimit-Limit', '60');
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to update admin setting', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-settings:write', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin settings PATCH', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const body: unknown = await req.json();
    const b = asRecord(body);
    const key = typeof b?.key === 'string' ? b.key : undefined;
    const value = b?.value;
    if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: String(value ?? '') },
      create: { key, value: String(value ?? '') },
      select: { key: true, value: true }
    });

    // Invalidate cache so clients and server helpers pick up the change immediately
    clearSettingsCache();
    Logger.info('Admin setting upsert', { key: setting.key });

    const res = NextResponse.json({ setting });
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    res.headers.set('X-RateLimit-Limit', '60');
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to upsert admin setting', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message || 'upsert failed' }, { status: 500 });
  }
}

