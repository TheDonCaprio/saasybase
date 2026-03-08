import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
import { rateLimit, getClientIP } from '../../../../../lib/rateLimit';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  const params = await ctx.params;
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientIp = getClientIP(request);
    const limiterKey = `support-tickets:update:user:${userId}`;
    const rateLimitResult = await rateLimit(limiterKey, { limit: 30, windowMs: 60_000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      route: request.nextUrl.pathname,
      method: request.method
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Support ticket PATCH rate limiter unavailable', {
        key: limiterKey,
        actorId: userId,
        error: rateLimitResult.error
      });
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
      Logger.warn('Support ticket PATCH rate limit exceeded', {
        actorId: userId,
        remaining: rateLimitResult.remaining
      });
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString()
          }
        }
      );
    }

    const body = await request.json();
    const { status } = body;

    // Validate that the user owns this ticket
    const existingTicket = await prisma.supportTicket.findFirst({
      where: {
        id: params.ticketId,
        userId: userId
      }
    });

    if (!existingTicket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Only allow users to close their own tickets
    if (status !== 'CLOSED') {
      return NextResponse.json({ error: 'Users can only close tickets' }, { status: 403 });
    }

    // Update the ticket status
    const updatedTicket = await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: { status: 'CLOSED' }
    });

    return NextResponse.json(updatedTicket);

  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error updating support ticket', { error: err.message, stack: err.stack, ticketId: params.ticketId, userId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  const params = await ctx.params;
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: params.ticketId, userId },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { email: true, role: true } } }
        }
      }
    });

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Normalize date fields for safe serialization on client
    const mapped = {
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      createdByRole: ticket.createdByRole,
      createdAt: ticket.createdAt?.toISOString?.() ?? null,
      updatedAt: ticket.updatedAt?.toISOString?.() ?? null,
      replies: (ticket.replies || []).map((r) => ({
        id: typeof r.id === 'string' ? r.id : String(r.id),
        message: r.message || '',
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (typeof r.createdAt === 'string' ? new Date(r.createdAt).toISOString() : null),
        user: r.user ? { email: r.user.email ?? null, role: r.user.role ?? null } : null
      }))
    };

    return NextResponse.json(mapped);
  } catch (err) {
    const e = toError(err);
    Logger.error('Error fetching support ticket', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}