#!/usr/bin/env node

const { inferPrismaProvider, readCurrentSchemaProvider } = require('./prisma-provider-utils');

function main() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const inferredProvider = inferPrismaProvider(databaseUrl);
  const currentSchemaProvider = readCurrentSchemaProvider();

  console.log('Prisma provider diagnostics');
  console.log(`- DATABASE_URL present: ${databaseUrl ? 'yes' : 'no'}`);
  console.log(`- Inferred provider: ${inferredProvider || 'unknown'}`);
  console.log(`- schema.prisma provider: ${currentSchemaProvider || 'unknown'}`);

  if (inferredProvider && currentSchemaProvider && inferredProvider !== currentSchemaProvider) {
    console.log('- Status: mismatch detected; the runtime can still reconcile schema/provider state before wrapped Prisma commands run.');
    return;
  }

  if (!inferredProvider) {
    console.log('- Status: unable to infer provider from DATABASE_URL.');
    return;
  }

  console.log('- Status: providers are aligned.');
}

main();