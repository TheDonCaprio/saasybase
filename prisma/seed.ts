import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ensurePlansSeeded } from '../lib/plans';
import { getDefaultTemplates } from '../lib/email-templates';

const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');
  await ensurePlansSeeded();

  console.log('Seeding email templates...');
  const defaultTemplates = getDefaultTemplates();
  for (const template of defaultTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.name,
        description: template.description,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        variables: template.variables,
        active: template.active,
      },
      create: {
        key: template.key,
        name: template.name,
        description: template.description,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        variables: template.variables,
        active: template.active,
      },
    });
  }
  console.log(`Email templates seeded: ${defaultTemplates.length}`);

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

  const counts = {
    users: await prisma.user.count(),
    plans: await prisma.plan.count(),
    emailTemplates: await prisma.emailTemplate.count(),
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
