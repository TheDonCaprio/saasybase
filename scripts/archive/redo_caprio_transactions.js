const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function run() {
  const email = 'caprio@capriofiles.com';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`User ${email} not found.`);
    await prisma.$disconnect();
    return;
  }
  console.log(`Found user ${email} (id=${user.id}).`);

  // Load existing plans or create a few sample plans
  let plans = await prisma.plan.findMany();
  if (plans.length === 0) {
    console.log('No plans found — creating sample plans.');
    const sample = [
      { name: 'Starter', priceCents: 999, durationHours: 24 * 30 },
      { name: 'Pro', priceCents: 2999, durationHours: 24 * 30 },
      { name: 'Business', priceCents: 7999, durationHours: 24 * 30 },
      { name: 'Enterprise', priceCents: 19999, durationHours: 24 * 30 }
    ];
    plans = [];
    for (const p of sample) {
      const created = await prisma.plan.create({ data: { name: p.name, priceCents: p.priceCents, durationHours: p.durationHours, description: `${p.name} plan` } });
      plans.push(created);
    }
  }

  // Delete existing payments for the user
  console.log('Deleting existing payments for user...');
  await prisma.payment.deleteMany({ where: { userId: user.id } });

  // Optionally, create some subscriptions for the user to attach to payments
  console.log('Creating sample subscriptions...');
  const subs = [];
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const plan = plans[i % plans.length];
    const createdAt = new Date(now - randomInt(0, 720) * 24 * 60 * 60 * 1000 - randomInt(0, 86400) * 1000);
    const expiresAt = new Date(createdAt.getTime() + plan.durationHours * 60 * 60 * 1000);
    const status = i % 4 === 0 ? 'ACTIVE' : i % 4 === 1 ? 'CANCELLED' : i % 4 === 2 ? 'PENDING' : 'ACTIVE';
    const sub = await prisma.subscription.create({ data: { userId: user.id, planId: plan.id, status, startedAt: createdAt, expiresAt } });
    subs.push({ id: sub.id, plan });
  }

  // Create 150 payments distributed over last ~2 years with varied plan associations
  console.log('Generating 150 payments...');
  const payments = [];
  for (let i = 0; i < 150; i++) {
    const daysBack = randomInt(0, 720); // up to 2 years
    const secondsBack = randomInt(0, 86400);
    const createdAt = new Date(now - daysBack * 24 * 60 * 60 * 1000 - secondsBack * 1000);

    // Randomly pick a subscription (70% chance) or null
    const useSub = Math.random() < 0.7;
    let subscriptionId = null;
    let planName = null;
    let amountCents = 0;
    if (useSub && subs.length > 0) {
      const s = subs[randomInt(0, subs.length - 1)];
      subscriptionId = s.id;
      planName = s.plan.name;
      // vary price a bit
      amountCents = Math.max(199, s.plan.priceCents + (randomInt(-2, 3) * 100));
    } else {
      const p = plans[randomInt(0, plans.length - 1)];
      planName = p.name;
      amountCents = Math.max(199, p.priceCents + (randomInt(-3, 4) * 100));
    }

    payments.push({
      userId: user.id,
      subscriptionId,
      amountCents,
      currency: 'usd',
      stripePaymentIntentId: null,
      stripeCheckoutSessionId: null,
      status: 'SUCCEEDED',
      createdAt
    });
  }

  // Insert payments in chunks
  for (let i = 0; i < payments.length; i += 50) {
    const chunk = payments.slice(i, i + 50);
    await prisma.payment.createMany({ data: chunk });
  }

  const [pCount, subsCount] = await Promise.all([
    prisma.payment.count({ where: { userId: user.id } }),
    prisma.subscription.count({ where: { userId: user.id } })
  ]);

  console.log(`Done. Totals for ${email} -> payments=${pCount}, subscriptions=${subsCount}`);
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error('Error', e);
  await prisma.$disconnect();
  process.exit(1);
});
