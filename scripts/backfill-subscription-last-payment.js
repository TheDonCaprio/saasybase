#!/usr/bin/env node
/*
 Backfill script for Subscription.lastPaymentAmountCents

 Usage:
  node ./scripts/backfill-subscription-last-payment.js [--dry-run] [--force] [--batch=200]

  --dry-run : show what would be updated without writing changes
  --force   : update all subscriptions (even those that already have a value)
  --batch=# : number of subscriptions to process per batch (default 200)

 This script uses the Prisma Client available in the project.
*/

const { createPrismaClient } = require('./create-prisma-client.cjs');
let prisma;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const batchArg = argv.find(a => a.startsWith('--batch='));
const batchSize = batchArg ? Math.max(1, Number(batchArg.split('=')[1] || 200)) : 200;

async function main() {
  prisma = await createPrismaClient();
  console.log('Backfill: Subscription.lastPaymentAmountCents');
  console.log(`Options: dryRun=${dryRun}, force=${force}, batchSize=${batchSize}`);

  const where = force ? {} : { lastPaymentAmountCents: null };
  const total = await prisma.subscription.count({ where });
  console.log(`Subscriptions to process: ${total}`);

  let processed = 0;
  let skipped = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const subs = await prisma.subscription.findMany({ where, select: { id: true }, take: batchSize, skip: offset });
    if (!subs || subs.length === 0) break;

    for (const s of subs) {
      // Find latest payment for this subscription (any status) ordered by createdAt desc
      const latest = await prisma.payment.findFirst({
        where: { subscriptionId: s.id },
        orderBy: { createdAt: 'desc' },
        select: { amountCents: true }
      });

      if (latest && typeof latest.amountCents === 'number') {
        if (dryRun) {
          console.log(`[dry-run] would set subscription ${s.id} -> ${latest.amountCents}`);
        } else {
          await prisma.subscription.update({ where: { id: s.id }, data: { lastPaymentAmountCents: latest.amountCents } });
          console.log(`Updated subscription ${s.id} -> ${latest.amountCents}`);
        }
        processed++;
      } else {
        // No payment found — explicitly set null if force, otherwise skip
        if (dryRun) {
          console.log(`[dry-run] no payments found for ${s.id}`);
        } else if (force) {
          await prisma.subscription.update({ where: { id: s.id }, data: { lastPaymentAmountCents: null } });
          console.log(`Set null for ${s.id}`);
          processed++;
        } else {
          skipped++;
        }
      }
    }
  }

  console.log(`Done. processed=${processed} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error('Fatal error', err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
