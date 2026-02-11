#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getSetting(key, defaultValue) {
  const s = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return s?.value ?? defaultValue;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SYNC_IN_PROD !== '1') {
    console.error('Refusing to run in production. Set ALLOW_SYNC_IN_PROD=1 to override.');
    process.exit(2);
  }

  const tokenLimitRaw = await getSetting('FREE_PLAN_TOKEN_LIMIT', '5');
  const renewalType = await getSetting('FREE_PLAN_RENEWAL_TYPE', 'one-time');
  const tokenLimit = parseInt(tokenLimitRaw, 10) || 0;
  console.log('Free plan settings:', { tokenLimit, renewalType });

  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      subscriptions: { none: { status: 'ACTIVE', expiresAt: { gt: now } } }
    },
    select: { id: true, email: true, name: true, createdAt: true, tokenBalance: true, freeTokenBalance: true }
  });

  const candidates = users.filter((u) => (u.freeTokenBalance === 0 || u.freeTokenBalance == null)).map(({ freeTokenBalance, tokenBalance, ...rest }) => rest);

  console.log(`Found ${candidates.length} free user(s) to migrate.`);
  if (candidates.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log('Sample users:');
  console.table(candidates.slice(0, 10));

  if (!execute) {
    console.log('\nDry run mode: no changes will be made. Rerun with --execute to apply updates.');
    await prisma.$disconnect();
    process.exit(0);
  }

  let updated = 0;
  for (const u of candidates) {
    const data = {};
    if (renewalType === 'unlimited') {
      data.freeTokenBalance = 0;
      data.freeTokensLastResetAt = null;
    } else if (renewalType === 'monthly') {
      data.freeTokenBalance = tokenLimit;
      data.freeTokensLastResetAt = now;
    } else {
      data.freeTokenBalance = tokenLimit;
      data.freeTokensLastResetAt = null;
    }

    try {
      await prisma.user.update({ where: { id: u.id }, data });
      updated += 1;
    } catch (err) {
      console.error('Failed to update user', u.id, err);
    }
  }

  console.log(`Updated ${updated} user(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('sync-free-tokens.cjs failed:', err);
  process.exit(1);
});
