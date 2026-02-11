// Count subscriptions with plan.autoRenew = true and group by status
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const totalAll = await prisma.subscription.count();
    const totalAutoRenew = await prisma.subscription.count({ where: { plan: { autoRenew: true } } });
    const byStatus = await prisma.subscription.groupBy({
      by: ['status'],
      where: { plan: { autoRenew: true } },
      _count: { status: true }
    });

    console.log('TOTAL_ALL:', totalAll);
    console.log('TOTAL_AUTO_RENEW:', totalAutoRenew);
    console.log('BY_STATUS (autoRenew=true):');
    byStatus.forEach(row => console.log(`  ${row.status}: ${row._count.status}`));
  } catch (err) {
    console.error('Error', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
