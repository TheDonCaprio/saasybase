/*
  ARCHIVED: seed_plans_direct.js

  Reason: Direct upsert of plan rows and optional stripePriceId syncing from env.
  Preserved for ops/history.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
const PLAN_DEFINITIONS = [
  {
    id: '24H',
    name: '24 Hour Pro',
    durationHours: 24,
    priceCents: 299,
    externalPriceEnv: 'PAYMENT_PRICE_24H',
    legacyStripePriceEnv: 'PRICE_24H',
    sortOrder: 0,
  },
  {
    id: '7D',
    name: '7 Day Pro',
    durationHours: 24 * 7,
    priceCents: 799,
    externalPriceEnv: 'PAYMENT_PRICE_7D',
    legacyStripePriceEnv: 'PRICE_7D',
    sortOrder: 1,
  },
  {
    id: '1M',
    name: '1 Month Pro',
    durationHours: 24 * 30,
    priceCents: 1999,
    externalPriceEnv: 'PAYMENT_PRICE_1M',
    legacyStripePriceEnv: 'PRICE_1M',
    sortOrder: 2,
  },
  {
    id: '3M',
    name: '3 Month Pro',
    durationHours: 24 * 90,
    priceCents: 4999,
    externalPriceEnv: 'PAYMENT_PRICE_3M',
    legacyStripePriceEnv: 'PRICE_3M',
    sortOrder: 3,
    description: 'Save 20%',
  },
  {
    id: '1Y',
    name: '1 Year Pro',
    durationHours: 24 * 365,
    priceCents: 14999,
    externalPriceEnv: 'PAYMENT_PRICE_1Y',
    legacyStripePriceEnv: 'PRICE_1Y',
    sortOrder: 4,
    description: 'Save 40%',
  },
];
(async () => {
  try {
    for (const plan of PLAN_DEFINITIONS) {
      await p.plan.upsert({
        where: { name: plan.name },
        update: { durationHours: plan.durationHours, priceCents: plan.priceCents, sortOrder: plan.sortOrder },
        create: { name: plan.name, durationHours: plan.durationHours, priceCents: plan.priceCents, sortOrder: plan.sortOrder }
      });
    }
    for (const def of PLAN_DEFINITIONS) {
      const priceId = process.env[def.externalPriceEnv] || (def.legacyStripePriceEnv ? process.env[def.legacyStripePriceEnv] : undefined);
      if (!priceId) continue;
      try {
        await p.plan.update({ where: { name: def.name }, data: { stripePriceId: priceId } });
      } catch (e) {/*ignore*/ }
    }
    console.log('Seeded plans and synced price ids');
  } catch (e) { console.error(e); process.exit(1); } finally { await p.$disconnect(); }
})();
