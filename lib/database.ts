import { PrismaClient } from '@prisma/client';
import { validateEnv } from './env';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  // Validate environment in production
  validateEnv();
  prisma = new PrismaClient({
    log: ['error'],
    errorFormat: 'minimal',
  });
} else {
  // Development: use global variable to prevent multiple instances during hot reload
  if (!global.prisma) {
    try {
      validateEnv();
    } catch (error) {
      console.warn('Environment validation failed in development:', error);
      console.warn('Some features may not work properly without proper environment setup');
    }
    
    global.prisma = new PrismaClient({
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
