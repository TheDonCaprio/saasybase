import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../lib/prisma';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../lib/queryUtils';
import { asRecord, toError } from '../../../lib/runtime-guards';
import { Logger } from '../../../lib/logger';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await authService.getSession();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const wantCount = searchParams.get('count') !== 'false';
    const read = searchParams.get('read');
    const type = searchParams.get('type');
    const cursorParam = searchParams.get('cursor');

    // Build base where clause as an untyped record; narrow at Prisma callsites
    let whereBase: Record<string, unknown> = { userId };
    if (read !== null) {
      whereBase.read = read === 'true';
    }
    if (type !== null && type !== 'ALL') {
      whereBase.type = type;
    }

    const search = searchParams.get('search') || '';
    const dbUrl = process.env.DATABASE_URL || '';
    if (search) {
      // search title or message
      whereBase.OR = [
        { title: buildStringContainsFilter(search, dbUrl) },
        { message: buildStringContainsFilter(search, dbUrl) }
      ];
    }

    whereBase = sanitizeWhereForInsensitiveSearch(whereBase, dbUrl) as Record<string, unknown>;

  let notifications: unknown[] = [];
    let safeNextCursor: string | null = null;

    // Helper to run findMany and retry without `mode` if provider errors
    const safeStringify = (v: unknown) => {
      try { return JSON.stringify(v); } catch (e) { return String(e); }
    };

    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = asRecord(queryArgs) ?? {};
        return await prisma.notification.findMany(safeArgs as Prisma.NotificationFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.notification.findMany failed', { queryArgs: safeStringify(queryArgs), error: toError(err) });
        if (isPrismaModeError(err)) {
          Logger.info('Retrying prisma.notification.findMany without `mode`');
          const maybeWhere = (asRecord(queryArgs) ?? {}).where;
          const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(asRecord(queryArgs) || {}), where: strippedWhere } as Prisma.NotificationFindManyArgs;
          return await prisma.notification.findMany(strippedArgs);
        }
        throw err;
      }
    };

    const runCount = async (queryArgs: unknown): Promise<number> => {
      try {
        const safeArgs = asRecord(queryArgs) ?? {};
        return await prisma.notification.count(safeArgs as Prisma.NotificationCountArgs);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          Logger.info('Retrying prisma.notification.count without `mode`');
          const maybeWhere = (asRecord(queryArgs) ?? {}).where;
          const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(asRecord(queryArgs) || {}), where: strippedWhere } as Prisma.NotificationCountArgs;
          return await prisma.notification.count(strippedArgs);
        }
        throw err;
      }
    };

    if (cursorParam) {
      // Keyset / cursor-based pagination (descending)
      // cursor format: base64("<createdAt ISO>::<id>")
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

        notifications = await runFindMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit
        });

          if (notifications.length === limit) {
          const last = notifications[notifications.length - 1];
          const lastRec = asRecord(last) || {};
          const lastCreated = lastRec.createdAt;
          const lastCreatedIso = lastCreated instanceof Date ? lastCreated.toISOString() : (typeof lastCreated === 'string' ? new Date(lastCreated).toISOString() : null);
          const lastId = typeof lastRec.id === 'string' ? lastRec.id : String(lastRec.id ?? '');
          if (lastCreatedIso) safeNextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
        }
      } catch (err: unknown) {
        Logger.warn('Invalid cursor param for notifications', { error: toError(err) });
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
    } else {
      // Legacy page-based offset pagination
      const skip = (page - 1) * limit;

      const where = whereBase;

      notifications = await runFindMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });
    }

  let totalCount: number | null = null;
  let unreadCount: number | null = null;
  let generalCount: number | null = null;
  let billingCount: number | null = null;
  let supportCount: number | null = null;
  let accountCount: number | null = null;
  let readCount: number | null = null;
  
  if (wantCount) {
      // Only compute totals when explicitly requested
      try {
        [totalCount, unreadCount, generalCount, billingCount, supportCount, accountCount, readCount] = await Promise.all([
          runCount({ where: whereBase }),
          runCount({ where: { userId, read: false } }),
          runCount({ where: { userId, type: 'GENERAL' } }),
          runCount({ where: { userId, type: 'BILLING' } }),
          runCount({ where: { userId, type: 'SUPPORT' } }),
          runCount({ where: { userId, type: 'ACCOUNT' } }),
          runCount({ where: { userId, read: true } })
        ]);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          const safeWhere = stripMode(whereBase) as unknown;
          const safeUnreadWhere = stripMode({ userId, read: false }) as unknown;
          const safeGeneralWhere = stripMode({ userId, type: 'GENERAL' }) as unknown;
          const safeBillingWhere = stripMode({ userId, type: 'BILLING' }) as unknown;
          const safeSupportWhere = stripMode({ userId, type: 'SUPPORT' }) as unknown;
          const safeAccountWhere = stripMode({ userId, type: 'ACCOUNT' }) as unknown;
          const safeReadWhere = stripMode({ userId, read: true }) as unknown;
          [totalCount, unreadCount, generalCount, billingCount, supportCount, accountCount, readCount] = await Promise.all([
            runCount({ where: safeWhere }),
            runCount({ where: safeUnreadWhere }),
            runCount({ where: safeGeneralWhere }),
            runCount({ where: safeBillingWhere }),
            runCount({ where: safeSupportWhere }),
            runCount({ where: safeAccountWhere }),
            runCount({ where: safeReadWhere })
          ]);
        } else {
          throw err;
        }
      }
    }

    // Map notifications to safe serializable shapes
    const mappedNotifications = (Array.isArray(notifications) ? notifications : []).map((n) => {
      const r = asRecord(n) || {};
      return {
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : null,
        message: typeof r.message === 'string' ? r.message : null,
        type: typeof r.type === 'string' ? r.type : undefined,
        url: typeof r.url === 'string' ? r.url : null,
        read: typeof r.read === 'boolean' ? r.read : Boolean(r.read),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (typeof r.createdAt === 'string' ? new Date(r.createdAt).toISOString() : null)
      };
    });

    if (mappedNotifications.length === limit) {
      const last = mappedNotifications[mappedNotifications.length - 1];
      const lastCreatedIso = last.createdAt;
      const lastId = last.id;
      if (lastCreatedIso && lastId) safeNextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
    }

    return NextResponse.json({
      notifications: mappedNotifications,
      totalCount,
      unreadCount,
      readCount,
      generalCount,
      billingCount,
      supportCount,
      accountCount,
      currentPage: cursorParam ? 1 : page,
      totalPages: totalCount != null ? Math.ceil(totalCount / limit) : null,
      hasNextPage: totalCount != null ? (cursorParam ? true : page < Math.ceil(totalCount / limit)) : mappedNotifications.length === limit,
      hasPreviousPage: cursorParam ? true : page > 1,
      nextCursor: safeNextCursor
    });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error fetching notifications', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
