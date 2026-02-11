#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Normalizing statuses: CANCELED -> CANCELLED');

    const subs = await prisma.subscription.findMany({ where: { status: 'CANCELED' }, select: { id: true } });
    console.log(`Found ${subs.length} subscriptions with status='CANCELED'`);
    if (subs.length > 0) {
      const res = await prisma.subscription.updateMany({ where: { status: 'CANCELED' }, data: { status: 'CANCELLED' } });
      console.log(`Updated ${res.count} subscription rows`);
    }

    const payments = await prisma.payment.findMany({ where: { status: 'CANCELED' }, select: { id: true } });
    console.log(`Found ${payments.length} payments with status='CANCELED'`);
    if (payments.length > 0) {
      const pres = await prisma.payment.updateMany({ where: { status: 'CANCELED' }, data: { status: 'CANCELLED' } });
      console.log(`Updated ${pres.count} payment rows`);
    }

    console.log('Normalization complete');
  } catch (err) {
    console.error('Normalization failed', err);
  } finally {
    await prisma.$disconnect();
  }
})();
