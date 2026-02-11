import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse, type UserRole } from '../../../../../../../lib/auth';
import { getSetting, SETTING_KEYS } from '../../../../../../../lib/settings';
import { toError } from '../../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../../lib/logger';
import { buildSupportEmail } from '../../../../../../../lib/emails/support';
import { getSiteName, getSupportEmail, sendEmail, shouldEmailUser } from '../../../../../../../lib/email';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> }
) {
  let actorUserId: string;
  let actorRole: UserRole;
  try {
    const ctx = await requireAdminOrModerator('support');
    actorUserId = ctx.userId;
    actorRole = ctx.role;
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Error creating ticket reply (auth)', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  try {
    const params = await context.params;

    const body: unknown = await request.json();
    const messageRaw = typeof body === 'object' && body !== null && 'message' in body ? (body as Record<string, unknown>).message : undefined;
    const message = typeof messageRaw === 'string' ? messageRaw.trim() : '';

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const created = await prisma.ticketReply.create({
      data: {
        ticketId: params.ticketId,
        userId: actorUserId,
        message
      }
    });

    // Optionally update ticket to in progress if it's open and admin setting enabled
    let statusAfterReply = ticket.status;
    try {
      const autoSet = (await getSetting(SETTING_KEYS.SUPPORT_AUTO_SET_IN_PROGRESS, 'true')) || 'true';
      const enabled = String(autoSet).toLowerCase() === 'true';
      if (enabled) {
        const result = await prisma.supportTicket.updateMany({
          where: {
            id: params.ticketId,
            status: 'OPEN'
          },
          data: { status: 'IN_PROGRESS', updatedAt: new Date() }
        });
        if (result.count > 0) statusAfterReply = 'IN_PROGRESS';
      }
    } catch {
      // If settings read fails, fallback to current behaviour (safe default = enable)
      const result = await prisma.supportTicket.updateMany({
        where: {
          id: params.ticketId,
          status: 'OPEN'
        },
        data: { status: 'IN_PROGRESS', updatedAt: new Date() }
      });
      if (result.count > 0) statusAfterReply = 'IN_PROGRESS';
    }

    // Normalize reply shape to avoid leaking internal Prisma types
    const reply = {
      id: typeof created.id === 'string' ? created.id : String(created.id ?? ''),
      ticketId: typeof created.ticketId === 'string' ? created.ticketId : String(created.ticketId ?? ''),
      userId: typeof created.userId === 'string' ? created.userId : String(created.userId ?? ''),
      message: typeof created.message === 'string' ? created.message : String(created.message ?? ''),
      createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : (typeof created.createdAt === 'string' ? new Date(created.createdAt).toISOString() : null)
    };

    await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: {
        status: statusAfterReply,
        updatedAt: new Date()
      }
    });

    void (async () => {
      try {
        if (!ticket.userId) return;
        const [userEmailOptIn, siteName, adminUser, supportEmail] = await Promise.all([
          shouldEmailUser(ticket.userId),
          getSiteName(),
          prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true, email: true } }),
          getSupportEmail()
        ]);

        if (!userEmailOptIn) return;
        const recipient = ticket.user?.email;
        if (!recipient) return;
        const emailActorRole = actorRole === 'MODERATOR' ? 'ADMIN' : actorRole;

        const payload = buildSupportEmail({
          ticketId: ticket.id,
          ticketSubject: ticket.subject,
          ticketStatus: statusAfterReply,
          message,
          actor: {
            role: emailActorRole,
            name: adminUser?.name ?? 'Support',
            email: adminUser?.email ?? supportEmail
          },
          siteName,
          audience: 'USER'
        });

        await sendEmail({
          to: recipient,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          userId: ticket.userId
        });
      } catch (notifyErr: unknown) {
        const err = toError(notifyErr);
        Logger.warn('Failed to send admin support reply email', { error: err.message, ticketId: ticket.id });
      }
    })();

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error creating ticket reply', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
