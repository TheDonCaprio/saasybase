/*
  ARCHIVED: cleanup_stale_pending.js

  Reason: maintenance helper to cancel stale PENDING subscriptions. Moved to
  archive to keep top-level scripts focused; preserved for ops use.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

#!/usr/bin/env node
// Safe cleanup script for stale PENDING subscriptions
// Usage examples (dry-run, default 7 days):
//  node pro-app/scripts/archive/cleanup_stale_pending.js --days=7 --plan=cmfgw6fho0005cze34v86rbly
// To perform the update (cancel subscriptions and payments):
//  node pro-app/scripts/archive/cleanup_stale_pending.js --days=7 --plan=cmfgw6fho0005cze34v86rbly --yes

const rawArgs = process.argv.slice(2);
const argv = {};
for (const a of rawArgs) {
  const [k, v] = a.split('=');
  const key = k.replace(/^--/, '');
  argv[key] = v === undefined ? true : v;
}

const DAYS = argv.days ? parseInt(argv.days, 10) : 7;
const PLAN = argv.plan || null;
const DOIT = !!argv.yes; // if true, perform updates; otherwise dry-run

const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

function iso(d) { return d ? new Date(d).toISOString() : null; }

(async function main() {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);

    console.log(`Running cleanup_stale_pending (dry-run=${!DOIT})`);
    console.log(`Threshold (createdAt <) = ${threshold.toISOString()} (older than ${DAYS} days)`);
    if (PLAN) console.log(`Filtering to plan: ${PLAN}`);

    const where = {
      status: 'PENDING',
      createdAt: { lt: threshold }
    };
    if (PLAN) where.planId = PLAN;

    const subs = await prisma.subscription.findMany({
      where,
      include: { payments: true, plan: true, user: true }
    });

    console.log(`Found ${subs.length} stale PENDING subscription(s)`);
    if (subs.length === 0) return;

    for (const s of subs) {
      console.log('\n---');
      console.log(`subscription.id: ${s.id}`);
      console.log(`user: ${s.user ? s.user.email : s.userId}`);
      console.log(`plan: ${s.plan ? s.plan.name : s.planId} (${s.planId})`);
      console.log(`createdAt: ${iso(s.createdAt)}, startedAt: ${iso(s.startedAt)}, expiresAt: ${iso(s.expiresAt)}`);
      console.log(`payments (${s.payments.length}):`);
      for (const p of s.payments) {
        console.log(`  payment.id: ${p.id} status=${p.status} amount=${p.amountCents} stripePI=${p.stripePaymentIntentId} stripeSess=${p.stripeCheckoutSessionId} createdAt=${iso(p.createdAt)}`);
      }
    }

    if (!DOIT) {
      console.log('\nDry-run complete. To apply these changes, re-run with the --yes flag (this will set subscription.status = "CANCELLED" and payment.status = "CANCELLED").');
      return;
    }

    console.log('\nApplying changes: canceling subscriptions and payments...');
    const tx = [];
    for (const s of subs) {
      // Update payments for subscription
      tx.push(prisma.payment.updateMany({ where: { subscriptionId: s.id }, data: { status: 'CANCELLED' } }));
      // Update subscription status
      tx.push(prisma.subscription.update({ where: { id: s.id }, data: { status: 'CANCELLED' } }));
    }

    const results = await prisma.$transaction(tx);

    // Simple summary counts
    let paymentsUpdated = 0;
    let subsUpdated = 0;
    for (const r of results) {
      if (r.count !== undefined) paymentsUpdated += r.count; // updateMany returns { count }
      else if (r.id) subsUpdated += 1; // update returns the updated row
    }

    console.log(`Updated ${subsUpdated} subscription(s) and ${paymentsUpdated} payment(s).`);

  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
})();
