#!/usr/bin/env node
// Archived: seed-demo-subscriptions.js (2025-10)
// Demo subscription seeder kept for history.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// DEV ONLY: Create up to 150 recurring subscriptions for demo users.
// Idempotent: skips users that already have a subscription for the chosen plan.

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-demo-subscriptions in production');
    process.exit(1);
  }

  const target = 150;
  const plan = await prisma.plan.findFirst();
  if (!plan) {
    console.error('No plan found. Run prisma seed or create a Plan first.');
    process.exit(1);
  }

  // Get up to `target` users ordered by createdAt ascending
  const users = await prisma.user.findMany({ take: target, orderBy: { createdAt: 'asc' } });
  console.log(`Found ${users.length} users; will ensure up to ${target} subscriptions for plan ${plan.name}`);

  let created = 0;
  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    // Skip if user already has any subscription for this plan
    const existing = await prisma.subscription.findFirst({ where: { userId: user.id, planId: plan.id } });
    if (existing) continue;

    const startedAt = new Date(Date.now() - (i * 24 * 3600 * 1000)); // stagger starts by day
    const expiresAt = new Date(startedAt.getTime() + plan.durationHours * 3600 * 1000);

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: 'ACTIVE',
        startedAt,
        expiresAt,
        stripeSubscriptionId: `demo-sub-${String(i+1).padStart(3, '0')}-${user.id}`,
        createdAt: new Date(startedAt.getTime() - 1000)
      }
    });

    created++;
    if (created % 25 === 0) console.log(`Created ${created} subscriptions...`);
  }

  const totalSubs = await prisma.subscription.count();
  console.log(`Done. Created ${created} subscriptions. Total subscriptions in DB: ${totalSubs}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
