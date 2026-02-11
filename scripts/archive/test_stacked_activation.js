#!/usr/bin/env node

// Test script to validate PENDING subscription activation
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Testing PENDING subscription activation ===');
  
  const userId = 'user_323THm91hd4lilt0VxjggohKfFb';
  const planId = 'cmfgw6fh30000cze3iiisppnf'; // 1 Hour Trial
  
  // Create a PENDING subscription that should activate "now" (start time in the past)
  const pastStartTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const futureEndTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  
  console.log('Creating PENDING subscription with past start time...');
  const pendingSub = await prisma.subscription.create({
    data: {
      userId,
      planId,
      status: 'PENDING',
      startedAt: pastStartTime,
      expiresAt: futureEndTime
    },
    include: { plan: true }
  });
  
  console.log('Created PENDING subscription:');
  console.log(`  id= ${pendingSub.id}`);
  console.log(`  status= ${pendingSub.status}`);
  console.log(`  startedAt= ${pendingSub.startedAt.toISOString()}`);
  console.log(`  expiresAt= ${pendingSub.expiresAt.toISOString()}`);
  console.log('');
  
  // Now simulate the activation logic from /api/subscription
  console.log('Running activation logic...');
  const now = new Date();
  
  const result = await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ['PENDING'] },
      startedAt: { lte: now }
    },
    data: {
      status: 'ACTIVE'
    }
  });
  
  console.log(`Activated ${result.count} subscription(s)`);
  
  // Check the result
  const updatedSub = await prisma.subscription.findUnique({
    where: { id: pendingSub.id },
    include: { plan: true }
  });
  
  console.log('');
  console.log('Updated subscription:');
  console.log(`  id= ${updatedSub.id}`);
  console.log(`  status= ${updatedSub.status}`);
  console.log(`  plan= ${updatedSub.plan.name}`);
  console.log(`  startedAt= ${updatedSub.startedAt.toISOString()}`);
  console.log(`  expiresAt= ${updatedSub.expiresAt.toISOString()}`);
  
  if (updatedSub.status === 'ACTIVE') {
    console.log('');
    console.log('✅ SUCCESS: PENDING subscription was automatically activated!');
  } else {
    console.log('');
    console.log('❌ FAILED: PENDING subscription was not activated');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());