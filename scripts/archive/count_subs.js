// One-off script to count subscriptions in the database using @prisma/client directly
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const total = await prisma.subscription.count();
    console.log('TOTAL_SUBSCRIPTIONS_COUNT:', total);
  } catch (err) {
    console.error('Error counting subscriptions', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
