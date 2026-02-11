import { PrismaClient } from '@prisma/client';
import { PLAN_DEFINITIONS, ensurePlansSeeded } from '../lib/plans';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');
  await ensurePlansSeeded();

  console.log('Creating test admin user...');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { name: 'Admin', role: 'ADMIN' },
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
    }
  });

  console.log('Creating sample subscription for admin (24H plan)...');
  const plan = await prisma.plan.findFirst({ where: { name: '24 Hour Pro' } });
  if (plan) {
    const sub = await prisma.subscription.create({
      data: {
        userId: admin.id,
        planId: plan.id,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + plan.durationHours * 3600 * 1000),
      }
    });

    await prisma.payment.create({
      data: {
        userId: admin.id,
        subscriptionId: sub.id,
        amountCents: plan.priceCents,
        status: 'SUCCEEDED',
      }
    });
  } else {
    console.warn('Plan not found; skipping subscription/payment creation');
  }

  const counts = {
    users: await prisma.user.count(),
    plans: await prisma.plan.count(),
    subscriptions: await prisma.subscription.count(),
    payments: await prisma.payment.count(),
  };

  console.log('Counts after seeding:', counts);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
