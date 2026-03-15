import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '../../../../lib/prisma';
import { toError } from '../../../../lib/runtime-guards';

function debugRouteDisabled() {
  return process.env.NODE_ENV === 'production' || process.env.ENABLE_DEBUG_ROUTES !== 'true';
}

// Dev-only endpoint: lists subscriptions & payments for the authenticated admin user.
export async function GET() {
  if (debugRouteDisabled()) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  try {
    const userId = await requireAdmin();

    const [subscriptions, payments] = await Promise.all([
      prisma.subscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      prisma.payment.findMany({ where: { userId }, include: { subscription: { include: { plan: true } } }, orderBy: { createdAt: 'desc' } })
    ]);

    return NextResponse.json({ ok: true, count: { subscriptions: subscriptions.length, payments: payments.length }, subscriptions, payments });
  } catch (err: unknown) {
    const authResponse = toAuthGuardErrorResponse(err);
    if (authResponse) return authResponse;
    console.error('[debug/subscriptions] error', err);
    const e = toError(err);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
}
