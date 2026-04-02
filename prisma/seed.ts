import { createPrismaClient } from '../scripts/create-prisma-client';
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

const prisma = createPrismaClient();

const DEFAULT_SEED_ADMIN_EMAIL = 'admin@saasybase.com';
const DEFAULT_SEED_ADMIN_PASSWORD = 'password';

type SeedUserRecord = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  role: string;
  password: string | null;
  tokenVersion: number;
  emailVerified: Date | null;
  paymentsCount: number;
  externalCustomerIds: string | null;
  tokenBalance: number;
  freeTokenBalance: number;
  freeTokensLastResetAt: Date | null;
  tokensLastResetAt: Date | null;
  createdAt: Date;
  paymentProvider: string | null;
  externalCustomerId: string | null;
};

type SeedPromptStreams = {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  close?: () => void;
};

function getSeedPromptStreams(): SeedPromptStreams | null {
  if (process.env.CI) {
    return null;
  }

  if (input.isTTY && output.isTTY) {
    return { input, output };
  }

  if (process.platform !== 'win32' && fs.existsSync('/dev/tty')) {
    try {
      const ttyInput = fs.createReadStream('/dev/tty');
      const ttyOutput = fs.createWriteStream('/dev/tty');

      return {
        input: ttyInput,
        output: ttyOutput,
        close: () => {
          ttyInput.destroy();
          ttyOutput.end();
        },
      };
    } catch {
      return null;
    }
  }

  return null;
}

function shouldSkipAdminSeed() {
  const skipAdminArg = process.argv.some((arg) => arg === '--skip-admin');

  if (skipAdminArg) {
    console.log('Skipping admin user creation because the skip-admin flag is enabled.');
    return true;
  }

  return false;
}

function getActiveAuthProvider() {
  return (
    process.env.AUTH_PROVIDER ||
    process.env.NEXT_PUBLIC_AUTH_PROVIDER ||
    'clerk'
  ).toLowerCase();
}

function getCanonicalAdminUpdate(args: {
  email: string;
  hashedPassword: string;
  name?: string | null;
  imageUrl?: string | null;
  externalCustomerId?: string | null;
  paymentProvider?: string | null;
  externalCustomerIds?: string | null;
  tokenBalance?: number;
  freeTokenBalance?: number;
  freeTokensLastResetAt?: Date | null;
  tokensLastResetAt?: Date | null;
  paymentsCount?: number;
  tokenVersion?: number;
  createdAt?: Date;
}) {
  return {
    email: args.email,
    name: args.name ?? 'Admin',
    imageUrl: args.imageUrl ?? null,
    role: 'ADMIN',
    password: args.hashedPassword,
    emailVerified: new Date(),
    externalCustomerId: args.externalCustomerId ?? null,
    paymentProvider: args.paymentProvider ?? null,
    externalCustomerIds: args.externalCustomerIds ?? null,
    tokenBalance: args.tokenBalance ?? 0,
    freeTokenBalance: args.freeTokenBalance ?? 0,
    freeTokensLastResetAt: args.freeTokensLastResetAt ?? null,
    tokensLastResetAt: args.tokensLastResetAt ?? null,
    paymentsCount: args.paymentsCount ?? 0,
    tokenVersion: args.tokenVersion ?? 0,
    ...(args.createdAt ? { createdAt: args.createdAt } : {}),
  };
}

async function reassignUserReferences(oldUserId: string, newUserId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.organization.updateMany({ where: { ownerUserId: oldUserId }, data: { ownerUserId: newUserId } });
    await tx.organizationMembership.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.organizationInvite.updateMany({ where: { invitedByUserId: oldUserId }, data: { invitedByUserId: newUserId } });
    await tx.subscription.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.payment.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.paymentAuthorization.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.featureUsageLog.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.couponRedemption.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.supportTicket.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.ticketReply.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.emailLog.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.userSetting.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.notification.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.visitLog.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.adminActionLog.updateMany({ where: { actorId: oldUserId }, data: { actorId: newUserId } });
    await tx.adminActionLog.updateMany({ where: { targetUserId: oldUserId }, data: { targetUserId: newUserId } });
    await tx.account.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.session.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
    await tx.rateLimitBucket.updateMany({ where: { actorId: oldUserId }, data: { actorId: newUserId } });
  });
}

async function ensureCanonicalClerkAdminUser(args: {
  clerkUserId: string;
  email: string;
  hashedPassword: string;
  fallbackName: string;
}) {
  const [canonicalUser, legacyUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: args.clerkUserId } }) as Promise<SeedUserRecord | null>,
    prisma.user.findUnique({ where: { email: args.email } }) as Promise<SeedUserRecord | null>,
  ]);

  const legacyEmailUser = legacyUser && legacyUser.id !== args.clerkUserId ? legacyUser : null;

  if (legacyEmailUser) {
    const mergedUser = canonicalUser
      ? {
          name: canonicalUser.name || legacyEmailUser.name || args.fallbackName,
          imageUrl: canonicalUser.imageUrl || legacyEmailUser.imageUrl,
          externalCustomerId: canonicalUser.externalCustomerId || legacyEmailUser.externalCustomerId,
          paymentProvider: canonicalUser.paymentProvider || legacyEmailUser.paymentProvider,
          externalCustomerIds: canonicalUser.externalCustomerIds || legacyEmailUser.externalCustomerIds,
          tokenBalance: Math.max(canonicalUser.tokenBalance, legacyEmailUser.tokenBalance),
          freeTokenBalance: Math.max(canonicalUser.freeTokenBalance, legacyEmailUser.freeTokenBalance),
          freeTokensLastResetAt: canonicalUser.freeTokensLastResetAt || legacyEmailUser.freeTokensLastResetAt,
          tokensLastResetAt: canonicalUser.tokensLastResetAt || legacyEmailUser.tokensLastResetAt,
          paymentsCount: Math.max(canonicalUser.paymentsCount, legacyEmailUser.paymentsCount),
          tokenVersion: Math.max(canonicalUser.tokenVersion, legacyEmailUser.tokenVersion),
          createdAt: canonicalUser.createdAt < legacyEmailUser.createdAt ? canonicalUser.createdAt : legacyEmailUser.createdAt,
        }
      : {
          name: legacyEmailUser.name || args.fallbackName,
          imageUrl: legacyEmailUser.imageUrl,
          externalCustomerId: legacyEmailUser.externalCustomerId,
          paymentProvider: legacyEmailUser.paymentProvider,
          externalCustomerIds: legacyEmailUser.externalCustomerIds,
          tokenBalance: legacyEmailUser.tokenBalance,
          freeTokenBalance: legacyEmailUser.freeTokenBalance,
          freeTokensLastResetAt: legacyEmailUser.freeTokensLastResetAt,
          tokensLastResetAt: legacyEmailUser.tokensLastResetAt,
          paymentsCount: legacyEmailUser.paymentsCount,
          tokenVersion: legacyEmailUser.tokenVersion,
          createdAt: legacyEmailUser.createdAt,
        };

    await prisma.$transaction(async (tx) => {
      if (!canonicalUser) {
        await tx.user.create({
          data: {
            id: args.clerkUserId,
            email: null,
            name: mergedUser.name,
            imageUrl: mergedUser.imageUrl ?? null,
            role: 'ADMIN',
            password: args.hashedPassword,
            emailVerified: new Date(),
            externalCustomerId: null,
            paymentProvider: mergedUser.paymentProvider ?? null,
            externalCustomerIds: mergedUser.externalCustomerIds ?? null,
            tokenBalance: mergedUser.tokenBalance,
            freeTokenBalance: mergedUser.freeTokenBalance,
            freeTokensLastResetAt: mergedUser.freeTokensLastResetAt ?? null,
            tokensLastResetAt: mergedUser.tokensLastResetAt ?? null,
            paymentsCount: mergedUser.paymentsCount,
            tokenVersion: mergedUser.tokenVersion,
            createdAt: mergedUser.createdAt,
          },
        });
      }

      await tx.organization.updateMany({ where: { ownerUserId: legacyEmailUser.id }, data: { ownerUserId: args.clerkUserId } });
      await tx.organizationMembership.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.organizationInvite.updateMany({ where: { invitedByUserId: legacyEmailUser.id }, data: { invitedByUserId: args.clerkUserId } });
      await tx.subscription.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.payment.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.paymentAuthorization.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.featureUsageLog.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.couponRedemption.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.supportTicket.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.ticketReply.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.emailLog.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.userSetting.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.notification.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.visitLog.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.adminActionLog.updateMany({ where: { actorId: legacyEmailUser.id }, data: { actorId: args.clerkUserId } });
      await tx.adminActionLog.updateMany({ where: { targetUserId: legacyEmailUser.id }, data: { targetUserId: args.clerkUserId } });
      await tx.account.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.session.updateMany({ where: { userId: legacyEmailUser.id }, data: { userId: args.clerkUserId } });
      await tx.rateLimitBucket.updateMany({ where: { actorId: legacyEmailUser.id }, data: { actorId: args.clerkUserId } });

      await tx.user.delete({ where: { id: legacyEmailUser.id } });
      await tx.user.update({
        where: { id: args.clerkUserId },
        data: getCanonicalAdminUpdate({
          email: args.email,
          hashedPassword: args.hashedPassword,
          name: mergedUser.name,
          imageUrl: mergedUser.imageUrl,
          externalCustomerId: mergedUser.externalCustomerId,
          paymentProvider: mergedUser.paymentProvider,
          externalCustomerIds: mergedUser.externalCustomerIds,
          tokenBalance: mergedUser.tokenBalance,
          freeTokenBalance: mergedUser.freeTokenBalance,
          freeTokensLastResetAt: mergedUser.freeTokensLastResetAt,
          tokensLastResetAt: mergedUser.tokensLastResetAt,
          paymentsCount: mergedUser.paymentsCount,
          tokenVersion: mergedUser.tokenVersion,
          createdAt: mergedUser.createdAt,
        }),
      });
    });

    console.log(`Aligned local admin record with Clerk user id ${args.clerkUserId}.`);
    return args.clerkUserId;
  }

  await prisma.user.upsert({
    where: { id: args.clerkUserId },
    update: getCanonicalAdminUpdate({
      email: args.email,
      hashedPassword: args.hashedPassword,
      name: canonicalUser?.name || args.fallbackName,
      imageUrl: canonicalUser?.imageUrl,
      externalCustomerId: canonicalUser?.externalCustomerId,
      paymentProvider: canonicalUser?.paymentProvider,
      externalCustomerIds: canonicalUser?.externalCustomerIds,
      tokenBalance: canonicalUser?.tokenBalance,
      freeTokenBalance: canonicalUser?.freeTokenBalance,
      freeTokensLastResetAt: canonicalUser?.freeTokensLastResetAt,
      tokensLastResetAt: canonicalUser?.tokensLastResetAt,
      paymentsCount: canonicalUser?.paymentsCount,
      tokenVersion: canonicalUser?.tokenVersion,
      createdAt: canonicalUser?.createdAt,
    }),
    create: {
      id: args.clerkUserId,
      ...getCanonicalAdminUpdate({
        email: args.email,
        hashedPassword: args.hashedPassword,
        name: args.fallbackName,
      }),
    },
  });

  return args.clerkUserId;
}

async function upsertLocalAdminUser(args: {
  email: string;
  hashedPassword: string;
  clerkUserId?: string;
}) {
  if (args.clerkUserId) {
    return ensureCanonicalClerkAdminUser({
      clerkUserId: args.clerkUserId,
      email: args.email,
      hashedPassword: args.hashedPassword,
      fallbackName: 'Admin',
    });
  }

  await prisma.user.upsert({
    where: { email: args.email },
    update: {
      name: 'Admin',
      role: 'ADMIN',
      password: args.hashedPassword,
      emailVerified: new Date(),
    },
    create: {
      email: args.email,
      name: 'Admin',
      role: 'ADMIN',
      password: args.hashedPassword,
      emailVerified: new Date(),
    }
  });

  return args.email;
}

async function promptSeedAdminCredentials() {
  const defaultEmail = process.env.SEED_ADMIN_EMAIL?.trim() || DEFAULT_SEED_ADMIN_EMAIL;
  const envPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  const promptStreams = getSeedPromptStreams();

  if (!promptStreams) {
    console.log(
      'Seed cannot access an interactive terminal; using SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD if provided, otherwise falling back to the default admin credentials.'
    );
    return {
      email: defaultEmail,
      password: envPassword || DEFAULT_SEED_ADMIN_PASSWORD,
      source: envPassword ? 'environment' : 'default',
    };
  }

  const rl = createInterface(promptStreams);

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
    promptStreams.close?.();
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

  if (shouldSkipAdminSeed()) {
    console.log('Admin user creation skipped for this seed run.');
  } else {
    console.log('Creating admin user...');
    const adminCredentials = await promptSeedAdminCredentials();
    const hashedPassword = await bcrypt.hash(adminCredentials.password, 12);
    let canonicalAdminId: string | null = null;

    const activeAuthProvider = getActiveAuthProvider();
    const isClerkEnabled = activeAuthProvider === 'clerk';
    if (isClerkEnabled && process.env.CLERK_SECRET_KEY) {
      console.log('Syncing admin user to Clerk...');
      try {
        const { createClerkClient } = await import('@clerk/nextjs/server');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const existingClerkUsers = await clerk.users.getUserList({ emailAddress: [adminCredentials.email] });

        if (existingClerkUsers.totalCount === 0) {
          const createdClerkUser = await clerk.users.createUser({
            emailAddress: [adminCredentials.email],
            password: adminCredentials.password,
            firstName: 'Admin',
            skipPasswordChecks: true,
            publicMetadata: { role: 'ADMIN' }
          });
          canonicalAdminId = createdClerkUser.id;
          console.log(`Successfully synced ${adminCredentials.email} to Clerk.`);
        } else {
          canonicalAdminId = existingClerkUsers.data[0]?.id ?? null;
          console.log(`Admin ${adminCredentials.email} already exists in Clerk.`);
        }
      } catch (err) {
        console.warn('Failed to sync admin user to Clerk:', err);
      }
    }

    await upsertLocalAdminUser({
      email: adminCredentials.email,
      hashedPassword,
      clerkUserId: canonicalAdminId ?? undefined,
    });

    console.log(`Admin user ready: ${adminCredentials.email} (${adminCredentials.source})`);
  }

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
