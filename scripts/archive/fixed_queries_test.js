const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Fixed Analytics Queries Test ===');
    
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = now;

    console.log(`Testing 30d period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log();

    // Test the fixed revenue query
    console.log('--- Revenue by day (fixed) ---');
    const revenueByDay = await prisma.$queryRaw`
      SELECT date(createdAt/1000, 'unixepoch') as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${startDate.getTime()} 
        AND createdAt < ${endDate.getTime()}
      GROUP BY date(createdAt/1000, 'unixepoch')
      ORDER BY date DESC
    `.catch(() => []);
    console.log(`Revenue results: ${revenueByDay.length} rows`);
    if (revenueByDay.length > 0) {
      console.log('Sample:', revenueByDay.slice(0, 3));
    }

    // Test the fixed users query
    console.log('\n--- Users by day (fixed) ---');
    const usersByDay = await prisma.$queryRaw`
      SELECT date(createdAt/1000, 'unixepoch') as date, COUNT(*) as users
      FROM User 
      WHERE createdAt >= ${startDate.getTime()} AND createdAt < ${endDate.getTime()}
      GROUP BY date(createdAt/1000, 'unixepoch')
      ORDER BY date DESC
    `.catch(() => []);
    console.log(`Users results: ${usersByDay.length} rows`);
    if (usersByDay.length > 0) {
      console.log('Sample:', usersByDay.slice(0, 3));
    }

    // Test with 'all' period
    console.log('\n--- All period test ---');
    const allStartDate = new Date('2020-01-01');
    const allRevenue = await prisma.$queryRaw`
      SELECT date(createdAt/1000, 'unixepoch') as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${allStartDate.getTime()} 
        AND createdAt < ${endDate.getTime()}
      GROUP BY date(createdAt/1000, 'unixepoch')
      ORDER BY date DESC
      LIMIT 5
    `.catch(() => []);
    console.log(`All revenue results: ${allRevenue.length} rows`);
    if (allRevenue.length > 0) {
      console.log('Sample:', allRevenue);
    }

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
