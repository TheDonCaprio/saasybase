import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '@/lib/auth';
import { recordAdminAction } from '@/lib/admin-actions';
import { prisma } from '@/lib/prisma';
import { Logger } from '@/lib/logger';
import { asRecord, toError } from '@/lib/runtime-guards';
import { rateLimit, getClientIP } from '@/lib/rateLimit';

const KEY_PREFIX = 'discounted_subscription_price_v1:';

type CacheValue =
  | { status: 'pending'; createdAt: string }
  | { status: 'ready'; createdAt: string; provider: string; priceId: string };

function safeParseCacheValue(value: string): CacheValue | null {
  try {
    const parsed = JSON.parse(value) as CacheValue;
    if (!parsed || typeof parsed !== 'object') return null;

    if ((parsed as CacheValue).status === 'pending') {
      const pending = parsed as Extract<CacheValue, { status: 'pending' }>;
      if (typeof pending.createdAt !== 'string') return null;
      return pending;
    }

    if ((parsed as CacheValue).status === 'ready') {
      const ready = parsed as Extract<CacheValue, { status: 'ready' }>;
      if (typeof ready.createdAt !== 'string') return null;
      if (typeof ready.provider !== 'string') return null;
      if (typeof ready.priceId !== 'string') return null;
      return ready;
    }

    return null;
  } catch {
    return null;
  }
}

function parseBodyThresholds(body: Record<string, unknown>): {
  pendingOlderThanMinutes: number;
  readyOlderThanDays: number;
  dryRun: boolean;
} {
  const pendingOlderThanMinutesRaw = typeof body.pendingOlderThanMinutes === 'number'
    ? body.pendingOlderThanMinutes
    : typeof body.pendingOlderThanMinutes === 'string'
      ? Number(body.pendingOlderThanMinutes)
      : NaN;

  const readyOlderThanDaysRaw = typeof body.readyOlderThanDays === 'number'
    ? body.readyOlderThanDays
    : typeof body.readyOlderThanDays === 'string'
      ? Number(body.readyOlderThanDays)
      : NaN;

  const pendingOlderThanMinutes = Number.isFinite(pendingOlderThanMinutesRaw) && pendingOlderThanMinutesRaw > 0
    ? Math.min(Math.max(1, Math.floor(pendingOlderThanMinutesRaw)), 24 * 60)
    : 10;

  const readyOlderThanDays = Number.isFinite(readyOlderThanDaysRaw) && readyOlderThanDaysRaw > 0
    ? Math.min(Math.max(1, Math.floor(readyOlderThanDaysRaw)), 3650)
    : 90;

  const dryRun = body.dryRun === undefined ? true : Boolean(body.dryRun);

  return { pendingOlderThanMinutes, readyOlderThanDays, dryRun };
}

function olderThan(createdAtIso: string, thresholdMs: number, nowMs = Date.now()): boolean {
  const createdAtMs = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdAtMs)) return true;
  return nowMs - createdAtMs > thresholdMs;
}

async function computeStats(args: { pendingOlderThanMinutes: number; readyOlderThanDays: number }) {
  const nowMs = Date.now();
  const pendingThresholdMs = args.pendingOlderThanMinutes * 60 * 1000;
  const readyThresholdMs = args.readyOlderThanDays * 24 * 60 * 60 * 1000;

  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
    select: { key: true, value: true },
    take: 5000,
  });

  let total = 0;
  let pending = 0;
  let ready = 0;
  let stalePending = 0;
  let oldReady = 0;
  let invalid = 0;

  for (const row of rows) {
    total += 1;
    const parsed = safeParseCacheValue(row.value);
    if (!parsed) {
      invalid += 1;
      continue;
    }
    if (parsed.status === 'pending') {
      pending += 1;
      if (olderThan(parsed.createdAt, pendingThresholdMs, nowMs)) stalePending += 1;
      continue;
    }
    ready += 1;
    if (olderThan(parsed.createdAt, readyThresholdMs, nowMs)) oldReady += 1;
  }

  return {
    prefix: KEY_PREFIX,
    total,
    pending,
    ready,
    stalePending,
    oldReady,
    invalid,
    scanned: rows.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const adminId = await requireAdmin();

    const ip = getClientIP(request);
    const limiterKey = `admin:maintenance:stats:${adminId}`;
    const rl = await rateLimit(limiterKey, { limit: 30, windowMs: 60000 }, {
      actorId: adminId,
      ip,
      userAgent: request.headers.get('user-agent') || undefined,
      route: '/api/admin/maintenance/discounted-subscription-price-cache',
      method: request.method,
    });

    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const bodyLike: Record<string, unknown> = {
      pendingOlderThanMinutes: searchParams.get('pendingOlderThanMinutes') ?? undefined,
      readyOlderThanDays: searchParams.get('readyOlderThanDays') ?? undefined,
      dryRun: true,
    };

    const { pendingOlderThanMinutes, readyOlderThanDays } = parseBodyThresholds(bodyLike);
    const stats = await computeStats({ pendingOlderThanMinutes, readyOlderThanDays });

    return NextResponse.json({
      stats,
      thresholds: { pendingOlderThanMinutes, readyOlderThanDays },
      limits: { maxScan: 5000 },
    });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Maintenance stats failed', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Failed to load maintenance stats' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminId = await requireAdmin();

    const ip = getClientIP(request);
    const limiterKey = `admin:maintenance:cleanup:${adminId}`;
    const rl = await rateLimit(limiterKey, { limit: 10, windowMs: 60000 }, {
      actorId: adminId,
      ip,
      userAgent: request.headers.get('user-agent') || undefined,
      route: '/api/admin/maintenance/discounted-subscription-price-cache',
      method: request.method,
    });

    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const raw = (await request.json().catch(() => null)) as unknown;
    const body = asRecord(raw) || {};
    const { pendingOlderThanMinutes, readyOlderThanDays, dryRun } = parseBodyThresholds(body);

    const nowMs = Date.now();
    const pendingThresholdMs = pendingOlderThanMinutes * 60 * 1000;
    const readyThresholdMs = readyOlderThanDays * 24 * 60 * 60 * 1000;

    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: KEY_PREFIX } },
      select: { key: true, value: true },
      take: 5000,
    });

    const keysToDelete: string[] = [];
    const deleteReasonCounts: Record<string, number> = {
      stalePending: 0,
      oldReady: 0,
      invalid: 0,
    };

    for (const row of rows) {
      const parsed = safeParseCacheValue(row.value);
      if (!parsed) {
        keysToDelete.push(row.key);
        deleteReasonCounts.invalid += 1;
        continue;
      }

      if (parsed.status === 'pending') {
        if (olderThan(parsed.createdAt, pendingThresholdMs, nowMs)) {
          keysToDelete.push(row.key);
          deleteReasonCounts.stalePending += 1;
        }
        continue;
      }

      if (olderThan(parsed.createdAt, readyThresholdMs, nowMs)) {
        keysToDelete.push(row.key);
        deleteReasonCounts.oldReady += 1;
      }
    }

    const wouldDelete = keysToDelete.length;
    let deleted = 0;

    if (!dryRun && wouldDelete > 0) {
      const res = await prisma.setting.deleteMany({ where: { key: { in: keysToDelete } } });
      deleted = res.count;
    }

    Logger.info('Maintenance cleanup executed', {
      adminId,
      prefix: KEY_PREFIX,
      dryRun,
      scanned: rows.length,
      wouldDelete,
      deleted,
      pendingOlderThanMinutes,
      readyOlderThanDays,
      reasons: deleteReasonCounts,
    });

    const statsAfter = await computeStats({ pendingOlderThanMinutes, readyOlderThanDays });
    await recordAdminAction({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'maintenance.cache_cleanup',
      targetType: 'system',
      details: { dryRun, scanned: rows.length, wouldDelete, deleted },
    });

    return NextResponse.json({
      dryRun,
      scanned: rows.length,
      wouldDelete,
      deleted,
      thresholds: { pendingOlderThanMinutes, readyOlderThanDays },
      reasons: deleteReasonCounts,
      statsAfter,
    });
  } catch (err: unknown) {
    const guard = toAuthGuardErrorResponse(err);
    if (guard) return guard;
    const e = toError(err);
    Logger.error('Maintenance cleanup failed', { error: e.message, stack: e.stack });
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
