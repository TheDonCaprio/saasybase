import { prisma } from './prisma';
import { Logger } from './logger';
import { toError, asRecord } from './runtime-guards';
import type { UserRole } from './auth';
import { buildStringContainsFilter, sanitizeWhereForInsensitiveSearch } from './queryUtils';

type AdminActionDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  deleteMany?: (args?: Record<string, unknown>) => Promise<unknown>;
  count?: (args?: Record<string, unknown>) => Promise<number>;
};

function getAdminActionDelegate(): AdminActionDelegate {
  const delegate = (prisma as unknown as { adminActionLog?: AdminActionDelegate }).adminActionLog;
  if (!delegate) {
    throw new Error('Admin action log delegate not available on Prisma client');
  }
  return delegate;
}

export interface AdminActionInput {
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetUserId?: string;
  targetType?: string;
  details?: Record<string, unknown> | null;
}

export async function recordAdminAction({
  actorId,
  actorRole,
  action,
  targetUserId,
  targetType,
  details
}: AdminActionInput): Promise<void> {
  try {
    const delegate = getAdminActionDelegate();
    await delegate.create({
      data: {
        actorId,
        actorRole,
        action,
        targetUserId: targetUserId ?? null,
        targetType: targetType ?? null,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (error: unknown) {
    const err = toError(error);
    Logger.warn('Failed to record admin action', {
      action,
      actorId,
      error: err.message
    });
  }
}

export interface AdminActionFilters {
  cursor?: string;
  page?: number;
  limit?: number;
  actorRole?: 'ADMIN' | 'MODERATOR';
  actionPrefix?: string;
  targetType?: string | null;
  // New: server-side search, sorting and date range
  search?: string;
  sortBy?: 'createdAt' | 'action' | 'actorRole';
  order?: 'asc' | 'desc';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD (exclusive)
}

export interface AdminActionEntry {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetUserId: string | null;
  targetType: string | null;
  details: string | null;
  createdAt: Date;
  actor: { id: string; name: string | null; email: string | null; role: string } | null;
  target: { id: string; name: string | null; email: string | null; role: string } | null;
  parsedDetails: unknown;
}

export interface AdminActionPageInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminActionResult {
  entries: AdminActionEntry[];
  nextCursor: string | null;
  previousCursor: string | null;
  pageInfo: AdminActionPageInfo;
}

export interface ModerationSummary {
  totalActions: number;
  actionsLast7Days: number;
  actionsLast24Hours: number;
  moderatorActionsLast7Days: number;
  adminActionsLast7Days: number;
  activeModeratorsLast7Days: number;
  topActionGroup: { action: string; count: number } | null;
}

export async function fetchAdminActions({ cursor, page, limit = 50, actorRole, actionPrefix, targetType, search, sortBy, order, startDate, endDate }: AdminActionFilters): Promise<AdminActionResult> {
  const take = Math.min(Math.max(limit, 1), 200);
  const requestedPage = typeof page === 'number' && page > 0 ? Math.floor(page) : 1;

  const delegate = getAdminActionDelegate();
  const where: Record<string, unknown> = {};
  if (actorRole) {
    where.actorRole = actorRole;
  }
  if (actionPrefix) {
    where.action = { startsWith: actionPrefix };
  }
  if (typeof targetType === 'string') {
    where.targetType = targetType;
  } else if (targetType === null) {
    where.targetType = null;
  }

  // Search: supports searching action, actor name/email, target id/email
  if (search && typeof search === 'string' && search.trim().length > 0) {
    const s = search.trim();
    where.AND = where.AND ?? [];
    (where.AND as Record<string, unknown>[]).push({
      OR: [
        { action: buildStringContainsFilter(s) },
        { actor: { name: buildStringContainsFilter(s) } },
        { actor: { email: buildStringContainsFilter(s) } },
        { target: { id: { contains: s } } },
        { target: { email: buildStringContainsFilter(s) } }
      ]
    });
  }

  // Date range filtering (startDate inclusive, endDate exclusive)
  const dateWhere: Record<string, unknown> = {};
  if (startDate) {
    const sd = new Date(`${startDate}T00:00:00Z`);
    if (!Number.isNaN(sd.getTime())) dateWhere.gte = sd;
  }
  if (endDate) {
    const ed = new Date(`${endDate}T00:00:00Z`);
    if (!Number.isNaN(ed.getTime())) dateWhere.lt = ed;
  }
  if (Object.keys(dateWhere).length > 0) {
    where.createdAt = dateWhere;
  }

  // Sorting: validate allowed fields
  const sortField = ['createdAt', 'action', 'actorRole'].includes(String(sortBy)) ? sortBy : 'createdAt';
  const sortOrder = order === 'asc' ? 'asc' : 'desc';

  const query: Record<string, unknown> = {
    orderBy: { [String(sortField)]: sortOrder },
    take,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
      target: { select: { id: true, name: true, email: true, role: true } }
    }
  };

  if (cursor) {
    query.skip = 1;
    query.cursor = { id: cursor };
  } else if (requestedPage > 1) {
    query.skip = (requestedPage - 1) * take;
  }

  if (Object.keys(where).length > 0) {
    // Some Prisma providers (SQLite) don't support `mode: 'insensitive'`.
    // Sanitize the where clause based on runtime DB to avoid validation errors.
    query.where = sanitizeWhereForInsensitiveSearch(where, process.env.DATABASE_URL);
  }

  const entries = (await delegate.findMany(query) as AdminActionEntry[]);

  const parsedEntries = entries.map((entry) => ({
    ...entry,
    parsedDetails: parseDetails(entry.details)
  }));

  const nextCursor = parsedEntries.length === take ? parsedEntries[parsedEntries.length - 1].id : null;
  const totalCount = typeof delegate.count === 'function'
    ? await delegate.count({ where })
    : parsedEntries.length;

  const currentPage = requestedPage;
  const totalPages = Math.max(1, Math.ceil(totalCount / take));
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  return {
    entries: parsedEntries,
    nextCursor,
    previousCursor: null,
    pageInfo: {
      page: currentPage,
      limit: take,
      totalCount,
      totalPages,
      hasNextPage,
      hasPreviousPage
    }
  };
}

const DEFAULT_SUMMARY: ModerationSummary = {
  totalActions: 0,
  actionsLast7Days: 0,
  actionsLast24Hours: 0,
  moderatorActionsLast7Days: 0,
  adminActionsLast7Days: 0,
  activeModeratorsLast7Days: 0,
  topActionGroup: null
};

export async function fetchModerationSummary(): Promise<ModerationSummary> {
  try {
    const delegate = getAdminActionDelegate();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const countFn = typeof delegate.count === 'function' ? delegate.count.bind(delegate) : null;

    const [
      totalActions,
      actionsLast7Days,
      actionsLast24Hours,
      moderatorActionsLast7Days,
      adminActionsLast7Days
    ] = await Promise.all([
      countFn ? countFn({}) : Promise.resolve(0),
      countFn ? countFn({ where: { createdAt: { gte: sevenDaysAgo } } }) : Promise.resolve(0),
      countFn ? countFn({ where: { createdAt: { gte: twentyFourHoursAgo } } }) : Promise.resolve(0),
      countFn
        ? countFn({ where: { actorRole: 'MODERATOR', createdAt: { gte: sevenDaysAgo } } })
        : Promise.resolve(0),
      countFn
        ? countFn({ where: { actorRole: 'ADMIN', createdAt: { gte: sevenDaysAgo } } })
        : Promise.resolve(0)
    ]);

    let activeModeratorsLast7Days = 0;
    try {
      const rows = await delegate.findMany({
        where: { actorRole: 'MODERATOR', createdAt: { gte: sevenDaysAgo } },
        select: { actorId: true },
        distinct: ['actorId']
      });
      const ids = new Set<string>();
      for (const row of rows) {
        const rec = asRecord(row);
        const actorId = rec?.actorId;
        if (typeof actorId === 'string' && actorId.length > 0) {
          ids.add(actorId);
        }
      }
      activeModeratorsLast7Days = ids.size;
    } catch (error: unknown) {
      Logger.warn('Failed to compute active moderator count', { error: toError(error).message });
    }

    let topActionGroup: ModerationSummary['topActionGroup'] = null;
    try {
      const grouped = await prisma.adminActionLog.groupBy({
        by: ['action'],
        _count: { action: true },
        where: { createdAt: { gte: sevenDaysAgo } },
        orderBy: { _count: { action: 'desc' } },
        take: 1
      });
      if (Array.isArray(grouped) && grouped.length > 0) {
        const top = grouped[0];
        const action = typeof top.action === 'string' ? top.action : '';
        const countRecord = (top._count ?? {}) as { action?: number };
        const count = typeof countRecord.action === 'number' ? countRecord.action : 0;
        if (action && count > 0) {
          topActionGroup = { action, count };
        }
      }
    } catch (error: unknown) {
      Logger.warn('Failed to compute top moderation action group', { error: toError(error).message });
    }

    return {
      totalActions,
      actionsLast7Days,
      actionsLast24Hours,
      moderatorActionsLast7Days,
      adminActionsLast7Days,
      activeModeratorsLast7Days,
      topActionGroup
    };
  } catch (error: unknown) {
    Logger.warn('Failed to fetch moderation summary', { error: toError(error).message });
    return DEFAULT_SUMMARY;
  }
}

function parseDetails(payload: string | null) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return asRecord(parsed) ?? parsed;
  } catch (error) {
    Logger.warn('Failed to parse admin action details', { error: toError(error).message });
    return null;
  }
}

export async function fetchAdminActionGroups(): Promise<string[]> {
  try {
    const delegate = getAdminActionDelegate();
    const rows = await delegate.findMany({
      distinct: ['action'],
      select: { action: true }
    });
    const groups = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const actionRaw = rec.action;
      if (typeof actionRaw !== 'string' || actionRaw.length === 0) continue;
      const group = actionRaw.includes('.') ? actionRaw.split('.')[0] : actionRaw;
      if (group) groups.add(group);
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  } catch (error: unknown) {
    Logger.warn('Failed to fetch admin action groups', { error: toError(error).message });
    return [];
  }
}

export async function clearAdminActions(): Promise<number> {
  try {
    const delegate = getAdminActionDelegate();
    if (typeof delegate.deleteMany !== 'function') {
      throw new Error('Admin action log delegate missing deleteMany');
    }
    const result = await delegate.deleteMany();
    if (result && typeof result === 'object' && 'count' in result) {
      const count = Number((result as Record<string, unknown>).count ?? 0);
      return Number.isFinite(count) ? count : 0;
    }
    return 0;
  } catch (error: unknown) {
    Logger.warn('Failed to clear admin actions', { error: toError(error).message });
    return 0;
  }
}
