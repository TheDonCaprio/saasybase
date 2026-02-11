// Archived: seed-more-notifs-and-tickets.js
// Purpose: Batch-creates notifications and support tickets for demo/testing.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedMoreNotifsAndTickets() {
  console.log('🌱 Seeding notifications and tickets...');
  try {
    const users = await prisma.user.findMany();
    const notifData = [];
    const ticketData = [];
    for (const u of users) {
      if (Math.random() < 0.3) {
        notifData.push({ userId: u.id, title: 'Automated demo notification', body: 'Please ignore.', createdAt: new Date() });
      }
      if (Math.random() < 0.02) {
        ticketData.push({ userId: u.id, subject: 'Demo ticket', body: 'Support message example', status: 'OPEN', createdAt: new Date() });
      }
    }
    if (notifData.length) await prisma.notification.createMany({ data: notifData });
    if (ticketData.length) await prisma.ticket.createMany({ data: ticketData });
    console.log(`✅ Created ${notifData.length} notifications and ${ticketData.length} tickets`);
  } catch (err) {
    console.error('❌ Error seeding notifs/tickets', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) seedMoreNotifsAndTickets();

module.exports = { seedMoreNotifsAndTickets };
