import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ensurePlansSeeded } from '../lib/plans';
import { getDefaultTemplates } from '../lib/email-templates';
import { validatePasswordStrength } from '../lib/password-policy';

const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const prisma = new PrismaClient();

const DEFAULT_SEED_ADMIN_EMAIL = 'admin@saasybase.com';
const DEFAULT_SEED_ADMIN_PASSWORD = 'password';

function canPromptForSeedInput() {
  return Boolean(input.isTTY && output.isTTY && !process.env.CI);
}

async function promptSeedAdminCredentials() {
  const defaultEmail = process.env.SEED_ADMIN_EMAIL?.trim() || DEFAULT_SEED_ADMIN_EMAIL;
  const envPassword = process.env.SEED_ADMIN_PASSWORD ?? '';

  if (!canPromptForSeedInput()) {
    return {
      email: defaultEmail,
      password: envPassword || DEFAULT_SEED_ADMIN_PASSWORD,
      source: envPassword ? 'environment' : 'default',
    };
  }

  const rl = createInterface({ input, output });

  try {
    const enteredEmail = (await rl.question(`Admin email [${defaultEmail}]: `)).trim();
    const email = enteredEmail || defaultEmail;

    if (envPassword) {
      console.log('Using SEED_ADMIN_PASSWORD from environment for the seeded admin user.');
      return {
        email,
        password: envPassword,
        source: 'environment',
      };
    }

    while (true) {
      const password = await rl.question('Admin password (min 8 chars, upper/lower/number): ');
      const validation = validatePasswordStrength(password);

      if (!validation.valid) {
        console.warn(validation.message);
        continue;
      }

      const confirmation = await rl.question('Confirm admin password: ');
      if (password !== confirmation) {
        console.warn('Passwords do not match. Try again.');
        continue;
      }

      return {
        email,
        password,
        source: 'prompt',
      };
    }
  } finally {
    rl.close();
  }
}

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

  console.log('Creating admin user...');
  const adminCredentials = await promptSeedAdminCredentials();
  const hashedPassword = await bcrypt.hash(adminCredentials.password, 12);
  await prisma.user.upsert({
    where: { email: adminCredentials.email },
    update: { 
      name: 'Admin', 
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(), // Auto-verify email
    },
    create: {
      email: adminCredentials.email,
      name: 'Admin',
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(), // Auto-verify email
    }
  });
  console.log(`Admin user ready: ${adminCredentials.email} (${adminCredentials.source})`);

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
