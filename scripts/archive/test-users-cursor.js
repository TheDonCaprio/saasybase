const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const argv = require('minimist')(process.argv.slice(2));
  const limit = parseInt(argv.limit || '10');
  const cursor = argv.cursor || null;
  const where = {};

  console.log('Testing users cursor query', { limit, cursor });

  if (cursor) {
    const cursorRow = await prisma.user.findUnique({ where: { id: cursor }, select: { id: true, createdAt: true } });
    if (!cursorRow) {
      console.log('Cursor row not found, falling back to offset');
    } else {
      const users = await prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        cursor: { id: cursor },
        skip: 1,
        take: limit,
        select: { id: true, email: true, createdAt: true }
      });
      console.log('Fetched (cursor) count:', users.length);
      console.log('First 3 ids:', users.slice(0,3).map(u=>u.id));
      console.log('Last id:', users[users.length-1]?.id);
      await prisma.$disconnect();
      return;
    }
  }

  // offset fallback
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, email: true, createdAt: true }
  });
  console.log('Fetched (offset) count:', users.length);
  console.log('First 3 ids:', users.slice(0,3).map(u=>u.id));
  console.log('Last id:', users[users.length-1]?.id);
  await prisma.$disconnect();
}

run().catch(e=>{
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
