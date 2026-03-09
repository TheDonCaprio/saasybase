import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import type { Prisma } from '@prisma/client';
import { paymentService } from '../../../../lib/payment/service';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import { formatCurrency as formatCurrencyUtil } from '../../../../lib/utils/currency';

export async function GET(request: NextRequest) {
  // use shared runtime guards

  try {
    await requireAdminOrModerator('transactions');

    const activeCurrency = await getActiveCurrencyAsync();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const sort = searchParams.get('sortBy') || searchParams.get('sort') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || searchParams.get('order') || 'desc';

    // Validate sort parameter - allow server-side sortable fields
    const validSortFields = ['createdAt', 'amount', 'expiresAt'] as const;
    const sortBy = validSortFields.includes(sort as typeof validSortFields[number])
      ? sort as typeof validSortFields[number]
      : 'createdAt';

    const skip = (page - 1) * limit;

    // Build where clause (use unknown/Record and narrow at runtime)
    let where: Record<string, unknown> = {};
    const dbUrl = process.env.DATABASE_URL || '';

    if (search) {
      where.OR = [
        { id: buildStringContainsFilter(search, dbUrl) },
        { externalPaymentId: buildStringContainsFilter(search, dbUrl) },
        { externalSessionId: buildStringContainsFilter(search, dbUrl) },
        { externalRefundId: buildStringContainsFilter(search, dbUrl) },
        { userId: buildStringContainsFilter(search, dbUrl) },
        { user: { email: buildStringContainsFilter(search, dbUrl) } },
        { user: { name: buildStringContainsFilter(search, dbUrl) } },
        { user: { externalCustomerId: buildStringContainsFilter(search, dbUrl) } },
        { subscription: { plan: { name: buildStringContainsFilter(search, dbUrl) } } },
        { subscription: { externalSubscriptionId: buildStringContainsFilter(search, dbUrl) } },
        { subscription: { id: buildStringContainsFilter(search, dbUrl) } },
        { plan: { name: buildStringContainsFilter(search, dbUrl) } }
      ];
    }

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') {
        // Payments with active access (active subscription not expired)
        where.subscription = {
          status: 'ACTIVE',
          expiresAt: { gt: new Date() }
        };
      } else if (status === 'EXPIRED') {
        // Payments with expired access (no subscription or expired/inactive)
        where.OR = [
          { subscription: null },
          { subscription: { status: { not: 'ACTIVE' } } },
          { subscription: { status: 'ACTIVE', expiresAt: { lte: new Date() } } }
        ];
      } else if (status === 'PENDING') {
        // Match both PENDING and PENDING_SUBSCRIPTION statuses
        where.status = { in: ['PENDING', 'PENDING_SUBSCRIPTION'] };
      } else {
        // Regular payment status filters
        where.status = status;
      }
    }

    // Date filtering: expect ISO date strings (or YYYY-MM-DD) from client.
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
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
        (where as Record<string, unknown>).createdAt = createdAtFilter;
      }
    }

    where = sanitizeWhereForInsensitiveSearch(where, dbUrl);

    // Use array of orderBy for stable ordering with secondary sort by id.
    // - amount: sort by amountCents
    // - expiresAt: sort by related subscription.expiresAt (payments without subscription will naturally sort as null)
    // - createdAt: sort by createdAt
    const orderBy = sortBy === 'amount'
      ? [{ amountCents: sortOrder }, { id: 'desc' as const }]
      : sortBy === 'expiresAt'
        ? [{ subscription: { expiresAt: sortOrder } }, { id: 'desc' as const }]
        : [{ [sortBy]: sortOrder }, { id: 'desc' as const }];

    // Get total count for pagination (keep for legacy paged UI) unless caller opts out
    const countParam = searchParams.get('count');
    const wantCount = countParam !== 'false';
    let totalCount: number | null = null;
    if (wantCount) {
      try {
        totalCount = await prisma.payment.count({ where: where as Prisma.PaymentWhereInput });
      } catch (err) {
        if (isPrismaModeError(err)) {
          totalCount = await prisma.payment.count({ where: stripMode(where) as Prisma.PaymentWhereInput });
        } else {
          throw err;
        }
      }
    }

    // Helper to run a findMany that retries without `mode` if necessary
    // Accept `unknown` here so callers don't have to adopt Prisma types.
    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        // Build a runtime-safe args object then cast once at the Prisma boundary.
        const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>) : {};
        return await prisma.payment.findMany(safeArgs as Prisma.PaymentFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.payment.findMany failed', { error: toError(err) });
        if (isPrismaModeError(err)) {
          Logger.info('Retrying admin payments query without mode filter due to provider limitation');
          const maybeWhere = typeof queryArgs === 'object' && queryArgs !== null ? (queryArgs as Record<string, unknown>).where : undefined;
          const strippedWhere = maybeWhere ? stripMode(maybeWhere as Record<string, unknown>) : undefined;
          const safeArgs = typeof queryArgs === 'object' && queryArgs !== null ? { ...(queryArgs as Record<string, unknown>), where: strippedWhere } : { where: strippedWhere };
          return await prisma.payment.findMany(safeArgs as Prisma.PaymentFindManyArgs);
        }
        throw err;
      }
    };

    // runCount is not currently used by callers in this route; keep logic available later if needed.

    // Debug: log incoming search params for troubleshooting
    try {
      const { searchParams } = new URL(request.url);
      Logger.info('admin/payments GET', { searchParams: searchParams.toString() });
    } catch {
      // non-fatal
    }

    // If a cursor is provided, use keyset pagination
    let payments: unknown[] = [];
    if (cursor) {
      // When sorting by createdAt we can derive the cursor row; when sorting
      // by amount we expect the cursor to already encode the amount value.
      // When sorting by expiresAt we derive the cursor row's subscription.expiresAt.
      const originalOr = (where as Record<string, unknown>).OR as unknown[] | undefined;
      const combinedWhere: Record<string, unknown> = { ...where };

      if (sortBy === 'createdAt') {
        // Find the cursor record to get its createdAt for stable ordering
        const cursorRow = await prisma.payment.findUnique({ where: { id: cursor }, select: { createdAt: true, id: true } });
        const cursorCondition = { OR: [{ createdAt: { lt: cursorRow?.createdAt ?? new Date(0) } }, { createdAt: cursorRow?.createdAt ?? new Date(0), id: { lt: cursor } }] } as Record<string, unknown>;
        if (originalOr) {
          delete (combinedWhere as Record<string, unknown>).OR;
          (combinedWhere as Record<string, unknown>).AND = [{ OR: originalOr }, cursorCondition];
        } else {
          (combinedWhere as Record<string, unknown>).AND = [cursorCondition];
        }

        if (cursorRow) {
          payments = await runFindMany({
            where: combinedWhere,
            orderBy: [orderBy, { id: 'desc' }],
            cursor: { id: cursor },
            skip: 1,
            take: limit,
            include: { subscription: { include: { plan: true } }, plan: true, user: true }
          });
        } else {
          payments = await runFindMany({
            where: combinedWhere,
            orderBy,
            skip,
            take: limit,
            include: { subscription: { include: { plan: true } }, plan: true, user: true }
          });
        }
      } else if (sortBy === 'amount') {
        // Cursor expected to be base64("<amountCents>::<id>")
        try {
          const decoded = Buffer.from(cursor, 'base64').toString('ascii');
          const [amountStr, cursorId] = decoded.split('::');
          const amountValue = Number(amountStr || '0');
          const cursorCondition = { OR: [{ amountCents: { lt: amountValue } }, { amountCents: amountValue, id: { lt: cursorId } }] } as Record<string, unknown>;
          if (originalOr) {
            delete (combinedWhere as Record<string, unknown>).OR;
            (combinedWhere as Record<string, unknown>).AND = [{ OR: originalOr }, cursorCondition];
          } else {
            (combinedWhere as Record<string, unknown>).AND = [cursorCondition];
          }

          payments = await runFindMany({
            where: combinedWhere,
            orderBy: [{ amountCents: sortOrder }, { id: 'desc' }],
            take: limit,
            include: { subscription: { include: { plan: true } }, plan: true, user: true }
          });
        } catch (err: unknown) {
          // fallback to offset style if decoding fails; log the decode error for diagnostics
          Logger.warn('Failed to decode payments cursor', { cursor, error: toError(err) });
          payments = await runFindMany({
            where: combinedWhere,
            orderBy: [{ amountCents: sortOrder }, { id: 'desc' }],
            skip,
            take: limit,
            include: { subscription: { include: { plan: true } }, plan: true, user: true }
          });
        }
      } else if (sortBy === 'expiresAt') {
        // Find cursor record to get its subscription.expiresAt for stable ordering.
        // Note: payments can have null subscription; those are treated as expired/unknown.
        const cursorRow = await prisma.payment.findUnique({
          where: { id: cursor },
          select: { id: true, subscription: { select: { expiresAt: true } } }
        });

        const cursorExpiresAt = cursorRow?.subscription?.expiresAt ?? new Date(0);

        // For DESC sort: fetch rows with (expiresAt < cursorExpiresAt) OR (expiresAt == cursorExpiresAt AND id < cursor)
        // For ASC sort: fetch rows with (expiresAt > cursorExpiresAt) OR (expiresAt == cursorExpiresAt AND id < cursor)
        const comparator = sortOrder === 'asc' ? 'gt' : 'lt';
        const cursorCondition = {
          OR: [
            { subscription: { expiresAt: { [comparator]: cursorExpiresAt } } },
            { subscription: { expiresAt: cursorExpiresAt }, id: { lt: cursor } }
          ]
        } as Record<string, unknown>;

        if (originalOr) {
          delete (combinedWhere as Record<string, unknown>).OR;
          (combinedWhere as Record<string, unknown>).AND = [{ OR: originalOr }, cursorCondition];
        } else {
          (combinedWhere as Record<string, unknown>).AND = [cursorCondition];
        }

        payments = await runFindMany({
          where: combinedWhere,
          orderBy,
          take: limit,
          include: { subscription: { include: { plan: true } }, plan: true, user: true }
        });
      }
    } else {
      // Legacy offset pagination
      payments = await runFindMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { subscription: { include: { plan: true } }, plan: true, user: true }
      });
    }

    // Map payments to a safe serializable shape to avoid leaking runtime `any`s
    const mappedPayments = payments.map((p) => {
      const rec = asRecord(p) || {};
      const userRec = asRecord(rec.user) || {};
      const subRec = asRecord(rec.subscription) || {};
      const planRec = asRecord(subRec.plan) || {};
      const directPlanRec = asRecord(rec.plan) || {}; // Direct plan relation

      // Prefer plan from subscription if available, fallback to direct plan relation
      const effectivePlanRec = planRec && typeof planRec.id === 'string' ? planRec : directPlanRec;

      const amountCents = typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0);
      const subtotalCents = typeof rec.subtotalCents === 'number'
        ? rec.subtotalCents
        : (rec.subtotalCents != null ? Number(rec.subtotalCents) : null);
      const explicitDiscountCents = typeof rec.discountCents === 'number'
        ? rec.discountCents
        : (rec.discountCents != null ? Number(rec.discountCents) : null);

      const derivedDiscountCents = explicitDiscountCents != null
        ? explicitDiscountCents
        : subtotalCents != null
          ? Math.max(0, subtotalCents - amountCents)
          : 0;
      const effectiveDiscountCents = derivedDiscountCents > 0 ? derivedDiscountCents : 0;

      const amountFormatted = formatCurrencyUtil(amountCents, activeCurrency);
      const subtotalFormatted = subtotalCents != null ? formatCurrencyUtil(subtotalCents, activeCurrency) : null;
      const discountFormatted = effectiveDiscountCents > 0 ? formatCurrencyUtil(effectiveDiscountCents, activeCurrency) : null;

      return {
        id: typeof rec.id === 'string' ? rec.id : String(rec.id ?? ''),
        amountCents,
        amountFormatted,
        subtotalCents,
        subtotalFormatted,
        discountCents: explicitDiscountCents ?? (effectiveDiscountCents > 0 ? effectiveDiscountCents : null),
        discountFormatted,
        couponCode: typeof rec.couponCode === 'string' ? rec.couponCode : null,
        currency: typeof rec.currency === 'string' ? rec.currency : 'usd',
        status: typeof rec.status === 'string' ? rec.status : String(rec.status ?? ''),
        createdAt: rec.createdAt instanceof Date ? rec.createdAt.toISOString() : (typeof rec.createdAt === 'string' ? new Date(rec.createdAt).toISOString() : null),
        externalPaymentId: typeof rec.externalPaymentId === 'string' ? rec.externalPaymentId : null,
        externalSessionId: typeof rec.externalSessionId === 'string' ? rec.externalSessionId : null,
        externalRefundId: typeof rec.externalRefundId === 'string' ? rec.externalRefundId : null,
        paymentProvider: typeof rec.paymentProvider === 'string' ? rec.paymentProvider : null,
        dashboardUrl: typeof rec.externalPaymentId === 'string'
          ? paymentService.getDashboardUrl('payment', rec.externalPaymentId)
          : null,
        // Provide nested objects that client components expect
        user: {
          id: typeof userRec.id === 'string' ? userRec.id : (typeof rec.userId === 'string' ? rec.userId : null),
          externalCustomerId: typeof userRec.externalCustomerId === 'string' ? userRec.externalCustomerId : null,
          email: typeof userRec.email === 'string' ? userRec.email : null,
          name: typeof userRec.name === 'string' ? userRec.name : null,
          imageUrl: typeof userRec.imageUrl === 'string' ? userRec.imageUrl : null,
          role: typeof userRec.role === 'string' ? userRec.role : 'USER',
          createdAt: userRec.createdAt instanceof Date ? userRec.createdAt.toISOString() : (typeof userRec.createdAt === 'string' ? new Date(userRec.createdAt).toISOString() : null),
          updatedAt: userRec.updatedAt instanceof Date ? userRec.updatedAt.toISOString() : (typeof userRec.updatedAt === 'string' ? new Date(userRec.updatedAt).toISOString() : null),
        },
        subscription: subRec ? {
          id: typeof subRec.id === 'string' ? subRec.id : null,
          externalSubscriptionId: typeof subRec.externalSubscriptionId === 'string' ? subRec.externalSubscriptionId : null,
          paymentProvider: typeof subRec.paymentProvider === 'string' ? subRec.paymentProvider : null,
          status: typeof subRec.status === 'string' ? subRec.status : String(subRec.status ?? ''),
          startedAt: subRec.startedAt instanceof Date ? subRec.startedAt.toISOString() : (typeof subRec.startedAt === 'string' ? new Date(subRec.startedAt).toISOString() : null),
          expiresAt: subRec.expiresAt instanceof Date ? subRec.expiresAt.toISOString() : (typeof subRec.expiresAt === 'string' ? new Date(subRec.expiresAt).toISOString() : null),
          plan: planRec ? {
            id: typeof planRec.id === 'string' ? planRec.id : null,
            name: typeof planRec.name === 'string' ? planRec.name : null,
            description: typeof planRec.description === 'string' ? planRec.description : null,
            externalPriceId: typeof planRec.externalPriceId === 'string' ? planRec.externalPriceId : null,
            active: typeof planRec.active === 'boolean' ? planRec.active : Boolean(planRec.active),
            durationHours: typeof planRec.durationHours === 'number' ? planRec.durationHours : Number(planRec.durationHours ?? 0),
            priceCents: typeof planRec.priceCents === 'number' ? planRec.priceCents : Number(planRec.priceCents ?? 0),
            sortOrder: typeof planRec.sortOrder === 'number' ? planRec.sortOrder : Number(planRec.sortOrder ?? 0),
            createdAt: planRec.createdAt instanceof Date ? planRec.createdAt.toISOString() : (typeof planRec.createdAt === 'string' ? new Date(planRec.createdAt).toISOString() : null),
            updatedAt: planRec.updatedAt instanceof Date ? planRec.updatedAt.toISOString() : (typeof planRec.updatedAt === 'string' ? new Date(planRec.updatedAt).toISOString() : null),
          } : null
        } : null,
        // Include plan info directly for token top-ups (no subscription)
        plan: effectivePlanRec && typeof effectivePlanRec.id === 'string' ? {
          id: effectivePlanRec.id,
          name: typeof effectivePlanRec.name === 'string' ? effectivePlanRec.name : null,
          description: typeof effectivePlanRec.description === 'string' ? effectivePlanRec.description : null,
        } : null,
      };
    });

    let nextCursor: string | null = null;
    if (mappedPayments.length === limit) {
      const last = mappedPayments[mappedPayments.length - 1];
      // Encode cursor based on the ordering field
      if (sortBy === 'createdAt') {
        const lastCreated = last.createdAt;
        if (lastCreated) nextCursor = Buffer.from(`${lastCreated}::${last.id}`).toString('base64');
      } else if (sortBy === 'amount') {
        const lastAmount = typeof last.amountCents === 'number' ? String(last.amountCents) : '0';
        nextCursor = Buffer.from(`${lastAmount}::${last.id}`).toString('base64');
      } else {
        nextCursor = last.id || null;
      }
    }

    const totalPages = wantCount && totalCount != null ? Math.ceil(totalCount / limit) : null;
    const hasNextPage = wantCount && totalPages != null ? page < totalPages || !!nextCursor : !!nextCursor;

    return NextResponse.json({
      payments: mappedPayments,
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
    Logger.error('Error fetching admin payments', { error: err.message, stack: err.stack });
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { error: 'Failed to fetch payments', message: err.message, stack: err.stack },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
