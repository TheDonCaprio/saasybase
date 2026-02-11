import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchTeamDashboardState } from '../../../../lib/team-dashboard';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const forceSync = request.nextUrl.searchParams.get('sync') === '1';

  try {
    const state = await fetchTeamDashboardState(userId, { forceSync });
    return NextResponse.json({ ok: true, ...state });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('team summary fetch failed', { userId, error: error.message });
    return NextResponse.json({ ok: false, error: 'Unable to load team data' }, { status: 500 });
  }
}
