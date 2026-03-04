import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
export const dynamic = 'force-dynamic';
import { prisma } from '../../../../lib/prisma';
import { stripMode, isPrismaModeError, buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from '../../../../lib/queryUtils';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import { formatCurrency } from '../../../../lib/utils/currency';
import { getActiveCurrencyAsync } from '../../../../lib/payment/registry';
import { Logger } from '../../../../lib/logger';
import type { Prisma } from '@prisma/client';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const activeCurrency = await getActiveCurrencyAsync();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const cursorParam = searchParams.get('cursor');
    const wantCount = searchParams.get('count') !== 'false';

    // Build base where clause as an untyped record (narrow later)
    let whereBase: Record<string, unknown> = { userId };
    if (status && status !== 'ALL') {
      // Match both PENDING and PENDING_SUBSCRIPTION when filtering by PENDING
      if (status === 'PENDING') {
        whereBase.status = { in: ['PENDING', 'PENDING_SUBSCRIPTION'] };
      } else {
        whereBase.status = status;
      }
    }

    const dbUrl = process.env.DATABASE_URL || '';

    if (search) {
      // allow search by payment id or plan name
      whereBase.OR = [
        { id: buildStringContainsFilter(search, dbUrl) },
        { subscription: { plan: { name: buildStringContainsFilter(search, dbUrl) } } }
      ];
    }

    whereBase = sanitizeWhereForInsensitiveSearch(whereBase, dbUrl) as Record<string, unknown>;

  let payments: unknown[] = [];
  let _nextCursor: string | null = null;

    const safeStringify = (v: unknown) => {
      try { return JSON.stringify(v); } catch (e) { return String(e); }
    };

    const runFindMany = async (queryArgs: unknown): Promise<unknown[]> => {
      try {
        const safeArgs = asRecord(queryArgs) ?? {};
        return await prisma.payment.findMany(safeArgs as Prisma.PaymentFindManyArgs);
      } catch (err: unknown) {
        Logger.warn('prisma.payment.findMany failed', { queryArgs: safeStringify(queryArgs), error: toError(err) });
        if (isPrismaModeError(err)) {
          Logger.info('Retrying prisma.payment.findMany without `mode`');
          const maybeWhere = (asRecord(queryArgs) ?? {}).where;
          const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
          const safeArgs: Record<string, unknown> = { ...(asRecord(queryArgs) || {}), where: strippedWhere };
          Logger.info('Retrying prisma.payment.findMany without `mode`', { safeArgs: safeStringify(safeArgs) });
          return await prisma.payment.findMany(safeArgs as Prisma.PaymentFindManyArgs);
        }
        throw err;
      }
    };

    const runCount = async (queryArgs: unknown): Promise<number> => {
        try {
          const safeArgs = asRecord(queryArgs) ?? {};
          return await prisma.payment.count(safeArgs as Prisma.PaymentCountArgs);
        } catch (err: unknown) {
          if (isPrismaModeError(err)) {
            Logger.info('Retrying prisma.payment.count without `mode`');
            const maybeWhere = (asRecord(queryArgs) ?? {}).where;
            const strippedWhere = maybeWhere ? stripMode(asRecord(maybeWhere) as Record<string, unknown>) : undefined;
            const strippedArgs = { ...(asRecord(queryArgs) || {}), where: strippedWhere } as Prisma.PaymentCountArgs;
            return await prisma.payment.count(strippedArgs);
          }
          throw err;
        }
    };

    if (cursorParam) {
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

        payments = await runFindMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          include: { subscription: { include: { plan: true } }, plan: true }
        });

        if (payments.length === limit) {
          const lastRec = asRecord(payments[payments.length - 1]) || {};
          const lastCreated = lastRec.createdAt;
          const lastCreatedIso = lastCreated instanceof Date ? lastCreated.toISOString() : (typeof lastCreated === 'string' ? new Date(lastCreated).toISOString() : null);
          const lastId = typeof lastRec.id === 'string' ? lastRec.id : String(lastRec.id ?? '');
          if (lastCreatedIso) _nextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
        }
      } catch {
        // invalid cursor or decoding error — return 400
        return jsonError('Invalid cursor', 400, 'INVALID_CURSOR');
      }
    } else {
      const skip = (page - 1) * limit;

      payments = await runFindMany({
        where: whereBase,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { subscription: { include: { plan: true } }, plan: true }
      });
    }

    let totalCount: number | null = null;
    let totalSpent = 0;
    if (wantCount) {
      try {
        const [countRes, allPayments] = await Promise.all([
            runCount({ where: { userId } }),
            runFindMany({ where: { userId }, select: { amountCents: true } })
        ]);
        totalCount = countRes;
          totalSpent = (Array.isArray(allPayments) ? allPayments : []).reduce<number>((sum, p) => {
            if (typeof p === 'object' && p !== null) {
              const rec = asRecord(p) || {};
              const amount = typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0);
              return sum + amount;
            }
            return sum;
          }, 0);
      } catch (err: unknown) {
        if (isPrismaModeError(err)) {
          const [countRes, allPayments] = await Promise.all([
              runCount({ where: stripMode({ userId }) }),
              runFindMany({ where: stripMode({ userId }) as unknown, select: { amountCents: true } })
          ]);
          totalCount = countRes;
            totalSpent = (Array.isArray(allPayments) ? allPayments : []).reduce<number>((sum, p) => {
              if (typeof p === 'object' && p !== null) {
                const rec = asRecord(p) || {};
                const amount = typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0);
                return sum + amount;
              }
              return sum;
            }, 0);
        } else {
          throw err;
        }
      }
    } else {
      totalSpent = payments.reduce<number>((sum, p) => {
        if (typeof p === 'object' && p !== null) {
          const rec = p as Record<string, unknown>;
          const amount = typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0);
          return sum + amount;
        }
        return sum;
      }, 0);
    }

    // Map payments to a safe serializable shape
    const mappedPayments = (Array.isArray(payments) ? payments : []).map((p) => {
      const rec = asRecord(p) || {};
      const subRec = asRecord(rec.subscription) || {};
      const planRec = asRecord(subRec.plan) || {};
      const directPlanRec = asRecord(rec.plan) || {}; // Direct plan relation for token top-ups
      
      // Prefer plan from subscription, fallback to direct plan
      const effectivePlanRec = (planRec && typeof planRec.name === 'string') ? planRec : directPlanRec;
      
      // Compute server-side formatted amounts for each row to ensure SSR/CSR match.
      // Always use the centrally configured active currency (not the row currency).
      const formatMoney = (amt: unknown) => {
        const cents = typeof amt === 'number' ? amt : Number(amt ?? 0);
        return formatCurrency(cents, activeCurrency);
      };

      return {
        id: typeof rec.id === 'string' ? rec.id : String(rec.id ?? ''),
        amountCents: typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0),
        subtotalCents: typeof rec.subtotalCents === 'number' ? rec.subtotalCents : (rec.subtotalCents != null ? Number(rec.subtotalCents) : null),
        discountCents: typeof rec.discountCents === 'number' ? rec.discountCents : (rec.discountCents != null ? Number(rec.discountCents) : null),
        couponCode: typeof rec.couponCode === 'string' ? rec.couponCode : null,
        currency: typeof rec.currency === 'string' ? rec.currency : 'usd',
        amountFormatted: formatMoney(typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0)),
        subtotalFormatted: (rec.subtotalCents != null) ? formatMoney(rec.subtotalCents) : null,
        discountFormatted: (rec.discountCents != null) ? formatMoney(rec.discountCents) : null,
        status: typeof rec.status === 'string' ? rec.status : String(rec.status ?? ''),
        createdAt: rec.createdAt instanceof Date ? rec.createdAt.toISOString() : (typeof rec.createdAt === 'string' ? new Date(rec.createdAt).toISOString() : null),
        subscription: subRec && typeof subRec.id === 'string' ? {
          id: subRec.id,
          status: typeof subRec.status === 'string' ? subRec.status : String(subRec.status ?? ''),
          startedAt: subRec.startedAt instanceof Date ? subRec.startedAt : (typeof subRec.startedAt === 'string' ? new Date(subRec.startedAt) : new Date()),
          expiresAt: subRec.expiresAt instanceof Date ? subRec.expiresAt : (typeof subRec.expiresAt === 'string' ? new Date(subRec.expiresAt) : new Date()),
          plan: planRec && typeof planRec.name === 'string' ? {
            name: planRec.name,
            durationHours: typeof planRec.durationHours === 'number' ? planRec.durationHours : Number(planRec.durationHours ?? 0),
            tokenLimit: typeof planRec.tokenLimit === 'number' ? planRec.tokenLimit : null,
            tokenName: typeof planRec.tokenName === 'string' ? planRec.tokenName : null,
          } : { name: '', durationHours: 0, tokenLimit: null, tokenName: null }
        } : null,
        plan: effectivePlanRec && typeof effectivePlanRec.id === 'string' ? {
          id: effectivePlanRec.id,
          name: typeof effectivePlanRec.name === 'string' ? effectivePlanRec.name : '',
          tokenLimit: typeof effectivePlanRec.tokenLimit === 'number' ? effectivePlanRec.tokenLimit : null,
          tokenName: typeof effectivePlanRec.tokenName === 'string' ? effectivePlanRec.tokenName : null,
        } : null,
      };
    });

    let safeNextCursor: string | null = null;
    if (mappedPayments.length === limit) {
      const last = mappedPayments[mappedPayments.length - 1];
      const lastCreatedIso = last.createdAt;
      const lastId = last.id;
      if (lastCreatedIso && lastId) safeNextCursor = Buffer.from(`${lastCreatedIso}::${lastId}`).toString('base64');
    }

    // Build a server-side formatted totalSpent string using the primary currency (if available)
    let totalSpentFormatted: string | null = null;
    totalSpentFormatted = formatCurrency(totalSpent, activeCurrency);

    return NextResponse.json({
      payments: mappedPayments,
      totalCount,
      totalSpent,
      totalSpentFormatted,
      currentPage: cursorParam ? 1 : page,
      totalPages: totalCount != null ? Math.ceil(totalCount / limit) : null,
      hasNextPage: totalCount != null ? (cursorParam ? true : page < Math.ceil(totalCount / limit)) : mappedPayments.length === limit,
  hasPreviousPage: cursorParam ? true : page > 1,
  nextCursor: safeNextCursor ?? _nextCursor
    });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.error('Error fetching user payments', { error: err.message, stack: err.stack });
    return jsonError('Failed to fetch transactions', 500, 'PAYMENTS_FETCH_FAILED');
  }
}
