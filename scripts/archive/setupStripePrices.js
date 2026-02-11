/*
  ARCHIVED: setupStripePrices.js

  Reason: ops helper to create Stripe Products & Prices for each plan and
  update `.env.local` with the generated price IDs. Requires STRIPE_SECRET_KEY.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

#!/usr/bin / env node
// Creates Stripe Products & Prices for each plan if missing, updates .env.local, and syncs DB.
// Safe to re-run: skips creation if env already has a concrete price id.

const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

const PLAN_DEFINITIONS = [
  {
    id: '24H',
    name: '24 Hour Pro',
    durationHours: 24,
    priceCents: 299,
    externalPriceEnv: 'PAYMENT_PRICE_24H',
    legacyStripePriceEnv: 'PRICE_24H',
  },
  {
    id: '7D',
    name: '7 Day Pro',
    durationHours: 24 * 7,
    priceCents: 799,
    externalPriceEnv: 'PAYMENT_PRICE_7D',
    legacyStripePriceEnv: 'PRICE_7D',
  },
  {
    id: '1M',
    name: '1 Month Pro',
    durationHours: 24 * 30,
    priceCents: 1999,
    externalPriceEnv: 'PAYMENT_PRICE_1M',
    legacyStripePriceEnv: 'PRICE_1M',
  },
  {
    id: '3M',
    name: '3 Month Pro',
    durationHours: 24 * 90,
    priceCents: 4999,
    externalPriceEnv: 'PAYMENT_PRICE_3M',
    legacyStripePriceEnv: 'PRICE_3M',
  },
  {
    id: '1Y',
    name: '1 Year Pro',
    durationHours: 24 * 365,
    priceCents: 14999,
    externalPriceEnv: 'PAYMENT_PRICE_1Y',
    legacyStripePriceEnv: 'PRICE_1Y',
  },
];

function resolvePlanPriceId(def) {
  if (process.env[def.externalPriceEnv]) {
    return { priceId: process.env[def.externalPriceEnv], envKey: def.externalPriceEnv, isLegacy: false };
  }
  if (def.legacyStripePriceEnv && process.env[def.legacyStripePriceEnv]) {
    return { priceId: process.env[def.legacyStripePriceEnv], envKey: def.legacyStripePriceEnv, isLegacy: true };
  }
  return { priceId: undefined, envKey: undefined, isLegacy: false };
}

async function findOrCreateProduct(stripe, name) {
  try {
    if (stripe.products && stripe.products.search) {
      const res = await stripe.products.search({ query: `name:'${name.replace(/'/g, "\\'")}'` });
      if (res.data.length) return res.data[0];
    }
  } catch (_) { }
  const list = await stripe.products.list({ limit: 100, active: true });
  const existing = list.data.find(p => p.name === name);
  if (existing) return existing;
  return stripe.products.create({ name });
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY in .env.local');
    process.exit(1);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split(/\r?\n/);
  const updates = {};

  console.log('Ensuring plans exist in database...');
  for (const def of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { name: def.name },
      update: { durationHours: def.durationHours, priceCents: def.priceCents },
      create: { name: def.name, durationHours: def.durationHours, priceCents: def.priceCents }
    });
  }

  for (const def of PLAN_DEFINITIONS) {
    const { priceId: current, envKey, isLegacy } = resolvePlanPriceId(def);
    if (current && current.startsWith('price_') && current.length > 'price_'.length + 4 && !current.includes('24h')) {
      console.log(`Skipping ${def.id}: existing price id ${current} (env: ${envKey || def.externalPriceEnv}${isLegacy ? ' - legacy' : ''})`);
      continue;
    }
    console.log(`Creating price for ${def.name}...`);
    const product = await findOrCreateProduct(stripe, def.name);
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: def.priceCents,
      product: product.id,
      nickname: def.name,
      metadata: { planId: def.id, durationHours: String(def.durationHours) }
    });
    updates[def.externalPriceEnv] = price.id;
  }

  if (Object.keys(updates).length === 0) {
    console.log('No new prices created.');
  } else {
    const existingKeys = new Set(lines.map(l => l.split('=')[0].trim()));
    for (const [k, v] of Object.entries(updates)) {
      let replaced = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(k + '=')) {
          lines[i] = `${k}="${v}"`;
          replaced = true;
          break;
        }
      }
      if (!replaced) lines.push(`${k}="${v}"`);
      process.env[k] = v; // make available immediately
    }
    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    console.log('Updated .env.local with new price IDs:', updates);
  }

  console.log('Syncing plan stripePriceId fields in DB...');
  for (const def of PLAN_DEFINITIONS) {
    const { priceId, envKey, isLegacy } = resolvePlanPriceId(def);
    if (!priceId) continue;
    if (isLegacy) {
      console.warn(`Warning: plan ${def.id} is still using legacy env var ${envKey}. Consider renaming to ${def.externalPriceEnv}.`);
    }
    await prisma.plan.update({ where: { name: def.name }, data: { stripePriceId: priceId } });
  }

  const summary = await prisma.plan.findMany({ select: { name: true, stripePriceId: true } });
  console.log('Plan mapping summary:', summary);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
