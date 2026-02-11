import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { getAdminAnalytics } from '../../../../lib/admin-analytics';
import type { AdminAnalyticsPeriod } from '../../../../lib/admin-analytics-shared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrModerator('analytics');
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '30d') as AdminAnalyticsPeriod;
    const analytics = await getAdminAnalytics(period);

    return NextResponse.json(analytics);
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    const err = toError(error);
    Logger.error('Analytics API error', { error: err.message, stack: err.stack });
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' }, 
      { status: 500 }
    );
  }
}
