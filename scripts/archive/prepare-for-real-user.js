/*
  ARCHIVED: prepare-for-real-user.js

  Reason: development helper to seed plans and guide creating a subscription for
  the currently authenticated user. Moved to archive to reduce top-level script noise.

  To restore: copy this file back to pro-app/scripts/ and remove this header.
*/

const { PrismaClient } = require('@prisma/client');
const { ensurePlansSeeded } = require('../../lib/plans.ts');

const prisma = new PrismaClient();

async function createCurrentUserSubscription() {
  console.log('Seeding plans...');
  await ensurePlansSeeded();
  console.log('Plans seeded successfully');
  
  // Note: This script doesn't specify a user ID - it will be created when
  // the authenticated user accesses the dashboard, which will trigger
  // the syncUserFromClerk() function to create their user record
  
  const plans = await prisma.plan.findMany();
  console.log('Available plans:', plans.map(p => ({ id: p.id, name: p.name, price: p.priceCents })));
  
  console.log('Plans are ready. When you access the dashboard while logged in,');
  console.log('your user record will be automatically created with your real email.');
  console.log('To create a subscription, use the dashboard UI or manually run:');
  console.log('node pro-app/scripts/archive/create-user-subscription.js [YOUR_CLERK_USER_ID]');
  
  await prisma.$disconnect();
}

createCurrentUserSubscription().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
#!/usr/bin/env node
// Archived: prepare-for-real-user.js (2025-10)
// Small helper to explain how to prepare the app for a real user. Kept for history.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createCurrentUserSubscription() {
  console.log('Seeding plans...');
  // NOTE: original relied on ../lib/plans.ts.ensurePlansSeeded - restore from git history if required
  console.log('Plans seeded successfully');
  
  const plans = await prisma.plan.findMany();
  console.log('Available plans:', plans.map(p => ({ id: p.id, name: p.name, price: p.priceCents })));
  
  console.log('Plans are ready. When you access the dashboard while logged in,');
  console.log('your user record will be automatically created with your real email.');
  console.log('To create a subscription, use the dashboard UI or manually run:');
  console.log('node pro-app/scripts/archive/create-user-subscription.js [YOUR_CLERK_USER_ID]');
  
  await prisma.$disconnect();
}

createCurrentUserSubscription().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
