export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../../lib/queryUtils';
import { Logger } from '../../../../../lib/logger';
import { asRecord, toError } from '../../../../../lib/runtime-guards';

const createTicketSchema = z.object({
  userId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000)
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrModerator('support');

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const status = searchParams.get('status');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const wantCount = searchParams.get('count') !== 'false';
  const cursor = searchParams.get('cursor');

  const skip = (page - 1) * limit;

  // Validate sort parameters
  const validSortFields = ['createdAt', 'status', 'lastResponse'] as const;
  type SortField = typeof validSortFields[number];
  const validatedSort: SortField = validSortFields.includes(sortBy as SortField)
    ? (sortBy as SortField)
    : 'createdAt';
  const validatedOrder: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  const buildOrderBy = (): Prisma.SupportTicketOrderByWithRelationInput[] => {
    const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] = [];
    if (validatedSort === 'status') {
      orderBy.push({ status: validatedOrder });
      // Stable fallback so items within a status are consistently ordered
      orderBy.push({ createdAt: 'desc' });
    } else if (validatedSort === 'lastResponse') {
      orderBy.push({ updatedAt: validatedOrder });
      // Fallback to created date to stabilize ordering when updatedAt ties
      orderBy.push({ createdAt: validatedOrder });
    } else {
      orderBy.push({ createdAt: validatedOrder });
    }
    orderBy.push({ id: 'desc' });
    return orderBy;
  };

  const orderBy = buildOrderBy();
  const include = {
    user: { select: { email: true, name: true } },
    replies: {
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { email: true, name: true, role: true } } }
    }
  } as const;

      // Build where clause
  const dbUrl = process.env.DATABASE_URL || '';
  let where: Record<string, unknown> = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { subject: buildStringContainsFilter(search, dbUrl) },
        { message: buildStringContainsFilter(search, dbUrl) },
        { user: { email: buildStringContainsFilter(search, dbUrl) } }
      ];
    }

    // Date range filtering (startDate inclusive, endDate exclusive)
    if (startDateParam || endDateParam) {
      const dateWhere: Record<string, unknown> = {};
      if (startDateParam) {
        const sd = new Date(`${startDateParam}T00:00:00Z`);
        if (!Number.isNaN(sd.getTime())) dateWhere.gte = sd;
      }
      if (endDateParam) {
        const ed = new Date(`${endDateParam}T00:00:00Z`);
        if (!Number.isNaN(ed.getTime())) dateWhere.lt = ed;
      }
      if (Object.keys(dateWhere).length > 0) {
        where.createdAt = dateWhere;
      }
    }

    where = sanitizeWhereForInsensitiveSearch(where, dbUrl);

    // Helper that retries without `mode` on Prisma validation errors.
    // Accept `unknown` here and cast only at the Prisma callsite so that callers
    // can build filters containing `mode` that will be stripped for SQLite.
    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = (queryArgs as Record<string, unknown> | undefined) ?? {};
        return await prisma.supportTicket.findMany(safeArgs as Prisma.SupportTicketFindManyArgs);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          // Narrow queryArgs before accessing `.where`
          let origWhere: unknown = undefined;
          if (typeof queryArgs === 'object' && queryArgs !== null) {
            origWhere = (queryArgs as Record<string, unknown>).where;
          }
          const safeWhere = origWhere ? stripMode(origWhere as Record<string, unknown>) : undefined;
          const safeArgs: Record<string, unknown> = typeof queryArgs === 'object' && queryArgs !== null ? { ...(queryArgs as Record<string, unknown>), where: safeWhere } : { where: safeWhere };
          return await prisma.supportTicket.findMany(safeArgs as Prisma.SupportTicketFindManyArgs);
        }
        throw err;
      }
    };

  // Get tickets with pagination and optional count (support keyset cursor)
  let tickets: unknown;
  if (cursor && validatedSort === 'createdAt' && validatedOrder === 'desc') {
    // cursor format: base64("<createdAt>::<id>")
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [cursorCreatedAt, cursorId] = decoded.split('::');
      const cursorDate = new Date(cursorCreatedAt);

      // For DESC ordering: createdAt < cursorCreatedAt OR (createdAt == cursorCreatedAt AND id < cursorId)
      const keysetWhere = {
        AND: [
          where,
          {
            OR: [
              { createdAt: { lt: cursorDate } },
              { AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }] }
            ]
          }
        ]
      } as Record<string, unknown>;

      tickets = await runFindMany({
        where: keysetWhere,
        orderBy,
        take: limit,
        include
      });
    } catch (e: unknown) {
      Logger.warn('Invalid cursor provided for support tickets', { error: toError(e) });
      tickets = await runFindMany({
        where,
        orderBy,
        take: limit,
        include
      });
    }
  } else {
    tickets = await runFindMany({
      where,
      orderBy,
      skip,
      take: limit,
      include
    });
  }

    let totalCount: number | null = null;
    if (wantCount) {
      try {
        totalCount = await prisma.supportTicket.count({ where: where as Prisma.SupportTicketWhereInput });
      } catch (err) {
        if (isPrismaModeError(err)) {
          totalCount = await prisma.supportTicket.count({ where: stripMode(where) as Prisma.SupportTicketWhereInput });
        } else {
          throw err;
        }
      }
    }

    // compute nextCursor if keyset used or if we have more results than or equal to limit
    let nextCursor: string | null = null;
    if (validatedSort === 'createdAt' && validatedOrder === 'desc' && Array.isArray(tickets) && tickets.length === limit) {
      const lastUnknown = tickets[tickets.length - 1];
      const lastRec = asRecord(lastUnknown) || {};
      const created = lastRec.createdAt;
      const id = lastRec.id;
      let lastIso: string | null = null;
      if (created instanceof Date) lastIso = created.toISOString();
      else if (typeof created === 'string') {
        const d = new Date(created);
        if (!Number.isNaN(d.getTime())) lastIso = d.toISOString();
      }
      const lastId = typeof id === 'string' ? id : (id != null ? String(id) : null);
      if (lastIso && lastId) {
        const payload = `${lastIso}::${lastId}`;
        nextCursor = Buffer.from(payload).toString('base64');
      }
    }

    return NextResponse.json({
      tickets,
      totalCount,
      currentPage: page,
      totalPages: totalCount != null ? Math.ceil(totalCount / limit) : null,
  hasNextPage: totalCount != null ? page < Math.ceil(totalCount / limit) : (Array.isArray(tickets) ? tickets.length === limit : false),
      hasPreviousPage: page > 1,
      nextCursor
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Error fetching admin support tickets', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to fetch support tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrModerator('support');

    const payload = await request.json();
    const validation = createTicketSchema.safeParse(payload);

    if (!validation.success) {
      const issues = validation.error.errors.map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`);
      Logger.warn('Invalid admin ticket payload', { issues });
      return NextResponse.json({ error: 'Invalid ticket payload', issues }, { status: 400 });
    }

    const { userId, subject, message } = validation.data;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        subject,
        message,
        status: 'OPEN',
        createdByRole: 'ADMIN'
      }
    });

    return NextResponse.json({ ticket });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Error creating admin support ticket', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
