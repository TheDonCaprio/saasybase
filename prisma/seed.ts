import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ensurePlansSeeded } from '../lib/plans';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');
  await ensurePlansSeeded();

  console.log('Creating test admin user...');
  const hashedPassword = await bcrypt.hash('password', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@saasybase.com' },
    update: { 
      name: 'Admin', 
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(), // Auto-verify email
    },
    create: {
      email: 'admin@saasybase.com',
      name: 'Admin',
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(), // Auto-verify email
    }
  });

  console.log('Attempting to sync plans with payment providers...');
  try {
    const { syncPlanExternalPriceIds } = await import('../lib/plans');
    const { syncPlansToProviders } = await import('../lib/payment/catalog-sync-service');
    
    await syncPlanExternalPriceIds();
    console.log('Plan external price IDs synced from environment.');
    
    await syncPlansToProviders();
    console.log('Plans synced with active payment providers.');
  } catch (err) {
    console.warn('Failed to sync plans with providers:', err);
  }

  console.log('Creating sample subscription for admin (Monthly Pro plan)...');
  const plan = await prisma.plan.findFirst({ where: { name: 'Monthly Pro' } });
  if (plan) {
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: admin.id, planId: plan.id, status: 'ACTIVE' }
    });

    if (!existingSub) {
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
      console.log('Sample subscription created.');
    } else {
      console.log('Sample subscription already exists.');
    }
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
