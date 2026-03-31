import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { authService } from '@/lib/auth-provider';
import { Logger } from '../../../../../../lib/logger';
import { toError } from '../../../../../../lib/runtime-guards';
import { buildSupportEmail } from '../../../../../../lib/emails/support';
import { getSiteName, getSupportEmail, sendEmail } from '../../../../../../lib/email';
import { isSupportEmailNotificationEnabled } from '../../../../../../lib/notifications';
import { rateLimit, getClientIP } from '../../../../../../lib/rateLimit';

export async function POST(request: NextRequest, ctx: { params: Promise<{ ticketId: string }> }) {
  const params = await ctx.params;
  try {
    const { userId } = await authService.getSession();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const sanitizeMessage = (value: unknown) => {
      const raw = typeof value === 'string' ? value : '';
      const cleaned = raw
        .replace(/\0/g, '')
        .replace(/\r\n|\r/g, '\n')
        .trim();
      return cleaned.slice(0, 5000);
    };

    const body = (await request.json()) as { message?: unknown };
    const message = sanitizeMessage(body?.message);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const clientIp = getClientIP(request);
    const limiterKey = `support-tickets:reply:user:${userId}`;
    const rateLimitResult = await rateLimit(limiterKey, { limit: 30, windowMs: 60_000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      route: request.nextUrl.pathname,
      method: request.method
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Support ticket reply rate limiter unavailable', {
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
      Logger.warn('Support ticket reply rate limit exceeded', {
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

    // Verify the ticket belongs to the user
    const ticket = await prisma.supportTicket.findFirst({
      where: { 
        id: params.ticketId,
        userId: userId
      },
      include: {
        user: { select: { email: true, name: true } }
      }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found or not authorized' }, { status: 404 });
    }

    // Don't allow replies to closed tickets
    if (ticket.status === 'CLOSED') {
      return NextResponse.json({ error: 'Cannot reply to closed ticket' }, { status: 400 });
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: params.ticketId,
        userId: userId,
        message
      }
    });

    // Update ticket status to indicate user has replied
    await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: { 
        status: 'OPEN', // Reset to OPEN when user replies
        updatedAt: new Date()
      }
    });

    void (async () => {
      try {
        const supportEmailEnabled = await isSupportEmailNotificationEnabled('user_reply_to_admin');
        if (!supportEmailEnabled) return;

        const [supportEmail, siteName] = await Promise.all([
          getSupportEmail(),
          getSiteName()
        ]);

        if (!supportEmail) return;

        const payload = buildSupportEmail({
          ticketId: ticket.id,
          ticketSubject: ticket.subject,
          ticketStatus: 'OPEN',
          message,
          actor: {
            role: 'USER',
            name: ticket.user?.name,
            email: ticket.user?.email
          },
          siteName,
          audience: 'ADMIN'
        });

        const result = await sendEmail({
          to: supportEmail,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          userId
        });

        if (!result.success) {
          Logger.warn('Support ticket reply email delivery failed', {
            ticketId: ticket.id,
            error: result.error,
          });
        }
      } catch (notifyErr: unknown) {
        Logger.warn('Failed to send support ticket reply email', { error: toError(notifyErr).message, ticketId: ticket.id });
      }
    })();

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error creating user ticket reply', { error: err.message, stack: err.stack, ticketId: params.ticketId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
