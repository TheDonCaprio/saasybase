#!/usr/bin/env node
const { createPrismaClient } = require('./create-prisma-client.cjs');
let prisma;

async function getSettingOrDefault(key, defaultValue) {
  const s = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return s?.value ?? defaultValue;
}

async function getFreePlanSettings() {
  const tokenLimitRaw = await getSettingOrDefault('FREE_PLAN_TOKEN_LIMIT', '5');
  const renewalType = await getSettingOrDefault('FREE_PLAN_RENEWAL_TYPE', 'one-time');
  const tokenNameRaw = await getSettingOrDefault('FREE_PLAN_TOKEN_NAME', '');
  const tokenLimit = parseInt(tokenLimitRaw, 10) || 0;
  const tokenName = tokenNameRaw && tokenNameRaw.trim() ? tokenNameRaw.trim() : await getSettingOrDefault('DEFAULT_TOKEN_LABEL', 'tokens');
  return { tokenLimit, renewalType, tokenName };
}

async function main() {
  prisma = await createPrismaClient();
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SYNC_IN_PROD !== '1') {
    console.error('Refusing to run in production. Set ALLOW_SYNC_IN_PROD=1 to override.');
    process.exit(2);
  }

  const freePlan = await getFreePlanSettings();
  console.log('Free plan settings:', freePlan);

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      subscriptions: { none: { status: 'ACTIVE', expiresAt: { gt: now } } }
    },
    select: { id: true, email: true, name: true, createdAt: true, tokenBalance: true }
  });

  const candidates = users.filter((u) => u.tokenBalance === null);

  console.log(`Found ${candidates.length} free user(s) with null tokenBalance.`);
  if (candidates.length === 0) {
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
    if (freePlan.renewalType === 'unlimited') {
      // leave null
      data.tokensLastResetAt = null;
      // tokenBalance stays null
    } else if (freePlan.renewalType === 'monthly') {
      data.tokenBalance = freePlan.tokenLimit;
      data.tokensLastResetAt = now;
    } else {
      data.tokenBalance = freePlan.tokenLimit;
      data.tokensLastResetAt = null;
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

main().catch((e) => {
  console.error(e);
  if (prisma) {
    prisma.$disconnect().then(() => process.exit(1));
    return;
  }
  process.exit(1);
});
