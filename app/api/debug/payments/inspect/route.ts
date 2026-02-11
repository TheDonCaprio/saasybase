import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toError } from '@/lib/runtime-guards';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const ids = url.searchParams.getAll('id');
    if (!ids || ids.length === 0) return NextResponse.json({ error: 'Provide id params' }, { status: 400 });
    const rows = await prisma.payment.findMany({ where: { id: { in: ids } }, include: { subscription: true, user: true, plan: true } });
    return NextResponse.json({ rows });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
