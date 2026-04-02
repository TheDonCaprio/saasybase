export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { Prisma } from '@/lib/prisma-client';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';
import { Logger } from '../../../../lib/logger';
import { paymentService } from '../../../../lib/payment/service';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import { buildDashboardUrl } from '../../../../lib/payment/provider-config';

export async function GET(req: Request) {
  try {
    await requireAdminOrModerator('subscriptions');
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);

  const activeCurrency = await getActiveCurrencyAsync();

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'ALL';
  const sort = url.searchParams.get('sort') || url.searchParams.get('sortBy') || 'createdAt';
  const order = url.searchParams.get('order') || url.searchParams.get('sortOrder') || 'desc';
  const wantCount = url.searchParams.get('count') !== 'false';

  const cursor = url.searchParams.get('cursor');

  // Validate sort parameter
  const validSortFields = ['createdAt', 'expiresAt', 'amount'] as const;
  const validatedSort = validSortFields.includes(sort as typeof validSortFields[number])
    ? sort as typeof validSortFields[number]
    : 'createdAt';
  const validatedOrder = order === 'asc' ? 'asc' : 'desc';

  const skip = (page - 1) * limit;

  const subscriptionInclude = {
    plan: true,
    user: true,
    payments: {
      orderBy: { createdAt: 'desc' },
      take: 1
    }
  } as const;

  // Build where clause (use unknown/Record and narrow at runtime)

  const whereClause: Record<string, unknown> = {
    plan: { autoRenew: true } as Record<string, unknown>
  };

  // Add search filter
  const dbUrl = process.env.DATABASE_URL || '';

  if (search) {
    const filter = buildStringContainsFilter(search, dbUrl);
    whereClause.OR = [
      { id: filter },
      { externalSubscriptionId: filter },
      { userId: filter },
      { user: { email: filter } },
      { user: { name: filter } },
      { user: { externalCustomerId: filter } },
      { plan: { name: filter } },
      { payments: { some: { id: filter } } },
      { payments: { some: { externalPaymentId: filter } } },
      { payments: { some: { externalSessionId: filter } } },
      { payments: { some: { externalRefundId: filter } } },
    ];
  }

  Object.assign(whereClause, sanitizeWhereForInsensitiveSearch(whereClause, dbUrl));

  // Add status filter
  if (status !== 'ALL') {
    const now = new Date();
    // If the requested status is a payment status, filter via payments relation
    const paymentStatuses = ['SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED'];
    if (paymentStatuses.includes(status)) {
      // Find subscriptions that have at least one payment with the requested status
      // Use `some` so subscriptions with a matching latest (or any) payment are returned
      // Match both PENDING and PENDING_SUBSCRIPTION when filtering by PENDING
      if (status === 'PENDING') {
        whereClause.payments = { some: { status: { in: ['PENDING', 'PENDING_SUBSCRIPTION'] } } } as Record<string, unknown>;
      } else {
        whereClause.payments = { some: { status } } as Record<string, unknown>;
      }
    } else if (status === 'SCHEDULED_CANCEL') {
      // Scheduled cancel is represented by a non-null canceledAt while the subscription
      // is still active/valid in the DB. Exclude fully cancelled rows.
      whereClause.canceledAt = { not: null };
      whereClause.status = { not: 'CANCELLED' } as Record<string, unknown>;
    } else if (status === 'ACTIVE') {
      // Access-based ACTIVE: requires time remaining (and not scheduled for cancellation)
      whereClause.status = 'ACTIVE';
      whereClause.expiresAt = { gt: now };
      whereClause.canceledAt = null;
    } else if (status === 'EXPIRED') {
      // Access-based EXPIRED: covers subscriptions whose access is no longer valid by time,
      // even if a background job hasn't normalized the stored status yet.
      // Exclude CANCELLED rows so "Cancelled" stays distinct.
      const expiredCondition = {
        OR: [
          { status: 'EXPIRED' },
          { expiresAt: { lte: now }, status: { not: 'CANCELLED' } }
        ]
      } as Record<string, unknown>;

      const existingOr = (whereClause as Record<string, unknown>).OR as unknown[] | undefined;
      if (existingOr && Array.isArray(existingOr) && existingOr.length > 0) {
        delete (whereClause as Record<string, unknown>).OR;
        const existingAnd = (whereClause as Record<string, unknown>).AND as unknown[] | undefined;
        (whereClause as Record<string, unknown>).AND = [
          ...(Array.isArray(existingAnd) ? existingAnd : []),
          { OR: existingOr },
          expiredCondition
        ];
      } else {
        Object.assign(whereClause, expiredCondition);
      }
    } else {
      whereClause.status = status;
    }
  }

  // Date filtering: accept ISO date strings (or YYYY-MM-DD) from client and apply createdAt range
  const startDateParam = url.searchParams.get('startDate');
  const endDateParam = url.searchParams.get('endDate');
  if (startDateParam || endDateParam) {
    const createdAtFilter: Record<string, unknown> = {};
    if (startDateParam) {
      const sd = new Date(startDateParam);
      if (!isNaN(sd.getTime())) createdAtFilter.gte = sd;
    }
    if (endDateParam) {
      const ed = new Date(endDateParam);
      if (!isNaN(ed.getTime())) createdAtFilter.lt = ed;
    }
    if (Object.keys(createdAtFilter).length > 0) {
      (whereClause as Record<string, unknown>).createdAt = createdAtFilter;
    }
  }

  try {
    // Helper to run findMany with fallback to strip `mode` if needed
    // Accept `unknown` here so callers don't need to adopt Prisma's types.
    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {};
        return await prisma.subscription.findMany({
          ...(safeArgs as Prisma.SubscriptionFindManyArgs),
          include: subscriptionInclude
        });
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          Logger.info('Retrying subscriptions query without mode filter due to provider limitation');
          // Narrow queryArgs safely before reading `.where`
          const origWhere = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>).where : undefined;
          const safeWhere = origWhere ? stripMode(origWhere as Record<string, unknown>) : undefined;
          const safeArgs = { ...(typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {}), where: safeWhere } as Prisma.SubscriptionFindManyArgs;
          return await prisma.subscription.findMany({
            ...safeArgs,
            include: subscriptionInclude
          });
        }
        throw err;
      }
    };

    // If a cursor is provided, prefer keyset pagination for scale
    let subscriptions: Array<unknown> = [];
    if (cursor) {
      try {
        // Cursor encodes the ordering field value and id: base64("<sortValue>::<id>").
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [encodedSortValue, cursorId] = decoded.split('::');

        // Build a keyset condition that compares the same ordering key we use in orderBy
        let keysetWhere: Record<string, unknown> | null = null;
        if (validatedSort === 'amount') {
          // Numeric amount cursor
          const amountValue = Number(encodedSortValue || '0');
          const cursorCondition = {
            OR: [
              { lastPaymentAmountCents: { lt: amountValue } },
              { lastPaymentAmountCents: amountValue, id: { lt: cursorId } }
            ]
          } as Record<string, unknown>;
          keysetWhere = { AND: [whereClause, cursorCondition] };
        } else {
          const cursorDate = encodedSortValue ? new Date(encodedSortValue) : new Date(0);
          const cursorCondition = {
            OR: [
              { [validatedSort]: { lt: cursorDate } },
              { AND: [{ [validatedSort]: cursorDate }, { id: { lt: cursorId } }] }
            ]
          } as Record<string, unknown>;
          keysetWhere = { AND: [whereClause, cursorCondition] };
        }

        subscriptions = await runFindMany({
          where: keysetWhere,
          orderBy: validatedSort === 'amount' ? [{ lastPaymentAmountCents: validatedOrder }, { id: 'desc' }] : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
          take: limit,
          include: subscriptionInclude
        });
      } catch (err: unknown) {
        const e = toError(err);
        Logger.warn('Invalid cursor provided for subscriptions', { message: e.message });
        // fallback to offset pagination
        subscriptions = await runFindMany({
          where: whereClause,
          include: subscriptionInclude,
          orderBy: validatedSort === 'amount' ? [{ lastPaymentAmountCents: validatedOrder }, { id: 'desc' }] : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
          skip,
          take: limit
        });
      }
    } else if (page && page > 1) {
      // legacy offset pagination when explicit page requested
      subscriptions = await runFindMany({
        where: whereClause,
        include: subscriptionInclude,
        orderBy: validatedSort === 'amount' ? [{ lastPaymentAmountCents: validatedOrder }, { id: 'desc' }] : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
        skip,
        take: limit
      });
    } else {
      // first page without cursor
      subscriptions = await runFindMany({
        where: whereClause,
        include: subscriptionInclude,
        orderBy: validatedSort === 'amount' ? [{ lastPaymentAmountCents: validatedOrder }, { id: 'desc' }] : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
        take: limit
      });
    }

    let totalCount: number | null = null;
    if (wantCount) {
      // compute totalCount (only when requested). If Prisma rejects `mode`, retry without it.
      try {
        totalCount = await prisma.subscription.count({ where: whereClause as Prisma.SubscriptionWhereInput });
      } catch (err) {
        if (isPrismaModeError(err)) {
          totalCount = await prisma.subscription.count({ where: stripMode(whereClause) as Prisma.SubscriptionWhereInput });
        } else {
          throw err;
        }
      }
    }

    const subs = (Array.isArray(subscriptions) ? subscriptions : []).map((s: unknown) => {
      const rec = asRecord(s);
      const planRec = asRecord(rec?.plan);
      const userRec = asRecord(rec?.user);
      const paymentsArr = Array.isArray(rec?.payments) ? rec?.payments as unknown[] : [];
      const latestPaymentRec = paymentsArr.length > 0 ? asRecord(paymentsArr[0]) : null;

      const makeDateIso = (v: unknown): string | null => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'string') {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString();
        }
        return null;
      };

      const createdAtIso = makeDateIso(rec?.createdAt);

      const latestPayment = latestPaymentRec ? (() => {
        const amountCents = typeof latestPaymentRec.amountCents === 'number'
          ? latestPaymentRec.amountCents
          : Number(latestPaymentRec.amountCents ?? 0);
        const subtotalCents = typeof latestPaymentRec.subtotalCents === 'number'
          ? latestPaymentRec.subtotalCents
          : latestPaymentRec.subtotalCents != null
            ? Number(latestPaymentRec.subtotalCents)
            : null;
        const explicitDiscountCents = typeof latestPaymentRec.discountCents === 'number'
          ? latestPaymentRec.discountCents
          : latestPaymentRec.discountCents != null
            ? Number(latestPaymentRec.discountCents)
            : null;
        const derivedDiscountCents = explicitDiscountCents != null
          ? explicitDiscountCents
          : subtotalCents != null
            ? Math.max(0, subtotalCents - amountCents)
            : 0;
        const effectiveDiscountCents = derivedDiscountCents > 0 ? derivedDiscountCents : 0;

        const formatCurrency = (cents: number) => formatCurrencyUtil(cents, activeCurrency);

        const amountFormatted = formatCurrency(amountCents);
        const subtotalFormatted = subtotalCents != null ? formatCurrency(subtotalCents) : null;
        const discountFormatted = effectiveDiscountCents > 0 ? formatCurrency(effectiveDiscountCents) : null;

        return {
          id: typeof latestPaymentRec.id === 'string' ? latestPaymentRec.id : String(latestPaymentRec.id ?? ''),
          amountCents,
          subtotalCents,
          discountCents: explicitDiscountCents,
          amountFormatted,
          subtotalFormatted,
          discountFormatted,
          couponCode: typeof latestPaymentRec.couponCode === 'string' ? latestPaymentRec.couponCode : null,
          currency: typeof latestPaymentRec.currency === 'string' ? latestPaymentRec.currency : 'usd',
          createdAt: makeDateIso(latestPaymentRec.createdAt),
          externalPaymentId: typeof latestPaymentRec.externalPaymentId === 'string' ? latestPaymentRec.externalPaymentId : null,
          externalSessionId: typeof latestPaymentRec.externalSessionId === 'string' ? latestPaymentRec.externalSessionId : null,
          externalRefundId: typeof latestPaymentRec.externalRefundId === 'string' ? latestPaymentRec.externalRefundId : null,
          status: typeof latestPaymentRec.status === 'string' ? latestPaymentRec.status : null,
          dashboardUrl: typeof latestPaymentRec.externalPaymentId === 'string'
            ? (buildDashboardUrl(typeof latestPaymentRec.paymentProvider === 'string' ? latestPaymentRec.paymentProvider : null, 'transaction', latestPaymentRec.externalPaymentId) ||
               paymentService.getDashboardUrl('payment', latestPaymentRec.externalPaymentId))
            : null,
          paymentProvider: typeof latestPaymentRec.paymentProvider === 'string' ? latestPaymentRec.paymentProvider : null
        };
      })() : null;

      return {
        id: typeof rec?.id === 'string' ? rec!.id as string : String(rec?.id ?? ''),
        planName: typeof planRec?.name === 'string' ? planRec!.name as string : 'Unknown',
        planAutoRenew: typeof planRec?.autoRenew === 'boolean' ? planRec.autoRenew : null,
        userName: typeof userRec?.name === 'string' ? userRec!.name as string : null,
        userEmail: typeof userRec?.email === 'string' ? userRec!.email as string : null,
        userId: typeof rec?.userId === 'string' ? rec!.userId as string : null,
        status: typeof rec?.status === 'string' ? rec!.status as string : String(rec?.status ?? ''),
        expiresAt: makeDateIso(rec?.expiresAt),
        canceledAt: makeDateIso(rec?.canceledAt),
        createdAt: createdAtIso || new Date().toISOString(),
        externalSubscriptionId: typeof rec?.externalSubscriptionId === 'string' ? rec!.externalSubscriptionId as string : null,
        dashboardUrl: typeof rec?.externalSubscriptionId === 'string'
          ? (buildDashboardUrl(typeof rec?.paymentProvider === 'string' ? rec.paymentProvider : null, 'subscription', rec!.externalSubscriptionId as string) ||
             paymentService.getDashboardUrl('subscription', rec!.externalSubscriptionId as string))
          : null,
        paymentProvider: typeof rec?.paymentProvider === 'string' ? rec.paymentProvider : null,
        latestPayment
      };
    });

    // compute nextCursor when we have a full page
    let nextCursor: string | null = null;
    if (Array.isArray(subscriptions) && subscriptions.length === limit) {
      const last = subscriptions[subscriptions.length - 1];
      const lastRec = asRecord(last) || {};
      const lastId = typeof lastRec?.id === 'string' ? lastRec!.id as string : String(lastRec?.id ?? '');
      if (validatedSort === 'amount') {
        const lastAmount = typeof lastRec?.lastPaymentAmountCents === 'number' ? String(lastRec.lastPaymentAmountCents) : '0';
        nextCursor = Buffer.from(`${lastAmount}::${lastId}`).toString('base64');
      } else {
        const lastSortValue = lastRec?.[validatedSort as string];
        const lastSortIso = lastSortValue instanceof Date
          ? lastSortValue.toISOString()
          : (typeof lastSortValue === 'string' ? new Date(lastSortValue).toISOString() : null);
        if (lastSortIso) {
          const payload = `${lastSortIso}::${lastId}`;
          nextCursor = Buffer.from(payload).toString('base64');
        }
      }
    }

    return NextResponse.json({
      subscriptions: subs,
      totalCount,
      currentPage: page,
      totalPages: totalCount != null ? Math.ceil(totalCount / limit) : null,
      hasNextPage: totalCount != null ? page < Math.ceil(totalCount / limit) : subscriptions.length === limit,
      nextCursor
    });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error fetching subscriptions', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
