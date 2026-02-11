// Archived: smoke_activate_flow.js
// Purpose: Manual smoke test for activation flow; preserved for history. Do not run in production.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runSmoke() {
  console.log('🔬 Running smoke activation flow...');
  // This file simulates creating a user, creating a subscription, and marking it active.
  try {
    const user = await prisma.user.create({ data: { email: `smoke-${Date.now()}@example.com`, name: 'Smoke Tester' } });
    const plan = await prisma.plan.findFirst();
    if (!plan) { console.log('No plan found. Aborting.'); return; }
    const sub = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, status: 'ACTIVE', startedAt: new Date() } });
    console.log('✅ Smoke flow completed for user', user.email, 'subscription', sub.id);
  } catch (e) {
    console.error('Smoke failed', e);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) runSmoke();

module.exports = { runSmoke };
