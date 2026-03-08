import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../../../lib/prisma';
import { createInvoicePDF } from '../../../../../lib/invoice';
import { paymentService } from '../../../../../lib/payment/service';
import { getSiteName, getSupportEmail } from '../../../../../lib/settings';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> }
) {
  const params = await ctx.params;
  try {
    const { userId } = await authService.getSession();

    if (!userId) {
      return jsonError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    Logger.info('Generating invoice for payment', { paymentId: params.paymentId, userId });

    // Get the payment record with subscription details
    const payment = await prisma.payment.findFirst({
      where: {
        id: params.paymentId,
        userId: userId
      },
      include: {
        subscription: {
          include: {
            plan: true
          }
        },
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    });

    if (!payment) {
      Logger.warn('Payment not found for invoice generation', { paymentId: params.paymentId });
      return jsonError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    Logger.info('Found payment, generating PDF', { paymentId: payment.id });

    // Fetch settings for dynamic content
    const [siteName, supportEmail] = await Promise.all([
      getSiteName(),
      getSupportEmail()
    ]);

    const paymentWithPricing = payment as typeof payment & { subtotalCents?: number | null; discountCents?: number | null; couponCode?: string | null };
    let resolvedSubtotal: number | null | undefined = paymentWithPricing.subtotalCents;
    let resolvedDiscount: number | null | undefined = paymentWithPricing.discountCents;
    let resolvedCoupon: string | null = paymentWithPricing.couponCode || null;

    if ((resolvedSubtotal == null || resolvedDiscount == null || !resolvedCoupon) && payment.externalSessionId) {
      try {
        // Use the payment's originating provider to fetch session details
        const provider = paymentService.getProviderForRecord(payment.paymentProvider);
        const session = await provider.getCheckoutSession(payment.externalSessionId);
        const sessionSubtotal = session.amountSubtotal;
        const sessionTotal = session.amountTotal;
        const sessionDiscount = session.amountDiscount;
        if (resolvedSubtotal == null && sessionSubtotal != null) resolvedSubtotal = sessionSubtotal;
        if (resolvedDiscount == null && sessionDiscount != null) resolvedDiscount = sessionDiscount;
        if (!resolvedCoupon) resolvedCoupon = session.metadata?.couponCode || null;
        if (resolvedSubtotal == null && sessionTotal != null && sessionDiscount != null) {
          resolvedSubtotal = sessionTotal + sessionDiscount;
        }
        if (resolvedDiscount == null && resolvedSubtotal != null && sessionTotal != null) {
          resolvedDiscount = Math.max(0, resolvedSubtotal - sessionTotal);
        }
      } catch (fetchErr: unknown) {
        Logger.warn('Could not hydrate invoice pricing from provider session', {
          paymentId: payment.id,
          sessionId: payment.externalSessionId,
          error: toError(fetchErr).message,
        });
      }
    }

    const computedSubtotal = resolvedSubtotal ?? payment.amountCents;
    const inferredDiscount = resolvedDiscount ?? Math.max(0, computedSubtotal - payment.amountCents);
    const couponCode = resolvedCoupon;

    const invoicePayment = {
      id: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      subtotalCents: computedSubtotal,
      discountCents: inferredDiscount,
      couponCode,
      stripePaymentIntentId: payment.externalPaymentId, // Keeping the field name in invoice object compatible for now, or update createInvoicePDF type
    };

    const invoiceSubscription = payment.subscription
      ? {
        id: payment.subscription.id,
        startedAt: payment.subscription.startedAt,
        expiresAt: payment.subscription.expiresAt,
        stripeSubscriptionId: payment.subscription.externalSubscriptionId,
      }
      : null;

    const invoicePlan = payment.subscription?.plan
      ? {
        name: payment.subscription.plan.name,
        description: payment.subscription.plan.description,
        durationHours: payment.subscription.plan.durationHours,
      }
      : null;

    // Generate PDF invoice
    const pdfBuffer = await createInvoicePDF({
      payment: invoicePayment,
      user: payment.user,
      subscription: invoiceSubscription,
      plan: invoicePlan,
      settings: {
        siteName,
        supportEmail
      }
    });

    Logger.info('PDF generated successfully', { paymentId: payment.id, size: pdfBuffer.length });

    // Set response headers for PDF download
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `attachment; filename="invoice-${payment.id}.pdf"`);
    headers.set('Content-Length', pdfBuffer.length.toString());

    // pdfBuffer is a Buffer - create a Buffer and cast once to BodyInit at the boundary
    const body = Buffer.from(pdfBuffer);
    return new NextResponse(body as BodyInit, { headers });

  } catch (error: unknown) {
    const e = toError(error);
    Logger.error('Error generating invoice', { error: e.message, stack: e.stack, paymentId: params.paymentId });
    return NextResponse.json(
      { error: 'Failed to generate invoice', code: 'INVOICE_GENERATION_FAILED', details: e.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
