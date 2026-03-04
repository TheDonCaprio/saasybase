// Global Vitest setup.
//
// - Provide a dummy DATABASE_URL so Prisma Client can be imported without throwing.
//   (Tests that need Prisma should mock `lib/prisma`.)
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = 'file:./test.db';
}
