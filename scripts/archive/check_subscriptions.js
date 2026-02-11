#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    console.log('=== DB connection ok ===');
    const [subCount, payCount] = await Promise.all([prisma.subscription.count(), prisma.payment.count()]);
    console.log('Subscriptions:', subCount, 'Payments:', payCount);

    console.log('\n=== Last 50 subscriptions ===');
    const subs = await prisma.subscription.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    subs.forEach(s => {
      console.log(s.id, 'user:', s.userId, 'plan:', s.planId, 'status:', s.status, 'startedAt:', s.startedAt?.toISOString(), 'expiresAt:', s.expiresAt?.toISOString(), 'stripeSubId:', s.stripeSubscriptionId, 'createdAt:', s.createdAt.toISOString());
    });

    console.log('\n=== Last 50 payments ===');
    const pays = await prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    pays.forEach(p => {
      console.log(p.id, 'user:', p.userId, 'subId:', p.subscriptionId, 'amount:', p.amountCents, 'stripeIntent:', p.stripePaymentIntentId, 'checkoutSession:', p.stripeCheckoutSessionId, 'createdAt:', p.createdAt.toISOString());
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();

