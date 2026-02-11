#!/usr/bin/env node
// Archived: force_delete_plan.js (2025-10)
// Destructive helper preserved in archive; restore if you truly need it.

// Destructive force-delete script for a plan and all associated subscriptions/payments
// WARNING: This permanently deletes rows. Use only when you accept data loss.
// Usage: node pro-app/scripts/force_delete_plan.js --plan=<planId> --yes

const rawArgs = process.argv.slice(2);
const argv = {};
for (const a of rawArgs) {
  const [k, v] = a.split('=');
  const key = k.replace(/^--/, '');
  argv[key] = v === undefined ? true : v;
}

const PLAN = argv.plan || null;
const DOIT = !!argv.yes;

if (!PLAN) {
  console.error('ERROR: --plan=<planId> is required');
  process.exit(2);
}
if (!DOIT) {
  console.error('ERROR: destructive script requires --yes to run');
  console.error('Usage: node pro-app/scripts/force_delete_plan.js --plan=<planId> --yes');
  process.exit(2);
}

const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

(async function main() {
  try {
    console.log(`Force-deleting plan ${PLAN} and all related subscriptions/payments`);

    // Find subscriptions for plan
    const subs = await prisma.subscription.findMany({ where: { planId: PLAN } });
    const subIds = subs.map(s => s.id);

    console.log(`Found ${subIds.length} subscription(s) for plan ${PLAN}`);

    // Run transaction: delete payments -> delete subscriptions -> delete plan
    const deleted = await prisma.$transaction([
      prisma.payment.deleteMany({ where: { subscriptionId: { in: subIds } } }),
      prisma.subscription.deleteMany({ where: { id: { in: subIds } } }),
      prisma.plan.delete({ where: { id: PLAN } })
    ]);

    // deleted[0] is { count } for payments, deleted[1] is { count } for subs, deleted[2] is the deleted plan object
    console.log(`Deleted payments count: ${deleted[0].count}`);
    console.log(`Deleted subscriptions count: ${deleted[1].count}`);
    console.log(`Deleted plan id: ${deleted[2].id}, name: ${deleted[2].name}`);

  } catch (err) {
    console.error('Error during force delete:', err);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
})();
