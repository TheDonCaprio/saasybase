#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Archived subscription inspection helper.
// Usage: node scripts/archive/debug-subscription.js --id <subscriptionId>
//        node scripts/archive/debug-subscription.js --since "2025-10-16T12:20:00" --until "2025-10-16T12:30:00"

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--id') out.id = args[++i];
    if (a === '--since') out.since = args[++i];
    if (a === '--until') out.until = args[++i];
  }
  return out;
}

async function run() {
  const opts = parseArgs();
  try {
    if (opts.id) {
      const sub = await prisma.subscription.findUnique({ where: { id: opts.id } });
      console.log('Subscription:', sub);
      return;
    }

    const where = {};
    if (opts.since || opts.until) {
      where.canceledAt = {};
      if (opts.since) where.canceledAt.gte = new Date(opts.since);
      if (opts.until) where.canceledAt.lte = new Date(opts.until);
    }

    const subs = await prisma.subscription.findMany({ where, orderBy: { canceledAt: 'desc' }, take: 20 });
    console.log(`Found ${subs.length} subscriptions matching query`);
    subs.forEach(s => {
      console.log(`- id=${s.id} status=${s.status} canceledAt=${s.canceledAt} expiresAt=${s.expiresAt} userId=${s.userId}`);
    });
  } catch (err) {
    console.error('Error querying subscriptions:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
