const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const plans = await p.plan.findMany();
  console.log('== PLANS ==');
  plans.forEach((pl) => console.log(JSON.stringify(pl, null, 2)));

  const totalSubs = await p.subscription.count();
  console.log('\nTotal subscriptions:', totalSubs);

  const subs = await p.subscription.findMany({
    take: 20,
    include: { plan: true, user: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n== SAMPLE SUBSCRIPTIONS ==');
  subs.forEach((s) => {
    console.log(JSON.stringify({
      id: s.id,
      userId: s.userId,
      userEmail: s.user?.email || null,
      planId: s.planId,
      planName: s.plan?.name || null,
      planAutoRenew: s.plan?.autoRenew,
      status: s.status,
      createdAt: s.createdAt
    }, null, 2));
  });

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
