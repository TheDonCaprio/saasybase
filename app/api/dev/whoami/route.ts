import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Keep this helper minimal for local debugging. We avoid assigning unused vars.
  await requireAdmin();
  const firstAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  return NextResponse.json({ firstAdminId: firstAdmin?.id || null });
}
