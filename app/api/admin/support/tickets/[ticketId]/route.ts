import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { recordAdminAction } from '../../../../../../lib/admin-actions';

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ ticketId: string }> }) {
  const params = await ctx.params;
  let actor: Awaited<ReturnType<typeof requireAdminOrModerator>>;
  try {
    actor = await requireAdminOrModerator('support');
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const statusRaw = typeof body === 'object' && body !== null && 'status' in body ? (body as Record<string, unknown>).status : undefined;
    const status = typeof statusRaw === 'string' ? statusRaw : undefined;

    if (!status || !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: { status, updatedAt: new Date() }
    });

    await recordAdminAction({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'support.update_status',
      targetUserId: ticket.userId,
      targetType: 'ticket',
      details: { ticketId: params.ticketId, newStatus: status },
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ ticketId: string }> }) {
  const params = await ctx.params;
  try {
    await requireAdminOrModerator('support');
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      include: {
        user: { select: { email: true, name: true } },
        replies: { orderBy: { createdAt: 'asc' }, include: { user: { select: { email: true, name: true, role: true } } } }
      }
    });

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Normalize for safe serialization
    const mapped = {
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      category: ticket.category,
      status: ticket.status,
      createdByRole: ticket.createdByRole,
      createdAt: ticket.createdAt?.toISOString?.() ?? null,
      updatedAt: ticket.updatedAt?.toISOString?.() ?? null,
      user: ticket.user ? { email: ticket.user.email ?? null, name: ticket.user.name ?? null } : null,
      replies: (ticket.replies || []).map((r) => ({
        id: typeof r.id === 'string' ? r.id : String(r.id),
        message: r.message || '',
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (typeof r.createdAt === 'string' ? new Date(r.createdAt).toISOString() : null),
        user: r.user ? { email: r.user.email ?? null, name: r.user.name ?? null, role: r.user.role ?? null } : null
      }))
    };

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('Error fetching admin support ticket:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
