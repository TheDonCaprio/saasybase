#!/usr/bin/env ts-node
import { prisma } from '../lib/prisma';
import { getFreePlanSettings } from '../lib/settings';

/**
 * Sync existing free (non-paid) users to the new free-token system.
 *
 * Usage:
 *  - Dry-run (default): `ts-node pro-app/scripts/sync-free-tokens.ts`
 *  - Execute: `ts-node pro-app/scripts/sync-free-tokens.ts --execute`
 *
 * Safety:
 *  - Refuses to run in production unless ALLOW_SYNC_IN_PROD=1 is set.
 */

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SYNC_IN_PROD !== '1') {
    console.error('Refusing to run in production. Set ALLOW_SYNC_IN_PROD=1 to override.');
    process.exit(2);
  }

  const freePlan = await getFreePlanSettings();
  console.log('Free plan settings:', freePlan);

  // Find free users: role=USER and no active subscriptions, and tokenBalance is null
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      subscriptions: { none: { status: 'ACTIVE', expiresAt: { gt: now } } }
    },
    select: { id: true, email: true, name: true, createdAt: true, tokenBalance: true, freeTokenBalance: true }
  });

  // Candidates are those who haven't been migrated to the separate free-token bucket
  const candidates = users
    .filter((u) => {
      const free = (u as unknown as { freeTokenBalance?: number }).freeTokenBalance;
      return free === 0 || free == null;
    })
    .map((u) => {
      // Return a small preview object for the dry-run output
      const { id, email, name, createdAt, tokenBalance } = u as any;
      return { id, email, name, createdAt, tokenBalance };
    });

  console.log(`Found ${candidates.length} free user(s) with null tokenBalance.`);
  if (candidates.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  console.log('Sample users:');
  console.table(candidates.slice(0, 10));

  if (!execute) {
    console.log('\nDry run mode: no changes will be made. Rerun with --execute to apply updates.');
    process.exit(0);
  }

  // Apply updates per-user so we can log progress
  let updated = 0;
  for (const u of candidates) {
    const data: any = {};

      if (freePlan.renewalType === 'unlimited') {
      // Unlimited: set freeTokenBalance to 0 (UI/logic uses renewal type to interpret unlimited)
      data.freeTokenBalance = 0;
      data.freeTokensLastResetAt = { set: null };
    } else if (freePlan.renewalType === 'monthly') {
      data.freeTokenBalance = freePlan.tokenLimit;
      data.freeTokensLastResetAt = now;
    } else {
      // one-time
      data.freeTokenBalance = freePlan.tokenLimit;
      data.freeTokensLastResetAt = { set: null };
    }

    try {
      await prisma.user.update({ where: { id: u.id }, data });
      updated += 1;
    } catch (err) {
      console.error('Failed to update user', u.id, err);
    }
  }

  console.log(`Updated ${updated} user(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('sync-free-tokens failed:', err);
    process.exit(1);
  });
