#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = 'user_323THm91hd4lilt0VxjggohKfFb';
  const planId = 'cmfgw6fh30000cze3iiisppnf';

  console.log('Using user:', userId, 'plan:', planId);

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    console.error('Plan not found:', planId);
    process.exit(1);
  }
  const periodMs = plan.durationHours * 3600 * 1000;

  // Ensure there is an active subscription for the user+plan
  let active = await prisma.subscription.findFirst({ where: { userId, planId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'desc' } });
  if (!active) {
    const now = new Date();
    const sub = await prisma.subscription.create({ data: { userId, planId, status: 'ACTIVE', startedAt: now, expiresAt: new Date(now.getTime() + periodMs) } });
    active = sub;
    console.log('Created initial active subscription id=', sub.id, 'expiresAt=', sub.expiresAt.toISOString());
  } else {
    console.log('Found existing active subscription id=', active.id, 'expiresAt=', active.expiresAt.toISOString());
  }

  // Print payments count before
  const paymentsBefore = await prisma.payment.findMany({ where: { userId, subscriptionId: active.id } });
  console.log('Payments for this subscription before:', paymentsBefore.length);

  // Perform stacking: extend expiresAt by periodMs and create payment
  const now = new Date();
  const updatedExpires = new Date(active.expiresAt.getTime() + periodMs);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: active.id }, data: { expiresAt: updatedExpires } });
    await tx.payment.create({ data: { userId, subscriptionId: active.id, amountCents: plan.priceCents, status: 'SUCCEEDED', stripeCheckoutSessionId: 'demo_cs', stripePaymentIntentId: 'demo_pi' } });
  });

  const refreshed = await prisma.subscription.findUnique({ where: { id: active.id } });
  console.log('Subscription after stacking id=', refreshed.id, 'expiresAt=', refreshed.expiresAt.toISOString());

  const paymentsAfter = await prisma.payment.findMany({ where: { userId, subscriptionId: active.id }, orderBy: { createdAt: 'asc' } });
  console.log('Payments for this subscription after:', paymentsAfter.length);
  paymentsAfter.slice(-3).forEach(p => console.log('  ', p.id, p.amountCents, p.createdAt));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
