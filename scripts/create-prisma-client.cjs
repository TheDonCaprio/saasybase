async function createPrismaClient(options = undefined) {
  const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
  const { PrismaClient } = await import('./prisma-client.mjs');

  if (databaseUrl.startsWith('file:')) {
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    return new PrismaClient({
      ...(options || {}),
      adapter,
    });
  }

  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({
    ...(options || {}),
    adapter,
  });
}

module.exports = {
  createPrismaClient,
};