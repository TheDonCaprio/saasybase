import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adminRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/admin-actions';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const params = await ctx.params;
  try {
    let actorId: string;
    try {
      actorId = await requireAdmin();
    } catch (err: unknown) {
      const guard = toAuthGuardErrorResponse(err);
      if (guard) return guard;
      console.error('Admin role update auth error', err);
      return NextResponse.json({ error: 'Service temporarily unavailable.' }, { status: 500 });
    }
    const rl = await adminRateLimit(actorId, request, 'admin-users:role', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      console.error('Rate limiter unavailable for admin user role update', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const { role } = await request.json();
    
    if (!['USER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: params.userId },
      data: { role },
      select: { id: true, email: true, role: true }
    });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'user.role_change',
      targetUserId: params.userId,
      targetType: 'user',
      details: { newRole: role, email: user.email },
    });
    const res = NextResponse.json({ success: true, user });
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    res.headers.set('X-RateLimit-Limit', '60');
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error) {
    console.error('Admin role update error:', error);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }
}
