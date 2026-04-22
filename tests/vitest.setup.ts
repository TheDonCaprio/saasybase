// Global Vitest setup.
//
// - Provide a dummy DATABASE_URL so Prisma Client can be imported without throwing.
//   (Tests that need Prisma should mock `lib/prisma`.)
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = 'file:./test.db';
}

if (!process.env.BETTER_AUTH_URL) {
	process.env.BETTER_AUTH_URL = 'http://localhost:3000';
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
	process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
}
