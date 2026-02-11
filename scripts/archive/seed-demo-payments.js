#!/usr/bin/env node
// Archived: seed-demo-payments.js (2025-10)
// Dev-only admin payments seeder preserved in archive.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// WARNING: dev-only script. Do not run in production.
async function main() {
  const adminId = process.env.DEV_ADMIN_ID || 'user_323THm91hd4lilt0VxjggohKfFb';
  const existingAdmin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!existingAdmin) {
    console.error('Admin user not found:', adminId);
    process.exit(1);
  }

  const plan = await prisma.plan.findFirst();
  if (!plan) {
    console.error('No plan found to attach subscriptions/payments to. Run prisma seed first.');
    process.exit(1);
  }

  // Create a single subscription for admin to attach payments to
  const sub = await prisma.subscription.create({
    data: {
      userId: adminId,
      planId: plan.id,
      status: 'ACTIVE',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + plan.durationHours * 3600 * 1000),
    }
  });

  const paymentsToCreate = 55;
  const items = [];
  const now = Date.now();
  for (let i = 0; i < paymentsToCreate; i++) {
    items.push({
      userId: adminId,
      subscriptionId: sub.id,
      amountCents: plan.priceCents,
      status: i % 7 === 0 ? 'REFUNDED' : 'SUCCEEDED',
      createdAt: new Date(now - i * 60 * 1000), // spaced 1 minute apart
    });
  }

  console.log('Creating', items.length, 'payments...');
  for (const p of items) {
    await prisma.payment.create({ data: p });
  }

  const total = await prisma.payment.count({ where: { userId: adminId } });
  console.log('Done. Admin payment count:', total);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
