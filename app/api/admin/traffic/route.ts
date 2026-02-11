import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { Logger } from '../../../../lib/logger';
import { toError } from '../../../../lib/runtime-guards';
import { fetchTrafficBreakdown } from '../../../../lib/google-analytics';
import type { BreakdownGroup } from '../../../../lib/google-analytics';
import {
  ADMIN_TRAFFIC_PERIODS,
  getAdminTrafficSnapshot,
  normalizeTrafficFilters,
  TRAFFIC_BREAKDOWN_GROUPS,
  type AdminTrafficFilters
} from '../../../../lib/admin-traffic';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Require administrator or moderator access for the traffic section
    await requireAdminOrModerator('traffic');

    const { searchParams } = new URL(request.url);
    const allowedPeriods = ADMIN_TRAFFIC_PERIODS.map((option) => option.value);
    const requestedPeriod = (searchParams.get('period') || '30d') as AdminTrafficFilters['period'];
    const periodParam = allowedPeriods.includes(requestedPeriod) ? requestedPeriod : '30d';
    const country = searchParams.get('country') || undefined;
    const pageFilter = searchParams.get('page') || undefined;
    const deviceType = searchParams.get('deviceType') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const groupParamRaw = searchParams.get('group');
    const pageNumberParam = searchParams.get('pageNumber');
    const pageSizeParam = searchParams.get('pageSize');

    let normalizedFilters: AdminTrafficFilters;
    try {
      normalizedFilters = normalizeTrafficFilters({
        period: periodParam,
        country,
        page: pageFilter,
        deviceType,
        startDate,
        endDate
      });
    } catch (filtersError: unknown) {
      const message = filtersError instanceof Error ? filtersError.message : 'Invalid traffic filters';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (groupParamRaw) {
      if (!TRAFFIC_BREAKDOWN_GROUPS.includes(groupParamRaw as BreakdownGroup)) {
        return NextResponse.json({ error: 'Invalid breakdown group' }, { status: 400 });
      }

      const pageNumber = Number.parseInt(pageNumberParam ?? '1', 10);
      const pageSize = Number.parseInt(pageSizeParam ?? '25', 10);
      const normalizedPageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
      const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;

      const breakdown = await fetchTrafficBreakdown(groupParamRaw as BreakdownGroup, normalizedFilters, {
        page: normalizedPageNumber,
        pageSize: normalizedPageSize
      });

      return NextResponse.json(breakdown);
    }

    const snapshot = await getAdminTrafficSnapshot(normalizedFilters);

    try {
      Logger.debug('[traffic] fetched from Google Analytics', {
        period: snapshot.period,
        totalVisits: snapshot.totals.visits,
        uniqueVisitors: snapshot.totals.uniqueVisitors
      });
    } catch (err: unknown) {
      Logger.warn('Traffic debug logging failed', { error: toError(err) });
    }

    return NextResponse.json(snapshot);

  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Traffic analytics API error', { error: err });
    const message = err.message || 'Failed to fetch traffic';
    const statusFromError = (err as { status?: number }).status;
    let status = 500;
    if (statusFromError === 403) {
      status = 403;
    } else if (message.includes('GA configuration missing')) {
      status = 503;
    }
    return NextResponse.json({ error: message }, { status });
  }
}
