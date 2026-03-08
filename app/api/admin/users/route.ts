import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import type { Prisma } from '@prisma/client';
import { authService } from '@/lib/auth-provider';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import { adminRateLimit } from '../../../../lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminOrModerator('users');
    const actorId = actor.userId;
    const rl = await adminRateLimit(actorId, request, 'admin-users:list', { limit: 240, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for users list', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const safeStringify = (v: unknown) => {
      try {
        return JSON.stringify(v);
      } catch (e) {
        return String(e);
      }
    };

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const billing = searchParams.get('billing'); // ALL | PAID | FREE
    const sort = searchParams.get('sortBy') || searchParams.get('sort') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || searchParams.get('order') || 'desc') as 'asc' | 'desc';

    const skip = (page - 1) * limit;

    // Build where clause
    let where: Record<string, unknown> = {};
    const dbUrl = process.env.DATABASE_URL || '';

    if (search) {
      where.OR = [
        { email: buildStringContainsFilter(search, dbUrl) },
        { name: buildStringContainsFilter(search, dbUrl) },
        { id: buildStringContainsFilter(search, dbUrl) }
      ];
    }

    if (role && role !== 'ALL') {
      where.role = role;
    }

    // Billing filter: users with active subscriptions vs free users
    if (billing && billing !== 'ALL') {
      if (billing === 'PAID') {
        // users with at least one active subscription
        where.subscriptions = { some: { status: 'ACTIVE', expiresAt: { gt: new Date() } } };
      } else if (billing === 'FREE') {
        // users with no active subscriptions
        where.subscriptions = { none: { status: 'ACTIVE', expiresAt: { gt: new Date() } } };
      }
    }

    where = sanitizeWhereForInsensitiveSearch(where, dbUrl);

    // Get total count for pagination (legacy paged UI) unless caller opts out
    const countParam = searchParams.get('count');
    const wantCount = countParam !== 'false';
    let totalCount: number | null = null;
    if (wantCount) {
      try {
        totalCount = await prisma.user.count({ where });
      } catch (err) {
        // Some Prisma providers (older SQLite) don't support `mode` on contains.
        if (isPrismaModeError(err)) {
          const safeWhere = stripMode(where) as Record<string, unknown>;
          // Localized cast to Prisma type instead of `any`.
          const countArgs: Prisma.UserCountArgs = { where: safeWhere as Prisma.UserWhereInput };
          totalCount = await prisma.user.count(countArgs);
        } else {
          throw err;
        }
      }
    }

    // If a cursor is provided, use keyset pagination (cursor = last item's id)
    let usersUnknown: unknown;
    // helper to run a findMany that retries without `mode` if necessary
    // Accept `unknown` so callers can build filters with `mode` safely.
    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {};
        return await prisma.user.findMany(safeArgs as Prisma.UserFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.user.findMany failed', { queryArgs: safeStringify(queryArgs), error: toError(err) });
        if (isPrismaModeError(err)) {
          const origWhere = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>).where : undefined;
          const safeWhere = origWhere ? stripMode(origWhere as Record<string, unknown>) : undefined;
          const safeArgs = { ...(typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {}), where: safeWhere } as Prisma.UserFindManyArgs;
          Logger.info('Retrying prisma.user.findMany without `mode`', { safeArgs: safeStringify(safeArgs) });
          return await prisma.user.findMany(safeArgs);
        }
        throw err;
      }
    };

    // _runCount was removed — counting logic is performed inline where needed.

    // Resolve sort field and build orderBy clause. Allowed server-side sortable fields:
    const validSortFields = ['createdAt', 'name', 'payments'] as const;
    const sortBy = validSortFields.includes(sort as typeof validSortFields[number]) ? (sort as typeof validSortFields[number]) : 'createdAt';

    // Build a Prisma orderBy value depending on requested sort field
    // Use Prisma types so we avoid `any` in later usage.
    let orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] = { createdAt: 'desc' } as Prisma.UserOrderByWithRelationInput;
    if (sortBy === 'createdAt') orderBy = { createdAt: sortOrder } as Prisma.UserOrderByWithRelationInput;
    else if (sortBy === 'name') orderBy = { name: sortOrder } as Prisma.UserOrderByWithRelationInput;
    else if (sortBy === 'payments') orderBy = [{ _count: { payments: sortOrder } } as Prisma.UserOrderByWithRelationInput, { id: 'desc' } as Prisma.UserOrderByWithRelationInput];

    // If cursor provided and sorting by createdAt we can use a keyset-style cursor like before.
    if (cursor && sortBy === 'createdAt') {
      const cursorRow = await prisma.user.findUnique({ where: { id: cursor }, select: { createdAt: true, id: true } });
      if (cursorRow) {
        usersUnknown = await runFindMany({
          where,
          orderBy: [orderBy as Prisma.UserOrderByWithRelationInput, { id: 'desc' } as Prisma.UserOrderByWithRelationInput],
          cursor: { id: cursor },
          skip: 1,
          take: limit,
          include: {
            subscriptions: {
              where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
              orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
              include: { plan: true }
            },
            _count: { select: { payments: true } }
          }
        });
      } else {
        // fallback to offset pagination if cursor invalid
        usersUnknown = await runFindMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            subscriptions: {
              where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
              orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
              include: { plan: true }
            },
            _count: { select: { payments: true } }
          }
        });
      }
    } else if (sortBy === 'payments') {
      // Implement keyset pagination by denormalized `paymentsCount` column.
      // Cursor format: base64("<paymentsCount>::<id>")
      // When a cursor is provided we augment the `where` to only return rows after the cursor
      // using a deterministic tie-breaker on `id`.
      const paymentsOrder: Prisma.UserOrderByWithRelationInput = { paymentsCount: sortOrder } as Prisma.UserOrderByWithRelationInput;
      const idOrder: Prisma.UserOrderByWithRelationInput = { id: sortOrder === 'desc' ? 'desc' : 'asc' } as Prisma.UserOrderByWithRelationInput;

      // Build keyset where clause if cursor present
      if (cursor) {
        try {
          const decoded = Buffer.from(cursor, 'base64').toString('utf8');
          const parts = decoded.split('::');
          if (parts.length === 2) {
            const cursorCount = parseInt(parts[0], 10);
            const cursorId = parts[1];
            if (!Number.isNaN(cursorCount) && cursorId) {
              // For descending sort: want paymentsCount < cursorCount OR (paymentsCount == cursorCount AND id < cursorId)
              // For ascending sort: reverse comparisons.
              if (sortOrder === 'desc') {
                where = {
                  AND: [
                    where,
                    {
                      OR: [
                        { paymentsCount: { lt: cursorCount } },
                        { AND: [{ paymentsCount: cursorCount }, { id: { lt: cursorId } }] }
                      ]
                    }
                  ]
                } as Record<string, unknown>;
              } else {
                where = {
                  AND: [
                    where,
                    {
                      OR: [
                        { paymentsCount: { gt: cursorCount } },
                        { AND: [{ paymentsCount: cursorCount }, { id: { gt: cursorId } }] }
                      ]
                    }
                  ]
                } as Record<string, unknown>;
              }
            }
          }
        } catch (err) {
          Logger.warn('Failed to decode payments cursor, falling back to offset', { cursor, error: toError(err) });
        }
      }

      usersUnknown = await runFindMany({
        where,
        orderBy: [paymentsOrder, idOrder],
        take: limit,
        include: {
          subscriptions: {
            where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
            include: { plan: true }
          },
          _count: { select: { payments: true } }
        }
      });
    } else {
      // Legacy offset pagination or cursor with non-createdAt sorting: use offset-style queries with orderBy
      usersUnknown = await runFindMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          subscriptions: {
            where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
            orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
            include: { plan: true }
          },
          _count: { select: { payments: true } }
        }
      });
    }

    // Normalize unknown result into an array for downstream processing
    const users = Array.isArray(usersUnknown) ? usersUnknown as unknown[] : [];
    let nextCursor: string | null = null;
    if (users.length === limit) {
      const last = users[users.length - 1];
      const lastRec = asRecord(last) || {};
      const id = typeof lastRec.id === 'string' ? lastRec.id : String(lastRec.id ?? '');
      // If ordering by payments we emit a keyset cursor that encodes the denormalized paymentsCount
      if (sortBy === 'payments') {
        const pc = typeof lastRec.paymentsCount === 'number' ? lastRec.paymentsCount : (lastRec._count && typeof (lastRec._count as Record<string, unknown>).payments === 'number' ? ((lastRec._count as Record<string, unknown>).payments as number) : 0);
        const raw = `${pc}::${id}`;
        nextCursor = Buffer.from(raw).toString('base64');
      } else {
        if (id) nextCursor = id;
      }
    }

    // Enrich users with Clerk data for admin view
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const uRec = asRecord(user) || {};
        const uid = typeof uRec.id === 'string' ? uRec.id : String(uRec.id ?? '');
        try {
          const clerkUser = await authService.getUser(uid);
          return {
            id: uid,
            email: typeof uRec.email === 'string' ? uRec.email : null,
            name: typeof uRec.name === 'string' ? uRec.name : null,
            role: typeof uRec.role === 'string' ? uRec.role : null,
            createdAt: uRec.createdAt instanceof Date ? uRec.createdAt.toISOString() : (typeof uRec.createdAt === 'string' ? new Date(uRec.createdAt).toISOString() : null),
            tokenBalance: typeof uRec.tokenBalance === 'number' ? uRec.tokenBalance : Number(uRec.tokenBalance ?? 0),
            subscriptions: Array.isArray(uRec.subscriptions) ? (uRec.subscriptions as unknown[]).map((s) => {
              const sRec = asRecord(s) || {};
              const planRec = asRecord(sRec.plan) || {};
              return {
                id: typeof sRec.id === 'string' ? sRec.id : String(sRec.id ?? ''),
                status: typeof sRec.status === 'string' ? sRec.status : null,
                // expose a `plan` object with `name` to match server-rendered shape
                plan: typeof planRec.name === 'string' ? {
                  id: typeof planRec.id === 'string' ? planRec.id : String(planRec.id ?? ''),
                  name: planRec.name,
                  durationHours: typeof planRec.durationHours === 'number' ? planRec.durationHours : (planRec.durationHours != null ? Number(planRec.durationHours) : null)
                } : null,
                // keep createdAt as ISO for safe transport
                createdAt: sRec.createdAt instanceof Date ? sRec.createdAt.toISOString() : (typeof sRec.createdAt === 'string' ? new Date(sRec.createdAt).toISOString() : null),
                expiresAt: sRec.expiresAt instanceof Date ? sRec.expiresAt.toISOString() : (typeof sRec.expiresAt === 'string' ? new Date(sRec.expiresAt).toISOString() : null)
              };
            }) : [],
            // Prefer denormalized `paymentsCount` scalar when available, fall back to `_count.payments`.
            paymentsCount: typeof uRec.paymentsCount === 'number' ? uRec.paymentsCount : (typeof (uRec._count && (uRec._count as Record<string, unknown>).payments) === 'number' ? ((uRec._count as Record<string, unknown>).payments as number) : undefined),
            _count: { payments: typeof (uRec._count && (uRec._count as Record<string, unknown>).payments) === 'number' ? ((uRec._count as Record<string, unknown>).payments as number) : 0 },
            clerkData: {
              firstName: clerkUser?.firstName ?? null,
              lastName: clerkUser?.lastName ?? null,
              fullName: clerkUser?.fullName ?? null,
              imageUrl: clerkUser?.imageUrl ?? null,
              emailAddresses: clerkUser?.email ? [{ emailAddress: clerkUser.email }] : [],
              phoneNumbers: [],
              lastSignInAt: null,
              createdAt: null,
              updatedAt: null
            }
          };
        } catch (error: unknown) {
          Logger.warn('Failed to fetch Clerk data for user', { userId: uid, error: toError(error) });
          return {
            id: uid,
            email: typeof uRec.email === 'string' ? uRec.email : null,
            name: typeof uRec.name === 'string' ? uRec.name : null,
            role: typeof uRec.role === 'string' ? uRec.role : null,
            createdAt: uRec.createdAt instanceof Date ? uRec.createdAt.toISOString() : (typeof uRec.createdAt === 'string' ? new Date(uRec.createdAt).toISOString() : null),
            tokenBalance: typeof uRec.tokenBalance === 'number' ? uRec.tokenBalance : Number(uRec.tokenBalance ?? 0),
            subscriptions: [],
            // Preserve legacy paymentsCount and include `_count.payments` for client compatibility
            paymentsCount: typeof (uRec._count && (uRec._count as Record<string, unknown>).payments) === 'number' ? ((uRec._count as Record<string, unknown>).payments as number) : undefined,
            _count: { payments: typeof (uRec._count && (uRec._count as Record<string, unknown>).payments) === 'number' ? ((uRec._count as Record<string, unknown>).payments as number) : 0 },
            clerkData: null
          };
        }
      })
    );

    const totalPages = wantCount && totalCount != null ? Math.ceil(totalCount / limit) : null;
    const hasNextPage = wantCount && totalPages != null ? page < totalPages || !!nextCursor : !!nextCursor;

    return NextResponse.json({
      users: enrichedUsers,
      totalCount,
      currentPage: page,
      totalPages,
      hasNextPage,
      hasPreviousPage: page > 1,
      nextCursor
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Error fetching admin users', { error: err.message, stack: err.stack });

    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { error: 'Failed to fetch users', message: err.message, stack: err.stack },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
