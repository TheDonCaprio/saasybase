// Archived: seed_user_caprio.js
// Purpose: Create a single named user and associated demo notifications, payments and tickets.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCaprio() {
  console.log('🌱 Seeding caprio user and demo data...');
  try {
    const email = 'caprio@capriofiles.com';
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: 'Caprio' } });

    // create a few notifications
    const notifications = [];
    for (let i = 0; i < 20; i++) {
      notifications.push({ userId: user.id, title: `Demo notif ${i}`, body: 'This is a demo notification', createdAt: new Date() });
    }
    await prisma.notification.createMany({ data: notifications });
    console.log('✅ Created demo notifications');

  } catch (err) {
    console.error('❌ Error seeding caprio user', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) seedCaprio();

module.exports = { seedCaprio };
