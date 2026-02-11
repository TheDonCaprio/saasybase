// Archived: seed_one_time_purchases.js
// Purpose: Seed demo one-time purchase plans and create test purchases. Dev-only.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedOneTimePurchases() {
  console.log('🌱 Seeding one-time purchases...');

  try {
    // First, create some one-time plans if they don't exist
    const oneTimePlans = [
      { name: '1 Hour Trial', description: 'Quick trial access for 1 hour', autoRenew: false, durationHours: 1, priceCents: 99, sortOrder: 1 },
      { name: '4 Hour Pass', description: 'Extended trial for 4 hours', autoRenew: false, durationHours: 4, priceCents: 299, sortOrder: 2 },
      { name: '12 Hour Access', description: 'Half-day access', autoRenew: false, durationHours: 12, priceCents: 699, sortOrder: 3 },
      { name: '1 Day Pass', description: 'Full day access (one-time)', autoRenew: false, durationHours: 24, priceCents: 999, sortOrder: 4 },
      { name: '3 Day Pass', description: 'Extended weekend access', autoRenew: false, durationHours: 72, priceCents: 1999, sortOrder: 5 },
      { name: '1 Week Trial', description: 'One week of full access', autoRenew: false, durationHours: 168, priceCents: 4999, sortOrder: 6 }
    ];

    console.log('Creating one-time plans...');
    const createdPlans = [];
    for (const planData of oneTimePlans) {
      const existingPlan = await prisma.plan.findUnique({ where: { name: planData.name } });
      if (!existingPlan) {
        const plan = await prisma.plan.create({ data: planData });
        createdPlans.push(plan);
        console.log(`✅ Created plan: ${plan.name}`);
      } else {
        createdPlans.push(existingPlan);
        console.log(`ℹ️  Plan already exists: ${existingPlan.name}`);
      }
    }

    // Get test user (or create one)
    let testUser = await prisma.user.findUnique({ where: { email: 'caprio@capriofiles.com' } });
    if (!testUser) {
      testUser = await prisma.user.create({ data: { email: 'caprio@capriofiles.com', role: 'USER' } });
      console.log('✅ Created test user');
    }

    // Create additional test users for variety
    const additionalUsers = [];
    const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'example.com'];
    const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Tom', 'Emma', 'Chris', 'Anna'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    for (let i = 0; i < 20; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const domain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${domain}`;
      try {
        const user = await prisma.user.create({ data: { email: email, role: 'USER' } });
        additionalUsers.push(user);
      } catch (error) {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) additionalUsers.push(existingUser);
      }
    }

    const allUsers = [testUser, ...additionalUsers];
    console.log(`✅ Total users available: ${allUsers.length}`);

    // Create purchases
    const createdPurchases = [];
    for (let i = 0; i < 150; i++) {
      const user = allUsers[Math.floor(Math.random() * allUsers.length)];
      const plan = createdPlans[Math.floor(Math.random() * createdPlans.length)];
      const now = new Date();
      const daysAgo = Math.floor(Math.random() * 90);
      const createdAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      const startedAt = new Date(createdAt);
      const expiresAt = new Date(startedAt.getTime() + (plan.durationHours * 60 * 60 * 1000));

      let subscriptionStatus = 'PENDING';
      if (expiresAt > now) subscriptionStatus = 'ACTIVE';

      try {
        const subscription = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, status: subscriptionStatus, startedAt, expiresAt, createdAt } });
        const payment = await prisma.payment.create({ data: { userId: user.id, subscriptionId: subscription.id, amountCents: plan.priceCents, currency: 'USD', status: 'SUCCEEDED', createdAt } });
        createdPurchases.push({ payment, subscription });
      } catch (error) {
        console.error(`❌ Error creating purchase ${i + 1}:`, error && error.message ? error.message : error);
      }
    }

    console.log(`🎉 Successfully created ${createdPurchases.length} one-time purchases!`);
  } catch (error) {
    console.error('❌ Error seeding one-time purchases:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedOneTimePurchases().then(() => { console.log('Done'); process.exit(0); }).catch(() => process.exit(1));
}

module.exports = { seedOneTimePurchases };
