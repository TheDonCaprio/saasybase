import { PrismaClient } from '@/lib/prisma-client';
import { createPrismaClient } from './create-prisma-client';

declare global {
  var prisma: PrismaClient | undefined;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const enablePrismaQueryLogs = process.env.PRISMA_QUERY_LOGS === 'true';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient({
    log: ['error'],
    errorFormat: 'minimal',
  });
} else {
  // Development: use global variable to prevent multiple instances during hot reload
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient({
      log: enablePrismaQueryLogs ? ['query', 'info', 'warn', 'error'] : ['info', 'warn', 'error'],
      errorFormat: 'pretty',
    });
  }
  prisma = globalForPrisma.prisma;
}

// Health check function
export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    console.error('Database connection failed:', error);
    return { 
      healthy: false, 
      error: error instanceof Error ? error.message : 'Unknown database error' 
    };
  }
}

// Graceful disconnect
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

export { prisma };
