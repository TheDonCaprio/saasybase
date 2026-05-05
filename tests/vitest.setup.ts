// Global Vitest setup.
//
// - Provide a dummy Postgres DATABASE_URL so Prisma Client can be imported
//   without adapter/provider mismatches.
//   (Tests that need Prisma should mock `lib/prisma`.)
if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/saasybase_test';
}

if (!process.env.BETTER_AUTH_URL) {
	process.env.BETTER_AUTH_URL = 'http://localhost:3000';
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
	process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
}

process.env.DISABLE_DB_LOG_PERSISTENCE = 'true';
