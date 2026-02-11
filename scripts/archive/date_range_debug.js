const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Database Date Ranges ===');

    // Check date ranges for each table
    console.log('--- Payment date ranges ---');
    const paymentDates = await prisma.$queryRaw`
      SELECT 
        MIN(createdAt) as earliest, 
        MAX(createdAt) as latest,
        COUNT(*) as total
      FROM Payment
    `.catch(() => []);
    console.log('Payment dates:', paymentDates[0]);

    console.log('\n--- Subscription date ranges ---');
    const subscriptionDates = await prisma.$queryRaw`
      SELECT 
        MIN(createdAt) as earliest, 
        MAX(createdAt) as latest,
        COUNT(*) as total
      FROM Subscription
    `.catch(() => []);
    console.log('Subscription dates:', subscriptionDates[0]);

    console.log('\n--- User date ranges ---');
    const userDates = await prisma.$queryRaw`
      SELECT 
        MIN(createdAt) as earliest, 
        MAX(createdAt) as latest,
        COUNT(*) as total
      FROM User
    `.catch(() => []);
    console.log('User dates:', userDates[0]);

    // Test with a much wider date range to get some data
    console.log('\n--- Testing with 1-year range ---');
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    const revenueByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${oneYearAgo.toISOString()} 
        AND createdAt < ${now.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 10
    `.catch(() => []);
    console.log('Revenue by day (1yr range, first 10):', revenueByDay);

    const usersByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as users
      FROM User 
      WHERE createdAt >= ${oneYearAgo.toISOString()} AND createdAt < ${now.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 10
    `.catch(() => []);
    console.log('Users by day (1yr range, first 10):', usersByDay);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
