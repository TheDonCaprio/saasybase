import { NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../lib/prisma';
import { toError } from '../../../../lib/runtime-guards';

// Dev-only endpoint: lists all subscriptions & payments for current (or fallback) user
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  try {
    const { userId: clerkUserId } = await authService.getSession();
    let userId = clerkUserId as string | null;
    if (!userId) {
      userId = process.env.DEV_ADMIN_ID || (await prisma.user.findFirst({ where: { role: 'ADMIN' } }))?.id || null;
    }
    if (!userId) return NextResponse.json({ ok: false, error: 'No user' }, { status: 401 });

    const [subscriptions, payments] = await Promise.all([
      prisma.subscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      prisma.payment.findMany({ where: { userId }, include: { subscription: { include: { plan: true } } }, orderBy: { createdAt: 'desc' } })
    ]);

    return NextResponse.json({ ok: true, count: { subscriptions: subscriptions.length, payments: payments.length }, subscriptions, payments });
  } catch (err: unknown) {
    console.error('[debug/subscriptions] error', err);
    const e = toError(err);
    return NextResponse.json({ ok: false, error: e.message || 'Error' }, { status: 500 });
  }
}
