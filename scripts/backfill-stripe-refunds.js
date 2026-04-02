#!/usr/bin/env node
// Backfill script: populate stripeRefundId for refunded payments missing it.
// Usage: node scripts/backfill-stripe-refunds.js

const { createPrismaClient } = require('./create-prisma-client.cjs');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

async function findRefundForPayment(payment) {
  // Try stored payment intent
  if (payment.stripePaymentIntentId) {
    try {
      const list = await stripe.refunds.list({ payment_intent: payment.stripePaymentIntentId, limit: 1 });
      if (list && list.data && list.data.length > 0) return list.data[0].id;
    } catch (err) {
      console.warn('Stripe refunds.list by payment_intent failed', { paymentId: payment.id, err: err.message });
    }
  }

  // Try checkout session -> payment intent
  if (payment.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
      const pi = session && session.payment_intent ? session.payment_intent : null;
      if (pi) {
        const list = await stripe.refunds.list({ payment_intent: pi, limit: 1 });
        if (list && list.data && list.data.length > 0) return list.data[0].id;
      }
    } catch (err) {
      console.warn('Stripe checkout.sessions.retrieve failed', { paymentId: payment.id, err: err.message });
    }
  }

  return null;
}

(async () => {
  const prisma = await createPrismaClient();
  try {
    console.log('Starting backfill: looking for refunded payments missing stripeRefundId...');
    const payments = await prisma.payment.findMany({ where: { status: 'REFUNDED', stripeRefundId: null }, take: 500 });
    console.log(`Found ${payments.length} payments to process`);
    for (const p of payments) {
      console.log('Processing', p.id);
      const refundId = await findRefundForPayment(p);
      if (refundId) {
        try {
          await prisma.payment.update({ where: { id: p.id }, data: { stripeRefundId: refundId } });
          console.log('Updated', p.id, '->', refundId);
        } catch (err) {
          console.error('Failed to update payment', p.id, err.message);
        }
      } else {
        console.log('No refund found in Stripe for', p.id);
      }
    }
    console.log('Backfill complete');
  } catch (err) {
    console.error('Backfill script failed', err && err.message ? err.message : err);
  } finally {
    await prisma.$disconnect();
  }
})();
