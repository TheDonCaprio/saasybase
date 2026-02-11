// Archived: seed-demo-full.js
// Purpose: Generate many demo users/payments/notifications/tickets for local testing.
// Moved to archive 2025-10 while preparing for deployment.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// DEV ONLY: Create 150 demo users and for each create a subscription, a few payments,
// notifications, and a support ticket to simulate a real user's data for testing.

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-demo-full in production');
    process.exit(1);
  }

  const totalUsers = 150;
  const plan = await prisma.plan.findFirst();
  if (!plan) {
    console.error('No plan found. Run prisma seed or create a Plan first.');
    process.exit(1);
  }

  console.log(`Seeding ${totalUsers} demo users with plan ${plan.name}`);
  const now = Date.now();

  for (let i = 1; i <= totalUsers; i++) {
    const idx = String(i).padStart(3, '0');
    const email = `demo+${idx}@example.com`;
    const name = `Demo User ${idx}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name, updatedAt: new Date() },
      create: {
        email,
        name,
        role: 'USER',
        createdAt: new Date(now - i * 1000)
      }
    });

    let subscription = null;
    if (i % 2 === 0) {
      const expiresAt = new Date(Date.now() + plan.durationHours * 3600 * 1000);
      subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: i % 10 === 0 ? 'CANCELLED' : 'ACTIVE',
          startedAt: new Date(Date.now() - (i * 3600 * 1000)),
          expiresAt,
          createdAt: new Date(Date.now() - i * 2000)
        }
      });
    }

    const paymentsCount = i % 6;
    for (let p = 0; p < paymentsCount; p++) {
      await prisma.payment.create({
        data: {
          userId: user.id,
          subscriptionId: subscription ? subscription.id : null,
          amountCents: plan.priceCents,
          status: p % 7 === 0 ? 'REFUNDED' : 'SUCCEEDED',
          createdAt: new Date(Date.now() - (i * 60000) - p * 60000)
        }
      });
    }

    const notifCount = (i % 3) + 1;
    for (let n = 0; n < notifCount; n++) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: `Demo notification ${n + 1}`,
          message: `Hello ${name}, this is demo notification #${n + 1}`,
          type: n % 2 === 0 ? 'GENERAL' : 'BILLING',
          read: n % 2 === 0
        }
      });
    }

    if (i % 5 === 0) {
      const ticket = await prisma.supportTicket.create({
        data: {
          userId: user.id,
          subject: `Demo support request ${idx}`,
          message: `I have a demo issue for user ${name}`,
          status: 'OPEN'
        }
      });

      await prisma.ticketReply.create({
        data: { ticketId: ticket.id, message: 'Thanks for the report — this is a demo reply.' }
      });
    }

    if (i % 25 === 0) console.log(`Seeded ${i} users...`);
  }

  const usersTotal = await prisma.user.count();
  const paymentsTotal = await prisma.payment.count();
  const notificationsTotal = await prisma.notification.count();
  const ticketsTotal = await prisma.supportTicket.count();

  console.log(`Seeding complete: users=${usersTotal} payments=${paymentsTotal} notifications=${notificationsTotal} tickets=${ticketsTotal}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
