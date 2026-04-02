#!/usr/bin/env node
/*
 * One-off script to cancel all subscriptions in the database.
 * Usage:
 *  - Dry run (safe): node scripts/cancel-all-subscriptions.js
 *  - Execute: node scripts/cancel-all-subscriptions.js --yes
 *  - Or set CONFIRM=true env var to run without flag.
 */

const { createPrismaClient } = require('./create-prisma-client.cjs');

async function main() {
  const prisma = await createPrismaClient();
  try {
    const proceed = process.argv.includes('--yes') || process.env.CONFIRM === 'true';

    const subs = await prisma.subscription.findMany({ take: 5, orderBy: { createdAt: 'asc' } });
    const total = await prisma.subscription.count();

    console.log(`Found ${total} subscriptions in the database.`);
    if (total === 0) {
      await prisma.$disconnect();
      return;
    }

    console.log('\nSample subscriptions (up to 5):');
    subs.forEach((s) => {
      console.log(`- id=${s.id} status=${s.status} external=${s.externalSubscriptionId || s.stripeSubscriptionId || 'N/A'}`);
    });

    if (!proceed) {
      console.log('\nDry run only. To actually mark all subscriptions as cancelled, re-run with `--yes` or set CONFIRM=true');
      await prisma.$disconnect();
      return;
    }

    const now = new Date();
    console.log('\nExecuting cancellation: marking subscriptions as CANCELLED...');
    const updateResult = await prisma.subscription.updateMany({
      where: { status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', canceledAt: now, expiresAt: now }
    });

    console.log(`Updated ${updateResult.count} subscription(s) to CANCELLED.`);

    await prisma.$disconnect();
  } catch (err) {
    console.error('Error cancelling subscriptions:', err);
    try { await prisma.$disconnect(); } catch (_) {}
    process.exit(1);
  }
}

main();
