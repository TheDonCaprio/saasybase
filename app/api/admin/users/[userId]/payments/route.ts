import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../../../lib/auth';
import { asRecord, toError } from '../../../../../../lib/runtime-guards';
import { Logger } from '../../../../../../lib/logger';
import { adminRateLimit } from '../../../../../../lib/rateLimit';
import { paymentService } from '../../../../../../lib/payment/service';
import { getActiveCurrencyAsync } from '../../../../../../lib/payment/registry';
import { formatCurrency as formatCurrencyUtil } from '../../../../../../lib/utils/currency';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const params = await ctx.params;
  try {
    const actor = await requireAdminOrModerator('users');
    const actorId = actor.userId;
    const rl = await adminRateLimit(actorId, request, 'admin-users:payments:list', { limit: 240, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for user payments list', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const wantCount = searchParams.get('count') !== 'false';
    const skip = (page - 1) * limit;

    const activeCurrency = await getActiveCurrencyAsync();

    const paymentsUnknown: unknown = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        subscription: {
          include: {
            plan: true
          }
        }
      }
    });

    const totalCount = wantCount ? await prisma.payment.count({ where: { userId } }) : null;

    const payments = Array.isArray(paymentsUnknown) ? paymentsUnknown as unknown[] : [];

    const formattedPayments = payments.map((p) => {
      const rec = asRecord(p) || {};
      const subRec = asRecord(rec.subscription) || {};
      const planRec = asRecord(subRec.plan) || {};
      const amountCents = typeof rec.amountCents === 'number' ? rec.amountCents : Number(rec.amountCents ?? 0);
      return {
        id: typeof rec.id === 'string' ? rec.id : String(rec.id ?? ''),
        amount: amountCents,
        amountFormatted: formatCurrencyUtil(amountCents, activeCurrency),
        displayCurrency: activeCurrency,
        currency: typeof rec.currency === 'string' ? rec.currency : null,
        status: typeof rec.status === 'string' ? rec.status : String(rec.status ?? ''),
        createdAt: rec.createdAt instanceof Date ? rec.createdAt.toISOString() : (typeof rec.createdAt === 'string' ? new Date(rec.createdAt).toISOString() : null),
        planName: typeof planRec.name === 'string' ? planRec.name as string : null,
        paymentProvider: typeof rec.paymentProvider === 'string' ? rec.paymentProvider : null,
        externalPaymentId: typeof rec.externalPaymentId === 'string' ? rec.externalPaymentId : null,
        externalSessionId: typeof rec.externalSessionId === 'string' ? rec.externalSessionId : null,
        externalRefundId: typeof rec.externalRefundId === 'string' ? rec.externalRefundId : null,
        dashboardUrl: typeof rec.externalPaymentId === 'string' ? paymentService.getDashboardUrl('payment', rec.externalPaymentId) : null
      };
    });

    return NextResponse.json({
      payments: formattedPayments,
      totalCount,
      currentPage: page,
      totalPages: totalCount != null ? Math.max(1, Math.ceil(totalCount / limit)) : null
    });
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Error fetching user payments', { error: err.message, stack: err.stack });

    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}