/*
  ARCHIVED: set_demo_plan_autorenew_true.js

  Reason: small dev utility to flip a plan's autoRenew to true for demo/testing.
  Archived to reduce top-level script clutter.

  To restore: copy back to pro-app/scripts/ and remove this header.
*/

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production');
    process.exit(1);
  }

  const plan = await p.plan.findFirst();
  if (!plan) {
    console.error('No plan found');
    process.exit(1);
  }

  if (plan.autoRenew) {
    console.log(`Plan ${plan.name} (${plan.id}) already has autoRenew=true`);
    await p.$disconnect();
    return;
  }

  const updated = await p.plan.update({ where: { id: plan.id }, data: { autoRenew: true } });
  console.log(`Updated plan ${updated.name} (${updated.id}) autoRenew -> ${updated.autoRenew}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
#!/usr/bin/env node
// Archived: set_demo_plan_autorenew_true.js (2025-10)
// Small helper to flip demo plan autoRenew -> true. Kept for history.

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production');
    process.exit(1);
  }

  const plan = await p.plan.findFirst();
  if (!plan) {
    console.error('No plan found');
    process.exit(1);
  }

  if (plan.autoRenew) {
    console.log(`Plan ${plan.name} (${plan.id}) already has autoRenew=true`);
    await p.$disconnect();
    return;
  }

  const updated = await p.plan.update({ where: { id: plan.id }, data: { autoRenew: true } });
  console.log(`Updated plan ${updated.name} (${updated.id}) autoRenew -> ${updated.autoRenew}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
