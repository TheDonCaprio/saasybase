import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import type { Prisma } from '@prisma/client';
import { authService } from '@/lib/auth-provider';
import { buildSupportEmail } from '../../../../lib/emails/support';
import { getSiteName, getSupportEmail, sendEmail } from '../../../../lib/email';
import { isSupportEmailNotificationEnabled } from '../../../../lib/notifications';
import { rateLimit, getClientIP } from '../../../../lib/rateLimit';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientIp = getClientIP(request);
    const limiterKey = `support-tickets:read:user:${userId}`;
  const rateLimitResult = await rateLimit(limiterKey, { limit: 300, windowMs: 60_000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      route: request.nextUrl.pathname,
      method: request.method
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Support tickets GET rate limiter unavailable', {
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
      Logger.warn('Support tickets GET rate limit exceeded', {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sortByParam = searchParams.get('sortBy') || 'createdAt';
    const sortOrderParam = searchParams.get('sortOrder') || 'desc';
    const cursorParam = searchParams.get('cursor');
    const wantCount = searchParams.get('count') !== 'false';

    const validSortFields = ['createdAt', 'lastResponse'] as const;
    type SortField = typeof validSortFields[number];
    const validatedSort: SortField = validSortFields.includes(sortByParam as SortField)
      ? (sortByParam as SortField)
      : 'createdAt';
    const validatedOrder: Prisma.SortOrder = sortOrderParam === 'asc' ? 'asc' : 'desc';

    const buildOrderBy = (): Prisma.SupportTicketOrderByWithRelationInput[] => {
      const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] = [];
      if (validatedSort === 'lastResponse') {
        orderBy.push({ updatedAt: validatedOrder });
        orderBy.push({ createdAt: validatedOrder });
      } else {
        orderBy.push({ createdAt: validatedOrder });
      }
      orderBy.push({ id: 'desc' });
      return orderBy;
    };

    const orderBy = buildOrderBy();

    // Build base where clause as an untyped record; we'll narrow at the Prisma callsite
    let whereBase: Record<string, unknown> = { userId };
    if (status && status !== 'ALL') whereBase.status = status;
    const dbUrl = process.env.DATABASE_URL || '';
    if (search) {
      whereBase.OR = [
        { id: { contains: search } },
        { subject: buildStringContainsFilter(search, dbUrl) },
        { message: buildStringContainsFilter(search, dbUrl) }
      ];
    }

    whereBase = sanitizeWhereForInsensitiveSearch(whereBase, dbUrl);

    let tickets;
    let nextCursor: string | null = null;

    const safeStringify = (v: unknown) => {
      try { return JSON.stringify(v); } catch (e) { return String(e); }
    };

    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = asRecord(queryArgs) ?? {};
        return await prisma.supportTicket.findMany(safeArgs as Prisma.SupportTicketFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.supportTicket.findMany failed', { queryArgs: safeStringify(queryArgs), error: toError(err) });
        if (isPrismaModeError(err)) {
          Logger.info('Retrying prisma.supportTicket.findMany without `mode`');
          const maybeWhere = (asRecord(queryArgs) ?? {}).where;
          const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(asRecord(queryArgs) || {}), where: strippedWhere } as Prisma.SupportTicketFindManyArgs;
          return await prisma.supportTicket.findMany(strippedArgs);
        }
        throw err;
      }
    };

    const runCount = async (queryArgs: unknown): Promise<number> => {
      try {
        const safeArgs = asRecord(queryArgs) ?? {};
        return await prisma.supportTicket.count(safeArgs as Prisma.SupportTicketCountArgs);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          Logger.info('Retrying prisma.supportTicket.count without `mode`');
          const maybeWhere = (asRecord(queryArgs) ?? {}).where;
          const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(asRecord(queryArgs) || {}), where: strippedWhere } as Prisma.SupportTicketCountArgs;
          return await prisma.supportTicket.count(strippedArgs);
        }
        throw err;
      }
    };

  if (cursorParam && validatedSort === 'createdAt' && validatedOrder === 'desc') {
      try {
        const decoded = Buffer.from(cursorParam, 'base64').toString('utf-8');
        const [createdAtIso, cursorId] = decoded.split('::');
        const cursorDate = new Date(createdAtIso);

        const where = {
          AND: [
            whereBase,
            {
              OR: [
                { createdAt: { lt: cursorDate } },
                { AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }] }
              ]
            }
          ]
        };

        tickets = await runFindMany({
          where,
          orderBy,
          take: limit,
          include: {
            replies: {
              orderBy: { createdAt: 'asc' },
              include: { user: { select: { email: true, role: true } } }
            }
          }
        });

          if (tickets.length === limit) {
            const last = tickets[tickets.length - 1];
            const lastRec = asRecord(last) || {};
            const lastCreated = lastRec.createdAt;
            const lastCreatedIso = lastCreated instanceof Date ? lastCreated.toISOString() : (typeof lastCreated === 'string' ? new Date(lastCreated).toISOString() : null);
            const lastId = typeof lastRec.id === 'string' ? lastRec.id : String(lastRec.id ?? '');
            if (lastCreatedIso) nextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
          }
      } catch (err: unknown) {
        Logger.warn('Invalid support tickets cursor', { error: toError(err) });
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
    } else {
      const skip = (page - 1) * limit;

      tickets = await runFindMany({
        where: whereBase,
        orderBy,
        skip,
        take: limit,
        include: {
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { email: true, role: true } } }
          }
        }
      });
    }

    let totalCount: number | null = null;
    if (wantCount) {
      try {
        totalCount = await runCount({ where: whereBase });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.error('Failed to count support tickets', { error: e.message, stack: e.stack });
        throw err;
      }
    }

    // Normalize tickets for safe serialization
    const mappedTickets = Array.isArray(tickets) ? tickets.map((t) => {
      const r = asRecord(t) || {};
      const replies = Array.isArray(r.replies) ? (r.replies as unknown[]).map((rep) => {
        const repRec = asRecord(rep) || {};
        const userRec = asRecord(repRec.user) || {};
        const email = typeof userRec.email === 'string' ? userRec.email : null;
        const role = typeof userRec.role === 'string' ? userRec.role : null;
        return {
          id: typeof repRec.id === 'string' ? repRec.id : String(repRec.id ?? ''),
          message: typeof repRec.message === 'string' ? repRec.message : '',
          createdAt: repRec.createdAt instanceof Date ? repRec.createdAt.toISOString() : (typeof repRec.createdAt === 'string' ? new Date(repRec.createdAt).toISOString() : null),
          user: email || role ? { email, role } : null
        };
      }) : [];

      return {
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        subject: typeof r.subject === 'string' ? r.subject : '',
        message: typeof r.message === 'string' ? r.message : '',
        status: typeof r.status === 'string' ? r.status : 'OPEN',
        createdByRole: typeof r.createdByRole === 'string' ? r.createdByRole : 'USER',
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (typeof r.createdAt === 'string' ? new Date(r.createdAt).toISOString() : null),
        replies
      };
    }) : [];

    return NextResponse.json({ 
      tickets: mappedTickets,
      totalCount,
      currentPage: cursorParam ? 1 : page,
      totalPages: totalCount != null ? Math.ceil(totalCount / limit) : null,
      hasNextPage: totalCount != null ? (cursorParam ? true : page < Math.ceil(totalCount / limit)) : mappedTickets.length === limit,
      hasPreviousPage: cursorParam ? true : page > 1,
      nextCursor
    });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error fetching support tickets', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await authService.getSession();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sanitizeSubject = (value: unknown) => {
    const raw = typeof value === 'string' ? value : '';
    const cleaned = raw
      .replace(/\0/g, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    return cleaned.slice(0, 200);
  };

  const sanitizeMessage = (value: unknown) => {
    const raw = typeof value === 'string' ? value : '';
    const cleaned = raw
      .replace(/\0/g, '')
      .replace(/\r\n|\r/g, '\n')
      .trim();
    return cleaned.slice(0, 5000);
  };

  try {
    const clientIp = getClientIP(request);
    const limiterKey = `support-tickets:create:user:${userId}`;
  const rateLimitResult = await rateLimit(limiterKey, { limit: 30, windowMs: 60_000 }, {
      actorId: userId,
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      route: request.nextUrl.pathname,
      method: request.method
    });

    if (!rateLimitResult.success && !rateLimitResult.allowed) {
      Logger.error('Support tickets POST rate limiter unavailable', {
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
      Logger.warn('Support tickets POST rate limit exceeded', {
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

    const body = await request.json() as unknown;
    const bodyRec = asRecord(body) ?? {};
    const subject = sanitizeSubject(bodyRec.subject);
    const message = sanitizeMessage(bodyRec.message);

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        subject,
        message,
        status: 'OPEN',
        createdByRole: 'USER'
      }
    });

    void (async () => {
      try {
        const supportEmailEnabled = await isSupportEmailNotificationEnabled('new_ticket_to_admin');
        if (!supportEmailEnabled) return;

        const [supportEmail, siteName, user] = await Promise.all([
          getSupportEmail(),
          getSiteName(),
          prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
        ]);

        if (!supportEmail) return;

        const payload = buildSupportEmail({
          ticketId: ticket.id,
          ticketSubject: subject,
          ticketStatus: ticket.status,
          message,
          actor: {
            role: 'USER',
            name: user?.name,
            email: user?.email
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
          Logger.warn('Support ticket creation email delivery failed', {
            ticketId: ticket.id,
            error: result.error,
          });
        }
      } catch (notifyErr: unknown) {
        Logger.warn('Failed to send support ticket creation email', { error: toError(notifyErr).message, ticketId: ticket.id });
      }
    })();

    const safeTicket = {
      id: ticket.id,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      createdAt: ticket.createdAt?.toISOString?.() ?? null
    };

    return NextResponse.json({ ticket: safeTicket });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error creating support ticket', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
