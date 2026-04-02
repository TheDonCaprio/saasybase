import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma-client';

type PrismaClientConstructorOptions = NonNullable<ConstructorParameters<typeof PrismaClient>[0]>;
type PrismaClientOptions = Omit<PrismaClientConstructorOptions, 'adapter' | 'accelerateUrl'>;

export function createPrismaClient(options?: PrismaClientOptions) {
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
  const adapter = databaseUrl.startsWith('file:')
    ? new PrismaBetterSqlite3({ url: databaseUrl })
    : new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({
    ...options,
    adapter,
  });
}