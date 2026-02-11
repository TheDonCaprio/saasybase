const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Basic Query Tests ===');
    
    // Test basic queries without date filters
    console.log('--- Revenue query (no date filter) ---');
    const allRevenue = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COALESCE(SUM(amountCents), 0) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 5
    `.catch((err) => {
      console.error('Query error:', err);
      return [];
    });
    console.log('Revenue (no filter):', allRevenue);

    console.log('\n--- Users query (no date filter) ---');
    const allUsers = await prisma.$queryRaw`
      SELECT DATE(createdAt) as date, COUNT(*) as users
      FROM User 
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 5
    `.catch((err) => {
      console.error('Query error:', err);
      return [];
    });
    console.log('Users (no filter):', allUsers);

    // Test simpler query to check date handling
    console.log('\n--- Simple date test ---');
    const paymentDates = await prisma.$queryRaw`
      SELECT createdAt, status, amountCents
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      ORDER BY createdAt DESC
      LIMIT 3
    `.catch((err) => {
      console.error('Query error:', err);
      return [];
    });
    console.log('Recent payments:', paymentDates);

    // Test a simple date comparison
    const testDate = '2025-08-01T00:00:00.000Z';
    console.log(`\n--- Testing date comparison (after ${testDate}) ---`);
    const paymentsAfterDate = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= ${testDate}
    `.catch((err) => {
      console.error('Query error:', err);
      return [];
    });
    console.log('Payments after Aug 1:', paymentsAfterDate);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
