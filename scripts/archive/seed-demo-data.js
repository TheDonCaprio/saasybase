// Archived: seed-demo-data.js
// Purpose: Seed a smaller set of demo users, subscriptions, payments, feature usage, and visit analytics for local testing.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedDemoData() {
  console.log('🌱 Seeding demo data...');
  try {
    const existingDemoUsers = await prisma.user.count({ where: { email: { startsWith: 'demo' } } });
    if (existingDemoUsers > 0) {
      console.log(`📊 Found ${existingDemoUsers} existing demo users, skipping user creation`);
    }

    let users = [];
    if (existingDemoUsers === 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      for (let i = 0; i < 50; i++) {
        const createdAt = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000 * Math.random() * 2));
        const user = await prisma.user.create({ data: { email: `demo${i}@example.com`, name: `Demo User ${i}`, createdAt, updatedAt: createdAt } });
        users.push(user);
      }
      console.log(`✅ Created ${users.length} demo users`);
    } else {
      users = await prisma.user.findMany({ where: { email: { startsWith: 'demo' } } });
      console.log(`📊 Using ${users.length} existing demo users`);
    }

    const plans = await prisma.plan.findMany();
    if (!plans.length) { console.log('❌ No plans found. Create plans first.'); return; }

    let subscriptionCount = 0;
    let paymentCount = 0;
    for (const user of users) {
      if (Math.random() < 0.6) {
        const randomPlan = plans[Math.floor(Math.random() * plans.length)];
        const subscriptionDate = new Date(user.createdAt.getTime() + (Math.random() * 7 * 24 * 60 * 60 * 1000));
        const subscription = await prisma.subscription.create({ data: { userId: user.id, planId: randomPlan.id, status: Math.random() < 0.9 ? 'ACTIVE' : 'CANCELLED', startedAt: subscriptionDate, expiresAt: new Date(subscriptionDate.getTime() + (randomPlan.durationHours * 60 * 60 * 1000)), createdAt: subscriptionDate, updatedAt: subscriptionDate } });
        subscriptionCount++;
        const numPayments = Math.floor(Math.random() * 3) + 1;
        for (let p = 0; p < numPayments; p++) {
          const paymentDate = new Date(subscriptionDate.getTime() + (p * 30 * 24 * 60 * 60 * 1000));
          if (paymentDate <= new Date()) {
            await prisma.payment.create({ data: { userId: user.id, subscriptionId: subscription.id, amountCents: randomPlan.priceCents, currency: 'USD', status: Math.random() < 0.95 ? 'COMPLETED' : 'FAILED', createdAt: paymentDate } });
            paymentCount++;
          }
        }
      }
    }

    console.log(`✅ Created ${subscriptionCount} demo subscriptions`);
    console.log(`✅ Created ${paymentCount} demo payments`);

    console.log('🎉 Demo data seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) seedDemoData();

module.exports = { seedDemoData };
