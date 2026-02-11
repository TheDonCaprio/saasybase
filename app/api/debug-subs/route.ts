import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { toError } from '../../../lib/runtime-guards';
import { requireAdmin } from '../../../lib/auth';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      include: { plan: true, payments: true },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ 
      ok: true, 
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        status: sub.status,
        plan: sub.plan.name,
        startedAt: sub.startedAt,
        expiresAt: sub.expiresAt,
        canceledAt: sub.canceledAt,
        payments: sub.payments.length,
        userId: sub.userId
      }))
    });
  } catch (err: unknown) {
    console.error('Debug subscriptions error', err);
    const e = toError(err);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
