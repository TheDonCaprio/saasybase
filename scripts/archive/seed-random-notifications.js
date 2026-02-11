// Archived: seed-random-notifications.js
// Purpose: Create a small number of random notifications for local testing.
// Note: This is an archived dev helper. Do not run in production.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedRandomNotifications(count = 10) {
  try {
    const users = await prisma.user.findMany();
    if (!users.length) { console.log('No users found.'); return; }
    const data = [];
    for (let i = 0; i < count; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      data.push({ userId: user.id, title: `Random ${i}`, body: 'Demo random notification', createdAt: new Date() });
    }
    await prisma.notification.createMany({ data });
    console.log(`✅ Created ${data.length} random notifications`);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) seedRandomNotifications();

module.exports = { seedRandomNotifications };
// Archived: seed-random-notifications.js (2025-10)
