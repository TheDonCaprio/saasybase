const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== Database Type and Date Function Debug ===');
    
    // Check what database we're using
    console.log('--- Database info ---');
    const dbInfo = await prisma.$queryRaw`SELECT sqlite_version()`.catch(() => null);
    console.log('SQLite version:', dbInfo);

    // Test different date extraction methods
    console.log('\n--- Date extraction tests ---');
    
    // Method 1: strftime
    const method1 = await prisma.$queryRaw`
      SELECT strftime('%Y-%m-%d', createdAt) as date, COUNT(*) as count
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      GROUP BY strftime('%Y-%m-%d', createdAt)
      ORDER BY date DESC
      LIMIT 5
    `.catch((err) => {
      console.error('Method 1 error:', err.message);
      return [];
    });
    console.log('Method 1 (strftime):', method1);

    // Method 2: date() function
    const method2 = await prisma.$queryRaw`
      SELECT date(createdAt) as date, COUNT(*) as count
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      GROUP BY date(createdAt)
      ORDER BY date DESC
      LIMIT 5
    `.catch((err) => {
      console.error('Method 2 error:', err.message);
      return [];
    });
    console.log('Method 2 (date):', method2);

    // Test date comparison with string format
    console.log('\n--- Date comparison test ---');
    const comparisonTest = await prisma.$queryRaw`
      SELECT COUNT(*) as count, MIN(createdAt) as earliest, MAX(createdAt) as latest
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
        AND createdAt >= '2025-08-01'
    `.catch((err) => {
      console.error('Comparison error:', err.message);
      return [];
    });
    console.log('Date comparison (>= 2025-08-01):', comparisonTest);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
