// Archived: seed-demo-users.js
// Purpose: Create many demo users for local testing. Preserved for history. Do not run in production.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedDemoUsers() {
  console.log('🌱 Seeding demo users...');
  try {
    const toCreate = 70;
    for (let i = 0; i < toCreate; i++) {
      const email = `demouser${i}@example.com`;
      await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: `Demo User ${i}` } });
    }
    console.log(`✅ Ensured ${toCreate} demo users exist`);
  } catch (err) {
    console.error('❌ Error creating demo users', err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) seedDemoUsers();

module.exports = { seedDemoUsers };
