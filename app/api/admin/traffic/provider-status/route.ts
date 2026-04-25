import { NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
import { getTrafficAnalyticsProviderHealth } from '../../../../../lib/traffic-analytics-config';

export async function GET() {
  try {
    await requireAdmin();
    const health = await getTrafficAnalyticsProviderHealth();
    return NextResponse.json(health);
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Traffic provider status API error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to load traffic provider status' }, { status: 500 });
  }
}