const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate the analytics API response structure
(async () => {
  try {
    console.log('=== Analytics API Response Simulation ===');
    
    const now = new Date();
    const period = '30d';
    let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let endDate = now;

    console.log(`Period: ${period}`);
    console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log();

    // Test the three main chart queries
    const [revenueByDay, subscriptionsByDay, usersByDay] = await Promise.all([
      // Revenue chart data
      prisma.$queryRaw`
        SELECT date(createdAt/1000, 'unixepoch') as date, COALESCE(SUM(amountCents), 0) as revenue
        FROM Payment 
        WHERE status IN ('COMPLETED', 'SUCCEEDED')
          AND createdAt >= ${startDate.getTime()} 
          AND createdAt < ${endDate.getTime()}
        GROUP BY date(createdAt/1000, 'unixepoch')
        ORDER BY date DESC
      `.catch(() => []),

      // Subscriptions chart data
      prisma.$queryRaw`
        SELECT date(createdAt/1000, 'unixepoch') as date, COUNT(*) as subscriptions
        FROM Subscription 
        WHERE createdAt >= ${startDate.getTime()} 
          AND createdAt < ${endDate.getTime()}
        GROUP BY date(createdAt/1000, 'unixepoch')
        ORDER BY date DESC
      `.catch(() => []),

      // Users chart data
      prisma.$queryRaw`
        SELECT date(createdAt/1000, 'unixepoch') as date, COUNT(*) as users
        FROM User 
        WHERE createdAt >= ${startDate.getTime()} AND createdAt < ${endDate.getTime()}
        GROUP BY date(createdAt/1000, 'unixepoch')
        ORDER BY date DESC
      `.catch(() => [])
    ]);

    console.log('Chart data results:');
    console.log(`Revenue chart: ${revenueByDay.length} data points`);
    console.log(`Subscriptions chart: ${subscriptionsByDay.length} data points`);
    console.log(`Users chart: ${usersByDay.length} data points`);
    console.log();

    if (revenueByDay.length > 0) {
      console.log('Revenue sample:', revenueByDay.slice(0, 3));
    }
    if (subscriptionsByDay.length > 0) {
      console.log('Subscriptions sample:', subscriptionsByDay.slice(0, 3));
    }
    if (usersByDay.length > 0) {
      console.log('Users sample:', usersByDay.slice(0, 3));
    }

    // Test what the frontend will receive
    console.log('\n--- Frontend chart data structure ---');
    const charts = {
      revenue: revenueByDay.map(item => ({ 
        date: item.date, 
        revenue: Number(item.revenue) / 100 
      })),
      subscriptions: subscriptionsByDay.map(item => ({ 
        date: item.date, 
        subscriptions: Number(item.subscriptions) 
      })),
      users: usersByDay.map(item => ({ 
        date: item.date, 
        users: Number(item.users) 
      }))
    };

    console.log('Charts object:', JSON.stringify(charts, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
