import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-actions';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { Logger } from '@/lib/logger';
import { toError } from '@/lib/runtime-guards';
import { adminRateLimit } from '@/lib/rateLimit';
import { mergeProviderIdMap } from '@/lib/utils/provider-ids';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

async function fetchPaymentIntentFromSubscription(subscriptionId: string) {
  const resolvePaymentIntent = (value: string | Stripe.PaymentIntent | null | undefined) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      return { id: value, reason: 'from subscription invoice' } as const;
    }
    return { id: value.id, reason: 'from subscription invoice' } as const;
  };

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    });

    const latestInvoice = subscription.latest_invoice;

    if (latestInvoice && typeof latestInvoice === 'object') {
      const invoice = latestInvoice as Stripe.Invoice;
      const resolved = resolvePaymentIntent(invoice.payment_intent ?? undefined);
      if (resolved) return resolved;

      if (invoice.id) {
        const fetchedInvoice = await stripe.invoices.retrieve(invoice.id, {
          expand: ['payment_intent'],
        });
        const fallback = resolvePaymentIntent(fetchedInvoice.payment_intent ?? undefined);
        if (fallback) return fallback;
      }
      return undefined;
    }

    if (typeof latestInvoice === 'string') {
      const fetchedInvoice = await stripe.invoices.retrieve(latestInvoice, {
        expand: ['payment_intent'],
      });
      const resolved = resolvePaymentIntent(fetchedInvoice.payment_intent ?? undefined);
      if (resolved) return resolved;
    }
  } catch (subError) {
    Logger.warn('Error retrieving subscription for payment intent backfill', {
      subscriptionId,
      error: toError(subError),
    });
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
  const userId = await requireAdmin();
  const rl = await adminRateLimit(userId, req, 'admin-payments:backfill', { limit: 60, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for backfill', { userId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    // Use userId in logs to avoid unused variable warnings and provide context
    Logger.info('Backfill started by admin', { userId });
    
    // Backfill Stripe-originated records into provider-neutral external payment fields.
    // Keep legacy Stripe columns read-only here so older rows can still be migrated forward.
    const payments = await prisma.payment.findMany({
      where: {
        paymentProvider: 'stripe',
        externalPaymentId: null,
        OR: [
          { externalSessionId: { not: null } },
          {
            subscription: {
              externalSubscriptionId: { not: null },
            },
          },
        ],
      },
      include: {
        subscription: {
          select: { id: true, externalSubscriptionId: true, externalSubscriptionIds: true },
        },
      },
      take: 100, // Process in batches
      orderBy: { createdAt: 'desc' },
    });

    let processed = 0;
    let updated = 0;
    const errors: string[] = [];

  for (const payment of payments) {
      try {
        let paymentIntentId: string | undefined;
        let reason = '';

        Logger.info(`Processing payment ${payment.id}`, {
          hasCheckoutSession: !!payment.externalSessionId,
          hasSubscription: !!payment.subscription?.externalSubscriptionId,
          checkoutSessionId: payment.externalSessionId,
          subscriptionId: payment.subscription?.externalSubscriptionId,
        });

        // Try to get payment intent ID from checkout session first
        const checkoutSessionId = payment.externalSessionId;
        if (checkoutSessionId && !paymentIntentId) {
          try {
            Logger.info(`Retrieving checkout session`, { sessionId: checkoutSessionId });
            const sessionRaw = await stripe.checkout.sessions.retrieve(String(checkoutSessionId));
            const session = (sessionRaw as unknown) as Record<string, unknown>;
            
            const nestedPaymentIntent = session.payment_intent as unknown;
            if (nestedPaymentIntent) {
              if (typeof nestedPaymentIntent === 'string') {
                paymentIntentId = nestedPaymentIntent;
              } else if (typeof nestedPaymentIntent === 'object' && 'id' in nestedPaymentIntent) {
                paymentIntentId = String((nestedPaymentIntent as { id: string }).id);
              }
              if (paymentIntentId) {
                reason = 'from checkout session';
                Logger.info('Found payment intent from session', { paymentId: payment.id, paymentIntentId });
              }
            } else if (session.mode === 'subscription' && session.subscription && typeof session.subscription === 'string') {
              // For subscription sessions, get the payment intent from the latest invoice
              Logger.info('Subscription session detected', { subscriptionId: session.subscription });
              const result = await fetchPaymentIntentFromSubscription(String(session.subscription));
              if (result) {
                paymentIntentId = result.id;
                reason = result.reason;
                Logger.info('Found payment intent from subscription invoice via session', { paymentId: payment.id, paymentIntentId });
              }
            } else {
              Logger.info('No payment intent in session or wrong type', { type: typeof session.payment_intent });
            }
          } catch (e) {
            Logger.warn('Error retrieving checkout session during backfill', { sessionId: checkoutSessionId, error: toError(e) });
          }
        }

        const providerSubscriptionId = payment.subscription?.externalSubscriptionId;
        if (!paymentIntentId && providerSubscriptionId) {
          const subResult = await fetchPaymentIntentFromSubscription(providerSubscriptionId);
          if (subResult) {
            paymentIntentId = subResult.id;
            reason = subResult.reason;
            Logger.info('Found payment intent from related subscription', {
              paymentId: payment.id,
              paymentIntentId,
              subscriptionId: providerSubscriptionId,
            });
          }
        }

        // The database schema doesn't include `stripeInvoiceId` on Payment, so
        // we skip the invoice lookup path here. If you later add an invoice ID
        // column to the schema, re-enable this branch.

        // Update the payment if we found a payment intent ID
        if (paymentIntentId) {
          // Defensive: check whether another payment already claims this payment intent
          const existing = await prisma.payment.findUnique({ where: { externalPaymentId: paymentIntentId } });
          if (existing && existing.id !== payment.id) {
            const msg = `Duplicate paymentIntentId ${paymentIntentId} (claimed by payment ${existing.id})`;
            Logger.warn('Skipping update due to duplicate paymentIntentId', { paymentId: payment.id, paymentIntentId, existingPaymentId: existing.id });
            errors.push(`Payment ${payment.id}: ${msg}`);
          } else {
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                externalPaymentId: paymentIntentId,
                externalPaymentIds: mergeProviderIdMap(payment.externalPaymentIds, 'stripe', paymentIntentId) ?? payment.externalPaymentIds,
              },
            });
            Logger.info(`Updated payment ${payment.id} with payment intent ID ${paymentIntentId} (${reason})`, { paymentId: payment.id, paymentIntentId, reason });
            updated++;
          }
        }

        processed++;
        
        // Rate limiting to avoid hitting Stripe API limits
        if (processed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error: unknown) {
        const e = toError(error);
        Logger.error(`Error processing payment ${payment.id}`, e);
        errors.push(`Payment ${payment.id}: ${e.message}`);
        processed++;
      }
    }

    await recordAdminAction({
      actorId: userId,
      actorRole: 'ADMIN',
      action: 'maintenance.backfill_invoices',
      targetType: 'system',
      details: { processed, updated, errors: errors.length },
    });
    return NextResponse.json({
      success: true,
      processed,
      updated,
      mode: 'externalPaymentId',
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const e = toError(error);
    Logger.error('Backfill error', e);
    return NextResponse.json(
      { error: 'Failed to backfill external payment IDs', details: e.message },
      { status: 500 }
    );
  }
}
