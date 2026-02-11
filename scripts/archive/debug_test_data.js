#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Check if we have any plans in the database
(async () => {
  try {
    console.log('=== Checking Plans in Database ===');
    const plans = await prisma.plan.findMany({
      select: { id: true, name: true, stripePriceId: true, durationHours: true, priceCents: true }
    });
    console.log('Plans found:', plans.length);
    plans.forEach(p => {
      console.log(`- ${p.name}: ${p.stripePriceId} (${p.durationHours}h, $${p.priceCents/100})`);
    });

    // Check if we have any users
    console.log('\n=== Checking Users in Database ===');
    const users = await prisma.user.findMany({
      select: { id: true, email: true, createdAt: true },
      take: 5
    });
    console.log('Users found:', users.length);
    users.forEach(u => {
      console.log(`- ${u.id}: ${u.email} (${u.createdAt.toISOString()})`);
    });

  } catch (error) {
    console.error('Database query error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();