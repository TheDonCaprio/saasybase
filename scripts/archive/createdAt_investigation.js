const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('=== CreatedAt Field Investigation ===');
    
    // Check the schema
    console.log('--- Table schema ---');
    const schema = await prisma.$queryRaw`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='Payment'
    `.catch(() => []);
    console.log('Payment table schema:', schema);

    // Check actual values and their types
    console.log('\n--- Sample createdAt values ---');
    const samples = await prisma.$queryRaw`
      SELECT 
        createdAt,
        typeof(createdAt) as datatype,
        length(createdAt) as length
      FROM Payment 
      ORDER BY createdAt DESC
      LIMIT 5
    `.catch((err) => {
      console.error('Sample query error:', err.message);
      return [];
    });
    console.log('Sample values:', samples);

    // Try treating as text and converting
    console.log('\n--- Converting text to date ---');
    const textConversion = await prisma.$queryRaw`
      SELECT 
        createdAt,
        date(createdAt) as converted_date,
        strftime('%Y-%m-%d', createdAt) as strftime_date,
        substr(createdAt, 1, 10) as date_part
      FROM Payment 
      ORDER BY createdAt DESC
      LIMIT 3
    `.catch((err) => {
      console.error('Conversion error:', err.message);
      return [];
    });
    console.log('Text conversion attempts:', textConversion);

    // Try using substr to extract date part
    console.log('\n--- Using substr for date grouping ---');
    const substrMethod = await prisma.$queryRaw`
      SELECT 
        substr(createdAt, 1, 10) as date,
        COUNT(*) as count,
        SUM(amountCents) as revenue
      FROM Payment 
      WHERE status IN ('COMPLETED', 'SUCCEEDED')
      GROUP BY substr(createdAt, 1, 10)
      ORDER BY date DESC
      LIMIT 10
    `.catch((err) => {
      console.error('Substr method error:', err.message);
      return [];
    });
    console.log('Substr method results:', substrMethod);

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
