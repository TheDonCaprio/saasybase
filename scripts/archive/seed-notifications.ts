// Archived: seed-notifications.ts
// Purpose: Seed a small set of named notifications for first user. Archived for deployment cleanup.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function seedNotifications() {
  const user = await prisma.user.findFirst();
  if (!user) { console.log('No users found.'); return; }
  const templates = [
    { title: 'Welcome', body: 'Welcome to our app!' },
    { title: 'Trial Ending', body: 'Your trial ends soon.' },
    { title: 'Payment Failed', body: 'Your last payment failed.' },
  ];
  for (const t of templates) {
    await prisma.notification.create({ data: { userId: user.id, title: t.title, body: t.body } });
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  seedNotifications().catch(e => { console.error(e); process.exit(1); });
}
