import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrModerator, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { fetchAdminActions, fetchAdminActionGroups, fetchAdminActionNames, clearAdminActions, recordAdminAction } from '../../../../lib/admin-actions';
import type { AdminActionFilters } from '../../../../lib/admin-actions';
import { toError } from '../../../../lib/runtime-guards';
import { Logger } from '../../../../lib/logger';
import { raiseAuthGuardError } from '../../../../lib/auth-guard-error';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminOrModerator();
    if (actor.role !== 'ADMIN') {
      raiseAuthGuardError('FORBIDDEN', {
        source: 'moderator-actions:GET',
        reason: 'moderator-access-denied',
        userId: actor.userId
      });
    }

    const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit');
  const pageParam = searchParams.get('page');
  const searchParam = searchParams.get('search') ?? undefined;
  const sortByParam = searchParams.get('sortBy') ?? undefined;
  const sortOrderParam = searchParams.get('sortOrder') ?? undefined;
  const startDateParam = searchParams.get('startDate') ?? undefined;
  const endDateParam = searchParams.get('endDate') ?? undefined;
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : undefined;
    const limit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    const page = parsedPage && Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : undefined;
    const actorRoleParam = searchParams.get('actorRole');
    const actionGroupParam = searchParams.get('actionGroup');
    const targetTypeParam = searchParams.get('targetType');

    const actorRoleFilter = actorRoleParam === 'ADMIN' || actorRoleParam === 'MODERATOR' ? actorRoleParam : undefined;
    const actionPrefixFilter = actionGroupParam && actionGroupParam !== 'ALL' ? `${actionGroupParam}.` : undefined;
    const targetTypeFilter = targetTypeParam && targetTypeParam !== 'ALL'
      ? (targetTypeParam === 'NONE' ? null : targetTypeParam)
      : undefined;
    const searchFilter = typeof searchParam === 'string' && searchParam.trim().length > 0 ? searchParam.trim() : undefined;
    const sortByFilter = typeof sortByParam === 'string' ? sortByParam : undefined;
    const sortOrderFilter = sortOrderParam === 'asc' ? 'asc' : sortOrderParam === 'desc' ? 'desc' : undefined;
    const startDateFilter = typeof startDateParam === 'string' && startDateParam.trim().length > 0 ? startDateParam.trim() : undefined;
    const endDateFilter = typeof endDateParam === 'string' && endDateParam.trim().length > 0 ? endDateParam.trim() : undefined;

    const { entries, nextCursor, previousCursor, pageInfo } = await fetchAdminActions({
      cursor,
      page,
      limit,
      actorRole: actorRoleFilter,
      actionPrefix: actionPrefixFilter,
      targetType: targetTypeFilter,
      search: searchFilter,
      sortBy: sortByFilter as AdminActionFilters['sortBy'],
      order: sortOrderFilter as AdminActionFilters['order'],
      startDate: startDateFilter,
      endDate: endDateFilter
    });

    const [availableActionGroups, availableActions] = await Promise.all([
      fetchAdminActionGroups(),
      fetchAdminActionNames()
    ]);

    const payload = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor: entry.actor
        ? {
            id: entry.actor.id,
            name: entry.actor.name,
            email: entry.actor.email,
            role: entry.actor.role
          }
        : {
            id: entry.actorId,
            name: null,
            email: null,
            role: entry.actorRole
          },
      actorRole: entry.actorRole,
      target: entry.target
        ? {
            id: entry.target.id,
            name: entry.target.name,
            email: entry.target.email,
            role: entry.target.role
          }
        : entry.targetUserId
          ? {
              id: entry.targetUserId,
              name: null,
              email: null,
              role: null
            }
          : null,
      targetType: entry.targetType,
      details: entry.parsedDetails,
      createdAt: entry.createdAt.toISOString()
    }));

    return NextResponse.json({
      entries: payload,
      totalCount: pageInfo.totalCount,
      nextCursor,
      previousCursor,
      pageInfo,
      availableActionGroups,
      availableActions
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Moderator actions API error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to fetch moderator actions' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const actor = await requireAdminOrModerator();
    if (actor.role !== 'ADMIN') {
      raiseAuthGuardError('FORBIDDEN', {
        source: 'moderator-actions:DELETE',
        reason: 'moderator-access-denied',
        userId: actor.userId
      });
    }

    const deletedCount = await clearAdminActions();
    Logger.warn('Admin cleared moderator action log', {
      actorId: actor.userId,
      deletedCount
    });

    // Log this action AFTER clearing, so the clear-log action itself is recorded
    // as the first entry in the fresh log.
    await recordAdminAction({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'moderation.clear_log',
      targetType: 'system',
      details: { deletedCount },
    });

    return NextResponse.json({ ok: true, deletedCount });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Moderator actions clear error', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to clear moderator actions' }, { status: 500 });
  }
}
