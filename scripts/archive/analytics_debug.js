const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const now = new Date();
    const periods = { '1d': 1, '2d': 2, '7d': 7, '30d': 30, '90d': 90 };

    for (const [label, days] of Object.entries(periods)) {
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const end = now;
      const res = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM VisitLog
        WHERE createdAt >= ${start.toISOString()} AND createdAt < ${end.toISOString()}`
        .catch(() => [{ count: 0 }]);

      console.log(`${label} -> start=${start.toISOString()} end=${end.toISOString()} count=${Number(res[0]?.count || 0)}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('script error', err);
    process.exit(1);
  }
})();
