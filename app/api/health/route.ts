import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/prisma';
import { validateEnv, validateStripeEnv, validateClerkEnv } from '@/lib/env';

function extractBearer(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.HEALTHCHECK_TOKEN || process.env.INTERNAL_API_TOKEN || null;
  if (!expected) return false;
  const provided = extractBearer(req);
  return provided === expected;
}

export async function GET(req: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';
  const authorized = !isProd || isAuthorized(req);

  if (!authorized) {
    return NextResponse.json({ status: 'ok' });
  }

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      environment: false,
      database: false,
      stripe: false,
      clerk: false,
    },
    errors: [] as string[]
  };

  // Check environment variables
  try {
    validateEnv();
    health.checks.environment = true;
  } catch (error) {
    health.checks.environment = false;
    health.errors.push(`Environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Check database connection
  try {
    const dbHealth = await checkDatabaseConnection();
    health.checks.database = dbHealth.healthy;
    if (!dbHealth.healthy) {
      health.errors.push(`Database: ${dbHealth.error || 'Connection failed'}`);
    }
  } catch (error) {
    health.checks.database = false;
    health.errors.push(`Database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Check Stripe configuration
  try {
    validateStripeEnv();
    health.checks.stripe = true;
  } catch (error) {
    health.checks.stripe = false;
    health.errors.push(`Stripe: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Check Clerk configuration
  try {
    validateClerkEnv();
    health.checks.clerk = true;
  } catch (error) {
    health.checks.clerk = false;
    health.errors.push(`Clerk: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Overall health status
  const allHealthy = Object.values(health.checks).every(check => check);
  health.status = allHealthy ? 'healthy' : 'unhealthy';

  const statusCode = allHealthy ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}
