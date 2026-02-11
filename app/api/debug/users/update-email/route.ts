import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toError } from '@/lib/runtime-guards';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const id = body.id;
    const email = body.email;
    if (!id || !email) return NextResponse.json({ error: 'id and email required' }, { status: 400 });
    const updated = await prisma.user.update({ where: { id }, data: { email } });
    return NextResponse.json({ success: true, user: updated });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
