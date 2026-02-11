#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = 'user_323THm91hd4lilt0VxjggohKfFb';
  const planId = 'cmfgw6fh30000cze3iiisppnf';

  console.log('=== Testing PENDING subscription creation (was STACKED) ===');
  console.log('Using user:', userId, 'plan:', planId);

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    console.error('Plan not found:', planId);
    process.exit(1);
  }

  // Ensure there is an active subscription for the user+plan
  let active = await prisma.subscription.findFirst({ 
    where: { userId, planId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, 
    orderBy: { expiresAt: 'desc' } 
  });
  
  if (!active) {
    const now = new Date();
    const periodMs = plan.durationHours * 3600 * 1000;
    const sub = await prisma.subscription.create({ 
      data: { userId, planId, status: 'ACTIVE', startedAt: now, expiresAt: new Date(now.getTime() + periodMs) } 
    });
    active = sub;
    console.log('Created initial active subscription id=', sub.id, 'expiresAt=', sub.expiresAt.toISOString());
  } else {
    console.log('Found existing active subscription id=', active.id, 'expiresAt=', active.expiresAt.toISOString());
  }

  // Now create a PENDING subscription (simulating a purchase while an active subscription exists)
  const pendingStartsAt = active.expiresAt;
  const periodMs = plan.durationHours * 3600 * 1000;
  const pendingExpiresAt = new Date(pendingStartsAt.getTime() + periodMs);

  const pendingSub = await prisma.subscription.create({
    data: {
      userId,
      planId,
      status: 'PENDING',
      startedAt: pendingStartsAt,
      expiresAt: pendingExpiresAt
    }
  });

    console.log('Created PENDING subscription:');
    console.log('  id=', pendingSub.id);
    console.log('  status=', pendingSub.status);
    console.log('  startedAt=', pendingSub.startedAt.toISOString());
    console.log('  expiresAt=', pendingSub.expiresAt.toISOString());

  // List all subscriptions for this user
  const allSubs = await prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n=== All subscriptions for user ===');
  allSubs.forEach(sub => {
    console.log(`${sub.id} | ${sub.status} | ${sub.plan.name} | starts: ${sub.startedAt.toISOString()} | expires: ${sub.expiresAt.toISOString()}`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });