import { PrismaClient } from '@/lib/prisma-client';
import { createPrismaClient } from './create-prisma-client';
import { validateEnv } from './env';
import { Logger } from './logger';

declare global {
  var prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  // Validate environment in production
  validateEnv();
  prisma = createPrismaClient({
    log: ['error'],
    errorFormat: 'minimal',
  });
} else {
  // Development: use global variable to prevent multiple instances during hot reload
  if (!global.prisma) {
    try {
      validateEnv();
    } catch (error) {
      Logger.warn('Environment validation failed in development', error);
      Logger.warn('Some features may not work properly without proper environment setup');
    }
    
    global.prisma = createPrismaClient({
      log: ['query', 'info', 'warn', 'error'],
      errorFormat: 'pretty',
    });
  }
  prisma = global.prisma;
}

// Health check function
export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    Logger.error('Database connection failed', error);
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
