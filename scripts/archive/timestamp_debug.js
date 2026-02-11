const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Database Date Format Investigation ===');

    // Check raw createdAt values
    console.log('--- Sample Payment records ---');
    const samplePayments = await prisma.$queryRaw`
      SELECT id, createdAt, status, amountCents
      FROM Payment 
      ORDER BY createdAt DESC
      LIMIT 5
    `.catch(() => []);
    console.log('Sample payments:', samplePayments);

    console.log('\n--- Sample User records ---');
    const sampleUsers = await prisma.$queryRaw`
      SELECT id, createdAt, email
      FROM User 
      ORDER BY createdAt DESC
      LIMIT 5
    `.catch(() => []);
    console.log('Sample users:', sampleUsers);

    // Convert the timestamp numbers to dates
    const timestamps = [1749609806064, 1757178085278, 1757244826416];
    console.log('\n--- Converting timestamps to dates ---');
  // Use server helper to read DB-backed format settings
  const { formatDateServer } = require('../lib/formatDate.server');

    for (const ts of timestamps) {
      const date = new Date(Number(ts));
      const formatted = await formatDateServer(date);
      console.log(`${ts} -> ${date.toISOString()} (${formatted})`);
    }

    // Try querying with the actual date format that seems to be stored
    console.log('\n--- Testing queries with converted timestamps ---');
    const oldestDate = new Date(1749413079675); // Convert to Date
    const newestDate = new Date(1757244826416);
    console.log(`Date range in DB: ${oldestDate.toISOString()} to ${newestDate.toISOString()}`);

    // Test revenue query with the actual date range
    const revenueTest = await prisma.$queryRaw`
      SELECT DATE(datetime(createdAt/1000, 'unixepoch')) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      GROUP BY DATE(datetime(createdAt/1000, 'unixepoch'))
      ORDER BY date DESC
      LIMIT 10
    `.catch((err) => {
      console.error('Revenue query error:', err.message);
      return [];
    });
    console.log('Revenue by date (with unix conversion):', revenueTest);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
