export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';
import { Logger } from '../../../../lib/logger';
import type { Prisma } from '@prisma/client';
import { adminRateLimit } from '../../../../lib/rateLimit';
import { paymentService } from '../../../../lib/payment/service';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';

export async function GET(req: NextRequest) {
  const { userId: actorId } = await requireAdminOrModerator('purchases');

  const rateLimitResult = await adminRateLimit(actorId, req, 'admin-purchases:list', {
    limit: 120,
    windowMs: 60_000
  });

  if (!rateLimitResult.success && !rateLimitResult.allowed) {
    Logger.error('Admin purchases GET rate limiter unavailable', {
      actorId,
      error: rateLimitResult.error
    });
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please retry shortly.' },
      { status: 503 }
    );
  }

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(0, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    Logger.warn('Admin purchases GET rate limit exceeded', {
      actorId,
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

  const activeCurrency = await getActiveCurrencyAsync();

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'ALL';
  const access = url.searchParams.get('access') || undefined;
  const sort = url.searchParams.get('sort') || url.searchParams.get('sortBy') || 'createdAt';
  const order = url.searchParams.get('order') || url.searchParams.get('sortOrder') || 'desc';
  const wantCount = url.searchParams.get('count') !== 'false';

  const cursor = url.searchParams.get('cursor');

  // Validate sort parameter - allow server-side sortable fields
  const validSortFields = ['createdAt', 'expiresAt', 'amount'] as const;
  const validatedSort = validSortFields.includes(sort as typeof validSortFields[number])
    ? sort as typeof validSortFields[number]
    : 'createdAt';
  const validatedOrder = order === 'asc' ? 'asc' : 'desc';

  const skip = (page - 1) * limit;

  // Build where clause for one-time purchases (non-recurring subscriptions)
  const baseConditions: Record<string, unknown>[] = [
    {
      OR: [
        { subscription: { plan: { autoRenew: false } } },
        { AND: [{ subscriptionId: null }, { plan: { autoRenew: false } }] }
      ]
    }
  ];

  if (status !== 'ALL') {
    // Match both PENDING and PENDING_SUBSCRIPTION when filtering by PENDING
    if (status === 'PENDING') {
      baseConditions.push({ status: { in: ['PENDING', 'PENDING_SUBSCRIPTION'] } });
    } else {
      baseConditions.push({ status });
    }
  }

  if (access) {
    if (access === 'ACTIVE') {
      baseConditions.push({
        subscription: {
          status: 'ACTIVE',
          expiresAt: { gt: new Date() }
        }
      });
    } else if (access === 'EXPIRED') {
      baseConditions.push({
        OR: [
          { subscription: null },
          { subscription: { status: { not: 'ACTIVE' } } },
          { subscription: { status: 'ACTIVE', expiresAt: { lte: new Date() } } }
        ]
      });
    }
  }

  const dbUrl = process.env.DATABASE_URL || '';

  if (search) {
    baseConditions.push({
      OR: [
        { user: { email: buildStringContainsFilter(search, dbUrl) } },
        { user: { name: buildStringContainsFilter(search, dbUrl) } },
        { userId: buildStringContainsFilter(search, dbUrl) },
        { user: { externalCustomerId: buildStringContainsFilter(search, dbUrl) } },
        { stripePaymentIntentId: buildStringContainsFilter(search, dbUrl) },
        { stripeCheckoutSessionId: buildStringContainsFilter(search, dbUrl) },
        { externalPaymentId: buildStringContainsFilter(search, dbUrl) },
        { externalSessionId: buildStringContainsFilter(search, dbUrl) },
        { externalRefundId: buildStringContainsFilter(search, dbUrl) },
        { subscription: { plan: { name: buildStringContainsFilter(search, dbUrl) } } },
        { subscription: { externalSubscriptionId: buildStringContainsFilter(search, dbUrl) } },
        { subscription: { id: buildStringContainsFilter(search, dbUrl) } },
        { plan: { name: buildStringContainsFilter(search, dbUrl) } }
      ]
    });
  }

  let whereClauseRecord: Record<string, unknown>;
  if (baseConditions.length === 1) {
    whereClauseRecord = baseConditions[0];
  } else {
    whereClauseRecord = { AND: baseConditions };
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
      (whereClauseRecord as Record<string, unknown>).createdAt = createdAtFilter;
    }
  }

  whereClauseRecord = sanitizeWhereForInsensitiveSearch(whereClauseRecord, dbUrl);

  const whereClause = whereClauseRecord as Prisma.PaymentWhereInput;

  try {
    // Helper to run findMany with fallback to strip `mode` if needed
    // Accept `unknown` so calling code can remain plain objects and we only
    // narrow/cast at the Prisma callsite.
    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        // Build a runtime-safe args object and cast once at the Prisma callsite.
        const safeArgs = (queryArgs as Record<string, unknown> | undefined) ?? {};
        return await prisma.payment.findMany(safeArgs as Prisma.PaymentFindManyArgs);
      } catch (error: unknown) {
        if (isPrismaModeError(error)) {
          Logger.info('Retrying purchases query without mode filter due to provider limitation');
          const maybeWhere = (queryArgs as Record<string, unknown> | undefined)?.where as unknown;
          const strippedWhere = maybeWhere ? stripMode(maybeWhere as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(queryArgs as Record<string, unknown> || {}), where: strippedWhere } as Prisma.PaymentFindManyArgs;
          return await prisma.payment.findMany(strippedArgs);
        }
        throw error;
      }
    };

    // Helper to run count with fallback to strip `mode` if needed  
    const runCount = async (queryArgs: unknown): Promise<number> => {
      try {
        const safeArgs = (queryArgs as Record<string, unknown> | undefined) ?? {};
        return await prisma.payment.count(safeArgs as Prisma.PaymentCountArgs);
      } catch (error: unknown) {
        if (isPrismaModeError(error)) {
          Logger.info('Retrying purchases count without mode filter due to provider limitation');
          const maybeWhere = (queryArgs as Record<string, unknown> | undefined)?.where as unknown;
          const strippedWhere = maybeWhere ? stripMode(maybeWhere as Record<string, unknown>) : undefined;
          const strippedArgs = { ...(queryArgs as Record<string, unknown> || {}), where: strippedWhere } as Prisma.PaymentCountArgs;
          return await prisma.payment.count(strippedArgs);
        }
        throw error;
      }
    };

    // Debug: log the resolved where clause sent to Prisma
    try {
      const whereStr = JSON.stringify(whereClauseRecord, (_k, v) => (v instanceof Date ? v.toISOString() : v));
      Logger.info('admin/purchases whereClause', { where: whereStr });
    } catch {
      // non-fatal
    }

    let purchases: Array<unknown> = [];
    let totalCount: number | null = null;

    if (cursor) {
      // Cursor-based pagination (keyset). Combine original filters with a
      // cursor constraint so user's search isn't dropped. The cursor encodes
      // the ordering key (createdAt, expiresAt, or amount) and the id so we can
      // perform a stable keyset comparison that matches the `orderBy` field.
      const decoded = Buffer.from(cursor, 'base64').toString('ascii');
      const [encodedSortValue, id] = decoded.split('::');

      // For date fields parse as Date; for amount parse as Number.
      let cursorCondition: Record<string, unknown>;
      if (validatedSort === 'amount') {
        const amountValue = Number(encodedSortValue || '0');
        const comparator = validatedOrder === 'asc' ? 'gt' : 'lt';
        cursorCondition = {
          OR: [
            { amountCents: { [comparator]: amountValue } },
            { amountCents: amountValue, id: { lt: id } }
          ]
        } as Record<string, unknown>;
      } else if (validatedSort === 'expiresAt') {
        const sortDate = encodedSortValue ? new Date(encodedSortValue) : new Date(0);
        const comparator = validatedOrder === 'asc' ? 'gt' : 'lt';
        cursorCondition = {
          OR: [
            { subscription: { expiresAt: { [comparator]: sortDate } } },
            { subscription: { expiresAt: sortDate }, id: { lt: id } }
          ]
        } as Record<string, unknown>;
      } else {
        const sortDate = encodedSortValue ? new Date(encodedSortValue) : new Date(0);
        const comparator = validatedOrder === 'asc' ? 'gt' : 'lt';
        cursorCondition = {
          OR: [
            { [validatedSort]: { [comparator]: sortDate } },
            { [validatedSort]: sortDate, id: { lt: id } }
          ]
        } as Record<string, unknown>;
      }

      // Preserve original OR if present
      const originalOr = (whereClauseRecord as Record<string, unknown>).OR as unknown[] | undefined;
      // Build a combined where that keeps other top-level keys and applies
      // both the original OR (if any) and the cursor condition inside an AND.
      const combinedWhere: Record<string, unknown> = { ...whereClauseRecord };
      if (originalOr) {
        // Remove the original OR from root to avoid duplication
        delete (combinedWhere as Record<string, unknown>).OR;
        (combinedWhere as Record<string, unknown>).AND = [{ OR: originalOr }, cursorCondition];
      } else {
        // No original OR: simply add the cursor condition as an AND element
        (combinedWhere as Record<string, unknown>).AND = [cursorCondition];
      }

      purchases = await runFindMany({
        where: combinedWhere,
        include: {
          subscription: {
            include: { plan: true }
          },
          plan: true,
          user: true
        },
        orderBy: validatedSort === 'amount'
          ? [{ amountCents: validatedOrder }, { id: 'desc' }]
          : validatedSort === 'expiresAt'
            ? [{ subscription: { expiresAt: validatedOrder } }, { id: 'desc' }]
            : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
        take: limit
      });
    } else {
      // Regular pagination
      purchases = await runFindMany({
        where: whereClause,
        include: {
          subscription: {
            include: { plan: true }
          },
          plan: true,
          user: true
        },
        orderBy: validatedSort === 'amount'
          ? [{ amountCents: validatedOrder }, { id: 'desc' }]
          : validatedSort === 'expiresAt'
            ? [{ subscription: { expiresAt: validatedOrder } }, { id: 'desc' }]
            : [{ [validatedSort]: validatedOrder }, { id: 'desc' }],
        skip,
        take: limit
      });
    }

    // Get total count if requested and not using cursor
    if (wantCount && !cursor) {
      totalCount = await runCount({ where: whereClause });
    }

    // Transform data (narrow unknowns at runtime)
    const purchasesData = (Array.isArray(purchases) ? purchases : []).map((p: unknown) => {
      const rec = asRecord(p);
      const subRec = asRecord(rec?.subscription);
      const userRec = asRecord(rec?.user);
      const planRec = asRecord(subRec?.plan);
      const directPlanRec = asRecord(rec?.plan);

      const makeDateIso = (v: unknown): string | null => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString();
        if (typeof v === 'string') {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString();
        }
        return null;
      };

      const amountCents = typeof rec?.amountCents === 'number' ? rec.amountCents : Number(rec?.amountCents ?? 0);
      const subtotalCents = typeof rec?.subtotalCents === 'number'
        ? rec.subtotalCents
        : (rec?.subtotalCents != null ? Number(rec?.subtotalCents) : null);
      const explicitDiscountCents = typeof rec?.discountCents === 'number'
        ? rec.discountCents
        : (rec?.discountCents != null ? Number(rec?.discountCents) : null);
      const derivedDiscountCents = explicitDiscountCents != null
        ? explicitDiscountCents
        : subtotalCents != null
          ? Math.max(0, subtotalCents - amountCents)
          : null;
      const effectiveDiscountCents = derivedDiscountCents != null && derivedDiscountCents > 0 ? derivedDiscountCents : null;

      const rawCurrency = typeof rec?.currency === 'string' ? rec.currency : 'usd';
      const formatCurrencyString = (cents: number) => formatCurrencyUtil(cents, activeCurrency);

      return {
        id: typeof rec?.id === 'string' ? rec!.id as string : String(rec?.id ?? ''),
        planName: typeof planRec?.name === 'string'
          ? planRec.name as string
          : (typeof directPlanRec?.name === 'string' ? directPlanRec.name as string : 'Unknown'),
        userName: typeof userRec?.name === 'string' ? userRec!.name as string : null,
        userEmail: typeof userRec?.email === 'string' ? userRec!.email as string : null,
        userId: typeof rec?.userId === 'string' ? rec!.userId as string : null,
        amountCents,
        amountFormatted: formatCurrencyString(amountCents),
        subtotalCents,
        subtotalFormatted: subtotalCents != null ? formatCurrencyString(subtotalCents) : null,
        discountCents: explicitDiscountCents ?? effectiveDiscountCents,
        discountFormatted: effectiveDiscountCents != null ? formatCurrencyString(effectiveDiscountCents) : null,
        couponCode: typeof rec?.couponCode === 'string' ? rec!.couponCode as string : null,
        currency: rawCurrency,
        status: typeof rec?.status === 'string' ? rec!.status as string : String(rec?.status ?? ''),
        createdAt: makeDateIso(rec?.createdAt) || new Date().toISOString(),
        stripePaymentIntentId: typeof rec?.stripePaymentIntentId === 'string' ? rec!.stripePaymentIntentId as string : null,
        stripeCheckoutSessionId: typeof rec?.stripeCheckoutSessionId === 'string' ? rec!.stripeCheckoutSessionId as string : null,
        externalPaymentId: typeof rec?.externalPaymentId === 'string' ? rec!.externalPaymentId as string : null,
        externalSessionId: typeof rec?.externalSessionId === 'string' ? rec!.externalSessionId as string : null,
        dashboardUrl: typeof rec?.externalPaymentId === 'string'
          ? paymentService.getDashboardUrl('payment', rec!.externalPaymentId as string)
          : (typeof rec?.stripePaymentIntentId === 'string' ? paymentService.getDashboardUrl('payment', rec!.stripePaymentIntentId as string) : null),
        paymentProvider: typeof rec?.paymentProvider === 'string' ? rec.paymentProvider : null,
        subscription: subRec ? {
          id: typeof subRec?.id === 'string' ? subRec!.id as string : String(subRec?.id ?? ''),
          status: typeof subRec?.status === 'string' ? subRec!.status as string : String(subRec?.status ?? ''),
          expiresAt: makeDateIso(subRec?.expiresAt)
        } : null
      };
    });

    // Calculate pagination info
    const totalPages = totalCount ? Math.ceil(totalCount / limit) : undefined;
    const hasNextPage = Array.isArray(purchases) && purchases.length === limit;
    let nextCursor = null;
    if (hasNextPage && Array.isArray(purchases) && purchases.length > 0) {
      const last = purchases[purchases.length - 1];
      const lastRec = asRecord(last) || {};
      const lastId = typeof lastRec.id === 'string' ? lastRec.id : String(lastRec.id ?? '');
      if (validatedSort === 'amount') {
        const lastAmount = typeof lastRec.amountCents === 'number' ? String(lastRec.amountCents) : '0';
        nextCursor = Buffer.from(`${lastAmount}::${lastId}`).toString('base64');
      } else {
        const lastSortValue = validatedSort === 'expiresAt'
          ? (asRecord(lastRec.subscription)?.expiresAt ?? null)
          : lastRec?.[validatedSort as string];
        const lastSortIso = lastSortValue instanceof Date
          ? lastSortValue.toISOString()
          : (typeof lastSortValue === 'string' ? new Date(lastSortValue).toISOString() : null);
        if (lastSortIso) nextCursor = Buffer.from(`${lastSortIso}::${lastId}`).toString('base64');
      }
    }

    return NextResponse.json({
      purchases: purchasesData,
      totalCount,
      currentPage: page,
      totalPages,
      hasNextPage,
      nextCursor
    });

  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Error fetching purchases', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to fetch purchases' },
      { status: 500 }
    );
  }
}
