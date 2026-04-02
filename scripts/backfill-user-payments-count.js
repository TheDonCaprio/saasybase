#!/usr/bin/env node
// Backfill script to populate User.paymentsCount from Payment rows.
// Usage: node scripts/backfill-user-payments-count.js --batch=200 [--dry-run]

const { createPrismaClient } = require('./create-prisma-client.cjs');
let prisma;

async function main() {
  prisma = await createPrismaClient();
  const argv = require('minimist')(process.argv.slice(2));
  const dryRun = !!argv['dry-run'] || !!argv['dryRun'];
  const batchSize = parseInt(argv.batch || argv['batchSize'] || '200', 10) || 200;

  console.log('Backfill: User.paymentsCount');
  console.log('Options:', { dryRun, batchSize });

  // Use groupBy to compute counts per user
  const groups = await prisma.payment.groupBy({
    by: ['userId'],
    _count: { _all: true }
  });

  console.log(`Users with payments: ${groups.length}`);

  let processed = 0;
  for (let i = 0; i < groups.length; i += batchSize) {
    const chunk = groups.slice(i, i + batchSize);
    const tx = [];
    for (const g of chunk) {
      const userId = g.userId;
      const count = g._count && g._count._all ? g._count._all : 0;
      if (dryRun) {
        console.log(`[DRY] Would update user ${userId} -> ${count}`);
      } else {
        tx.push(prisma.user.update({ where: { id: userId }, data: { paymentsCount: count } }));
      }
    }
    if (!dryRun && tx.length) {
      await prisma.$transaction(tx);
      console.log(`Updated ${tx.length} users (batch ${i / batchSize + 1})`);
    }
    processed += chunk.length;
  }

  // No-op: `paymentsCount` is non-nullable and defaults to 0;
  // if you need to explicitly set users without payments to 0, run a targeted update
  // using a list of user IDs or a condition appropriate for your database.

  console.log('Done. processed=', processed);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
