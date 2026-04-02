export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
// Prisma type already imported further down if needed
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import type { Prisma } from '@/lib/prisma-client';

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrModerator('notifications');

    const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const wantCount = searchParams.get('count') !== 'false';
  const cursor = searchParams.get('cursor');
  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'ALL';


  const dbUrl = process.env.DATABASE_URL || '';
  let where: Record<string, unknown> = {};
  
  // Handle type filtering (GENERAL, BILLING, SUPPORT, ACCOUNT)
  if (status && !['ALL', 'READ', 'UNREAD'].includes(status)) {
    where.type = status;
  }
  // Handle read/unread filtering
  else if (status && status !== 'ALL') {
    if (status === 'READ') where.read = true;
    else if (status === 'UNREAD') where.read = false;
  }

    if (search) {
      where.OR = [
        { title: buildStringContainsFilter(search, dbUrl) },
        { message: buildStringContainsFilter(search, dbUrl) },
        { user: { email: buildStringContainsFilter(search, dbUrl) } }
      ];
    }

    where = sanitizeWhereForInsensitiveSearch(where, dbUrl);

    // helper to run findMany with retry without `mode`.
    // Accept unknown here and cast only at the Prisma callsites to allow building
    // filters containing `mode` that will be stripped for SQLite.
    const safeStringify = (v: unknown) => {
      try { return JSON.stringify(v); } catch (e) { return String(e); }
    };

    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
  // Cast only at the Prisma callsite. Build safeArgs then cast once.
  const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {};
  return await prisma.notification.findMany(safeArgs as Prisma.NotificationFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.notification.findMany failed', { error: toError(err), queryArgs: safeStringify(queryArgs) });
        if (isPrismaModeError(err)) {
          // Narrow queryArgs safely before reading `.where`
          const origWhere = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>).where : undefined;
          const safeWhere = origWhere ? stripMode(origWhere as Record<string, unknown>) : undefined;
          const safeArgs: Record<string, unknown> = typeof queryArgs === 'object' && queryArgs !== null ? { ...(queryArgs as Record<string, unknown>), where: safeWhere } : { where: safeWhere };
          Logger.info('Retrying prisma.notification.findMany without `mode`', { safeArgs: safeStringify(safeArgs) });
          return await prisma.notification.findMany(safeArgs as Prisma.NotificationFindManyArgs);
        }
        throw err;
      }
    };

    const runCount = async (queryArgs: unknown): Promise<number> => {
      try {
        const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {};
        return await prisma.notification.count(safeArgs as Prisma.NotificationCountArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.notification.count failed', { error: toError(err) });
        if (isPrismaModeError(err)) {
          const maybeWhere = (queryArgs as Record<string, unknown> | undefined)?.where as unknown;
          const strippedWhere = maybeWhere ? stripMode(maybeWhere as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(queryArgs as Record<string, unknown> || {}), where: strippedWhere } as Prisma.NotificationCountArgs;
          Logger.info('Retrying prisma.notification.count without `mode`', { strippedArgs });
          return await prisma.notification.count(strippedArgs);
        }
        throw err;
      }
    };

  let itemsUnknown: unknown;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [cursorCreatedAt, cursorId] = decoded.split('::');
        const cursorDate = new Date(cursorCreatedAt);

        const keysetWhere: Record<string, unknown> = {
          AND: [
            where,
            {
              OR: [
                { createdAt: { lt: cursorDate } },
                { AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }] }
              ]
            }
          ]
        };

        itemsUnknown = await runFindMany({
          where: keysetWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          include: { user: { select: { email: true, name: true } } }
        });
      } catch (e: unknown) {
        Logger.warn('Invalid cursor for admin notifications', { error: toError(e) });
        itemsUnknown = await runFindMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          include: { user: { select: { email: true, name: true } } }
        });
      }
    } else if (page && page > 1) {
      // fallback to offset pagination when a page is requested
      const skip = (page - 1) * limit;
      itemsUnknown = await runFindMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: { user: { select: { email: true, name: true } } }
      });
    } else {
      itemsUnknown = await runFindMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: { user: { select: { email: true, name: true } } }
      });
    }

  const items = Array.isArray(itemsUnknown) ? (itemsUnknown as unknown[]) : [];

    // Map items to a safe serializable shape to avoid leaking runtime `any`s
    const mappedItems = items.map((it) => {
      const rec = asRecord(it) || {};
      const userRec = asRecord(rec.user) || {};

      return {
        id: typeof rec.id === 'string' ? rec.id : String(rec.id ?? ''),
        title: typeof rec.title === 'string' ? rec.title : null,
        message: typeof rec.message === 'string' ? rec.message : null,
        type: typeof rec.type === 'string' ? rec.type : null,
        read: typeof rec.read === 'boolean' ? rec.read : Boolean(rec.read),
        userEmail: typeof userRec.email === 'string' ? userRec.email : null,
        createdAt: rec.createdAt instanceof Date ? rec.createdAt.toISOString() : (typeof rec.createdAt === 'string' ? new Date(rec.createdAt).toISOString() : null),
      };
    });

    let totalCount: number | null = null;
    let generalCount = 0;
    let billingCount = 0;
    let supportCount = 0;
    let accountCount = 0;
    
    if (wantCount) {
      try {
        totalCount = await runCount({ where });
        
        // Get counts per type (without status filter, only search filter if present)
        const baseWhere: Record<string, unknown> = {};
        if (search) {
          baseWhere.OR = [
            { title: buildStringContainsFilter(search, dbUrl) },
            { message: buildStringContainsFilter(search, dbUrl) },
            { user: { email: buildStringContainsFilter(search, dbUrl) } }
          ];
        }
        const sanitizedBaseWhere = sanitizeWhereForInsensitiveSearch(baseWhere, dbUrl);
        
        generalCount = await runCount({ where: { ...sanitizedBaseWhere, type: 'GENERAL' } });
        billingCount = await runCount({ where: { ...sanitizedBaseWhere, type: 'BILLING' } });
        supportCount = await runCount({ where: { ...sanitizedBaseWhere, type: 'SUPPORT' } });
        accountCount = await runCount({ where: { ...sanitizedBaseWhere, type: 'ACCOUNT' } });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.error('Failed to count admin notifications', { error: e.message, stack: e.stack });
        throw err;
      }
    }

    let safeNextCursor: string | null = null;
    if (mappedItems.length === limit) {
      const last = mappedItems[mappedItems.length - 1];
      const lastCreatedIso = last.createdAt;
      const lastId = last.id;
      if (lastCreatedIso && lastId) safeNextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
    }

    return NextResponse.json({
      items: mappedItems,
      totalCount,
      generalCount,
      billingCount,
      supportCount,
      accountCount,
      nextCursor: safeNextCursor
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Error fetching notifications', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
