import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { toError } from '@/lib/runtime-guards';
import { formatDate } from '@/lib/formatDate';
import { getFormatSetting } from '@/lib/settings';
import { buildStringContainsFilter, sanitizeWhereForInsensitiveSearch, stripMode, isPrismaModeError } from '@/lib/queryUtils';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type SystemLogRecord = {
  id: string;
  level: string;
  message: string;
  meta: string | null;
  context: string | null;
  createdAt: Date;
};

type SystemLogWhere = Record<string, unknown>;

type SystemLogDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<SystemLogRecord[]>;
  deleteMany: (args: { where?: { id?: { in?: string[] } } }) => Promise<{ count?: number } | number>;
  count?: (args?: Record<string, unknown>) => Promise<number>;
};

function getSystemLogDelegate(): SystemLogDelegate | null {
  const client = (prisma as unknown as { systemLog?: SystemLogDelegate }).systemLog;
  return client ?? null;
}

function parsePayload(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getPagination(request: NextRequest) {
  const url = new URL(request.url);
  const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
  const limitParam = parseInt(url.searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const limitRaw = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, limitRaw);
  return { page, limit };
}

function getFilters(request: NextRequest) {
  const url = new URL(request.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const level = url.searchParams.get('level')?.trim() ?? '';
  const sortBy = url.searchParams.get('sortBy')?.trim() ?? 'createdAt';
  const sortOrder = url.searchParams.get('sortOrder')?.trim() ?? 'desc';
  const startDate = url.searchParams.get('startDate')?.trim() ?? '';
  const endDate = url.searchParams.get('endDate')?.trim() ?? '';
  return { search, level, sortBy, sortOrder, startDate, endDate };
}

function validateSort(sortBy: string, sortOrder: string) {
  const validSortFields = ['createdAt', 'level', 'message'];
  const validOrders = ['asc', 'desc'];
  const field = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const order = validOrders.includes(sortOrder) ? sortOrder : 'desc';
  return { field, order };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const delegate = getSystemLogDelegate();
  if (!delegate) {
    return NextResponse.json({ logs: [], total: 0, page: 1, pageCount: 0 });
  }

  const { page, limit } = getPagination(request);
  const { search, level, sortBy, sortOrder, startDate, endDate } = getFilters(request);
  const { field: sortField, order: sortOrderValid } = validateSort(sortBy, sortOrder);
  const skip = (page - 1) * limit;
  const dbUrl = process.env.DATABASE_URL || '';

  const filters: Array<Record<string, unknown>> = [];

  if (level) {
    filters.push({ level: { equals: level } });
  }

  if (search) {
    const searchFilter = buildStringContainsFilter(search, dbUrl);
    filters.push({
      OR: [
        { message: searchFilter },
        { level: searchFilter },
      ],
    });
  }

  // Date range filtering
  if (startDate || endDate) {
    const dateFilters: Record<string, unknown> = {};
    if (startDate) {
      const startDateTime = new Date(`${startDate}T00:00:00Z`);
      if (!Number.isNaN(startDateTime.getTime())) {
        dateFilters.gte = startDateTime;
      }
    }
    if (endDate) {
      const endDateTime = new Date(`${endDate}T00:00:00Z`);
      if (!Number.isNaN(endDateTime.getTime())) {
        dateFilters.lt = endDateTime;
      }
    }
    if (Object.keys(dateFilters).length > 0) {
      filters.push({ createdAt: dateFilters });
    }
  }

  const where: SystemLogWhere | undefined = filters.length > 0 ? { AND: filters } : undefined;
  const sanitizedWhere = where ? (sanitizeWhereForInsensitiveSearch(where, dbUrl) as SystemLogWhere) : undefined;

  const findArgs: Record<string, unknown> = {
    orderBy: { [sortField]: sortOrderValid },
    skip,
    take: limit,
  };

  if (sanitizedWhere) {
    findArgs.where = sanitizedWhere;
  }

  const runFindMany = async (args: Record<string, unknown>) => {
    try {
      return await delegate.findMany(args);
    } catch (error: unknown) {
      if (isPrismaModeError(error)) {
        const retryArgs = { ...args };
        if (retryArgs.where) {
          const stripped = stripMode(retryArgs.where as Record<string, unknown>);
          if (stripped && typeof stripped === 'object') {
            retryArgs.where = stripped as Record<string, unknown>;
          } else {
            delete retryArgs.where;
          }
        }
        return await delegate.findMany(retryArgs);
      }
      throw error;
    }
  };

  const runCount = async (args?: Record<string, unknown>) => {
    if (!delegate.count) return 0;
    const initialArgs: Record<string, unknown> = args ? { ...args } : {};
    if (!initialArgs.where && sanitizedWhere) {
      initialArgs.where = sanitizedWhere;
    }
    try {
      return await delegate.count(initialArgs);
    } catch (error: unknown) {
      if (isPrismaModeError(error)) {
        const retryArgs = { ...initialArgs };
        if (retryArgs.where) {
          const stripped = stripMode(retryArgs.where as Record<string, unknown>);
          if (stripped && typeof stripped === 'object') {
            retryArgs.where = stripped as Record<string, unknown>;
          } else {
            delete retryArgs.where;
          }
        }
        return await delegate.count(retryArgs);
      }
      throw error;
    }
  };

  try {
    const [logs, total, formatSettings] = await Promise.all([
      runFindMany(findArgs),
      runCount(),
      getFormatSetting(),
    ]);

    const pageCount = total > 0 ? Math.ceil(total / limit) : 0;
    const timezone = formatSettings.timezone;

    return NextResponse.json({
      logs: logs.map((log: SystemLogRecord) => {
        const absolute = formatDate(log.createdAt, { mode: 'datetime-long', timezone });
        const relative = formatDate(log.createdAt, { mode: 'relative', timezone });
        return {
          id: log.id,
          level: log.level,
          message: log.message,
          meta: parsePayload(log.meta),
          context: parsePayload(log.context),
          createdAt: log.createdAt,
          createdAtFormatted: absolute,
          createdAtRelative: relative,
          createdAtDisplay: relative ? `${absolute} • ${relative}` : absolute,
        };
      }),
      total,
      page,
      pageCount,
      limit,
      sortBy: sortField,
      sortOrder: sortOrderValid,
    });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('Failed to fetch admin logs', error);
    return NextResponse.json({ error: 'Unable to load logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const guard = toAuthGuardErrorResponse(error);
    if (guard) return guard;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const delegate = getSystemLogDelegate();
  if (!delegate) {
    return NextResponse.json({ success: true, cleared: 0 });
  }

  try {
    const result = await delegate.deleteMany({});
    const cleared = typeof result === 'number' ? result : Number(result.count ?? 0);
    return NextResponse.json({ success: true, cleared });
  } catch (err: unknown) {
    const error = toError(err);
    Logger.error('Failed to clear admin logs', error);
    return NextResponse.json({ error: 'Unable to clear logs' }, { status: 500 });
  }
}
