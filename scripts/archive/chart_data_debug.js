const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = now;

    console.log('=== Analytics Chart Data Debug ===');
    console.log(`Period: 30d`);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);
    console.log();

    // Test the same queries used in analytics API
    console.log('--- Revenue by day ---');
    const revenueByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${startDate.toISOString()} 
        AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `.catch(() => []);
    console.log('Revenue by day result:', revenueByDay);
    console.log('Revenue count:', revenueByDay.length);
    console.log();

    console.log('--- Subscriptions by day ---');
    const subscriptionsByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as subscriptions
      FROM Subscription 
      WHERE createdAt >= ${startDate.toISOString()} 
        AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `.catch(() => []);
    console.log('Subscriptions by day result:', subscriptionsByDay);
    console.log('Subscriptions count:', subscriptionsByDay.length);
    console.log();

    console.log('--- Users by day ---');
    const usersByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as users
      FROM User 
      WHERE createdAt >= ${startDate.toISOString()} AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `.catch(() => []);
    console.log('Users by day result:', usersByDay);
    console.log('Users count:', usersByDay.length);
    console.log();

    // Check if we have any data at all in these tables
    console.log('--- Table counts (total) ---');
    const [paymentCount, subscriptionCount, userCount] = await Promise.all([
      prisma.payment.count().catch(() => 0),
      prisma.subscription.count().catch(() => 0),
      prisma.user.count().catch(() => 0)
    ]);
    console.log(`Total payments: ${paymentCount}`);
    console.log(`Total subscriptions: ${subscriptionCount}`);
    console.log(`Total users: ${userCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
