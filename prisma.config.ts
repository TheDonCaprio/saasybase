import { createRequire } from 'module';
import { defineConfig } from 'prisma/config';

const require = createRequire(import.meta.url);
const {
  formatSecretLoadFailures,
  loadRuntimeEnv,
} = require('./scripts/load-runtime-env.js') as {
  formatSecretLoadFailures: (result: { failed: Array<{ provider: string; message: string }> }) => string;
  loadRuntimeEnv: () => Promise<{
    enabled: boolean;
    failed: Array<{ provider: string; message: string }>;
  }>;
};

// Keep Prisma CLI behavior aligned with the rest of the app by loading the
// same .env files and optional provider-backed secrets before evaluating the
// datasource URL. Failures stay non-fatal here so local .env values can still
// work without requiring the provider CLI on every machine.
const secretLoadResult = await loadRuntimeEnv();
if (secretLoadResult.enabled && secretLoadResult.failed.length > 0) {
  console.warn(
    `Prisma config secrets bootstrap warning: ${formatSecretLoadFailures(secretLoadResult)}`
  );
}

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