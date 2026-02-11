const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Analytics API Simulation ===');
    
    const now = new Date();
    let startDate, endDate = now;
    
    // Test with 'all' period first
    startDate = new Date('2020-01-01'); // Same as analytics API
    console.log(`Period: all`);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);
    
    // Test the same chart queries as analytics API
    console.log('\n--- Revenue by day (all period) ---');
    const revenueByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${startDate.toISOString()} 
        AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 10
    `.catch((err) => {
      console.error('Revenue query error:', err);
      return [];
    });
    console.log(`Revenue results: ${revenueByDay.length} rows`);
    console.log('First 3:', revenueByDay.slice(0, 3));

    console.log('\n--- Subscriptions by day (all period) ---');
    const subscriptionsByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as subscriptions
      FROM Subscription 
      WHERE createdAt >= ${startDate.toISOString()} 
        AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 10
    `.catch((err) => {
      console.error('Subscriptions query error:', err);
      return [];
    });
    console.log(`Subscription results: ${subscriptionsByDay.length} rows`);
    console.log('First 3:', subscriptionsByDay.slice(0, 3));

    console.log('\n--- Users by day (all period) ---');
    const usersByDay = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as users
      FROM User 
      WHERE createdAt >= ${startDate.toISOString()} AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 10
    `.catch((err) => {
      console.error('Users query error:', err);
      return [];
    });
    console.log(`User results: ${usersByDay.length} rows`);
    console.log('First 3:', usersByDay.slice(0, 3));

    // Now test with 30d period
    console.log('\n\n=== 30d Period Test ===');
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);

    const revenue30d = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${startDate.toISOString()} 
        AND createdAt < ${endDate.toISOString()}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
    `.catch(() => []);
    console.log(`Revenue 30d results: ${revenue30d.length} rows`);
    if (revenue30d.length > 0) console.log('First 3:', revenue30d.slice(0, 3));

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
