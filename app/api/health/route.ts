import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/lib/prisma';
import { AuthProviderFactory } from '@/lib/auth-provider/factory';
import { AUTH_PROVIDER_REGISTRY } from '@/lib/auth-provider/registry';
import { PaymentProviderFactory } from '@/lib/payment/factory';
import { PAYMENT_PROVIDER_REGISTRY } from '@/lib/payment/registry';

type ProviderHealth = {
  active: string;
  available: string[];
  configured: string[];
};

type HealthReport = {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: {
    environment: boolean;
    database: boolean;
    auth: boolean;
    payments: boolean;
  };
  providers: {
    auth: ProviderHealth;
    payments: ProviderHealth;
  };
  errors: string[];
};

function extractBearer(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.HEALTHCHECK_TOKEN || null;
  if (!expected) return false;
  const provided = extractBearer(req);
  return provided === expected;
}

function validateCoreEnv() {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL?.trim()) missing.push('DATABASE_URL');
  if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) missing.push('NEXT_PUBLIC_APP_URL');

  const encryptionSecret = process.env.ENCRYPTION_SECRET?.trim() || '';
  if (!encryptionSecret) {
    missing.push('ENCRYPTION_SECRET');
  } else if (encryptionSecret.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be at least 32 characters');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function getConfiguredPaymentProviders() {
  return Object.entries(PAYMENT_PROVIDER_REGISTRY).flatMap(([name, config]) => {
    try {
      config.envVarCheck();
      return [name];
    } catch {
      return [];
    }
  });
}

export async function GET(req: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';
  const authorized = !isProd || isAuthorized(req);

  if (!authorized) {
    return NextResponse.json({ status: 'ok' });
  }

  const health: HealthReport = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      environment: false,
      database: false,
      auth: false,
      payments: false,
    },
    providers: {
      auth: {
        active: AuthProviderFactory.getActiveProviderName(),
        available: Object.keys(AUTH_PROVIDER_REGISTRY),
        configured: AuthProviderFactory.getAllConfiguredProviders().map(({ name }) => name),
      },
      payments: {
        active: (process.env.PAYMENT_PROVIDER || 'stripe').toLowerCase(),
        available: Object.keys(PAYMENT_PROVIDER_REGISTRY),
        configured: getConfiguredPaymentProviders(),
      },
    },
    errors: [] as string[]
  };

  try {
    validateCoreEnv();
    health.checks.environment = true;
  } catch (error) {
    health.checks.environment = false;
    health.errors.push(`Environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

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

  try {
    AuthProviderFactory.getProvider();
    health.checks.auth = true;
  } catch (error) {
    health.checks.auth = false;
    health.errors.push(`Auth (${health.providers.auth.active}): ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    PaymentProviderFactory.getProvider();
    health.checks.payments = true;
  } catch (error) {
    health.checks.payments = false;
    health.errors.push(`Payments (${health.providers.payments.active}): ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  const allHealthy = Object.values(health.checks).every(check => check);
  health.status = allHealthy ? 'healthy' : 'unhealthy';

  const statusCode = allHealthy ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}
