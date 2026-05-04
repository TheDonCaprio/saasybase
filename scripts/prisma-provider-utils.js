const fs = require('fs');
const path = require('path');

const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
const generatedClientPath = path.join(process.cwd(), 'generated', 'prisma', 'client.ts');

function inferPrismaProvider(databaseUrl) {
  if (!databaseUrl) return null;
  if (databaseUrl.startsWith('file:')) return 'sqlite';
  if (/^(postgres|postgresql|prisma\+postgres):\/\//i.test(databaseUrl)) return 'postgresql';
  return null;
}

function readCurrentSchemaProvider() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const match = /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*")([^"]+)(")/.exec(schema);
  return match ? match[2] : null;
}

function syncPrismaSchemaProvider(databaseUrl) {
  const provider = inferPrismaProvider(databaseUrl);
  if (!provider) {
    return { changed: false, provider: null, reason: 'unsupported-database-url' };
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const nextSchema = schema.replace(
    /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*")([^"]+)(")/,
    `$1${provider}$3`,
  );

  const changed = nextSchema !== schema;
  if (changed) {
    fs.writeFileSync(schemaPath, nextSchema, 'utf8');
  }

  return { changed, provider, reason: changed ? 'updated' : 'unchanged' };
}

function hasGeneratedPrismaClient() {
  return fs.existsSync(generatedClientPath);
}

module.exports = {
  hasGeneratedPrismaClient,
  inferPrismaProvider,
  readCurrentSchemaProvider,
  syncPrismaSchemaProvider,
};