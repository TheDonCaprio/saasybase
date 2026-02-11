import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '../../../../../lib/prisma';
import { createRefundPDF } from '../../../../../lib/refundReceipt';
import { paymentService } from '../../../../../lib/payment/service';
import { getSiteName, getSupportEmail } from '../../../../../lib/settings';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra || {}) }, { status });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> }
) {
  const params = await ctx.params;
  try {
    const { userId } = await auth();
    if (!userId) return jsonError('Unauthorized', 401, 'UNAUTHORIZED');

    Logger.info('Generating refund receipt', { paymentId: params.paymentId, userId });

    const payment = await prisma.payment.findFirst({
      where: { id: params.paymentId, userId },
      include: { subscription: { include: { plan: true } }, user: { select: { email: true, name: true } } }
    });

    if (!payment) return jsonError('Payment not found', 404, 'PAYMENT_NOT_FOUND');

    if (payment.status !== 'REFUNDED') {
      return jsonError('Payment is not refunded', 400, 'PAYMENT_NOT_REFUNDED');
    }

    const [siteName, supportEmail] = await Promise.all([getSiteName(), getSupportEmail()]);

    // Attempt to hydrate refund details from Provider.
    let refundRecord: { id: string; amount: number; status?: string | null; created?: Date | null } | null = null;

    try {
      // Use the payment's originating provider for refund details
      const provider = paymentService.getProviderForRecord(payment.paymentProvider);
      
      // Try using externalPaymentId (PaymentIntent ID)
      if (payment.externalPaymentId) {
        refundRecord = await provider.getRefundDetails(payment.externalPaymentId);
      }

      // Fallback: try via session if no refund found yet
      if (!refundRecord && payment.externalSessionId) {
        const session = await provider.getCheckoutSession(payment.externalSessionId);
        if (session.paymentIntentId) {
          refundRecord = await provider.getRefundDetails(session.paymentIntentId);
        }
      }
    } catch (err: unknown) {
      Logger.warn('Could not hydrate refund details from Provider', { paymentId: payment.id, error: toError(err).message });
    }

    // Some providers (or our integrations) may not expose a total refunded amount via a single query.
    // Since this endpoint only serves receipts for REFUNDED payments (full refunds), use the local
    // payment amount as a reliable fallback.
    if (refundRecord) {
      if (!refundRecord.amount || refundRecord.amount <= 0) {
        refundRecord.amount = payment.amountCents;
      }
    } else if (payment.externalRefundId) {
      refundRecord = {
        id: payment.externalRefundId,
        amount: payment.amountCents,
        status: null,
        created: null,
      };
    }

    const pdfBuffer = await createRefundPDF({
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        subtotalCents: payment.subtotalCents ?? undefined,
        discountCents: payment.discountCents ?? undefined,
        couponCode: payment.couponCode ?? undefined,
        stripePaymentIntentId: payment.externalPaymentId ?? undefined,
      },
      refund: refundRecord ? {
        id: refundRecord.id,
        amount: refundRecord.amount,
        status: refundRecord.status || null,
        created: refundRecord.created ? refundRecord.created.getTime() / 1000 : null // createRefundPDF expects unix timestamp? Check type.
      } : null,
      user: payment.user,
      subscription: payment.subscription
        ? {
          id: payment.subscription.id,
          startedAt: payment.subscription.startedAt,
          expiresAt: payment.subscription.expiresAt,
          stripeSubscriptionId: payment.subscription.externalSubscriptionId ?? undefined,
        }
        : null,
      plan: payment.subscription?.plan
        ? {
          name: payment.subscription.plan.name,
          description: payment.subscription.plan.description ?? null,
          durationHours: payment.subscription.plan.durationHours,
        }
        : null,
      settings: { siteName, supportEmail }
    });

    Logger.info('Refund PDF generated', { paymentId: payment.id, size: pdfBuffer.length });

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="refund-${payment.id}.pdf"`);
    headers.set('Content-Length', String(pdfBuffer.length));

    const body = Buffer.from(pdfBuffer);
    return new NextResponse(body as BodyInit, { headers });
  } catch (error: unknown) {
    const e = toError(error);
    Logger.error('Error generating refund receipt', { error: e.message, stack: e.stack, paymentId: params.paymentId });
    return jsonError('Failed to generate refund receipt', 500, 'REFUND_RECEIPT_FAILED', { details: e.message || 'Unknown error' });
  }
}
