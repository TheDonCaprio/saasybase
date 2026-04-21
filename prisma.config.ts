import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Match the rest of the app's local-development env precedence instead of
// relying on dotenv/config, which only reads .env by default.
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env.development', override: false });
loadEnv({ path: '.env', override: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});