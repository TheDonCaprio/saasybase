import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { recordAdminAction } from '../../../../../lib/admin-actions';
import { SETTING_DEFAULTS, THEME_SETTING_KEYS } from '../../../../../lib/settings';

/**
 * GET /api/admin/theme/export
 *
 * Export all theme-related settings as a downloadable JSON file.
 */
export async function GET(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-theme:export', { limit: 10, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin theme export', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const rows = await prisma.setting.findMany({
      where: { key: { in: [...THEME_SETTING_KEYS] } },
      orderBy: { key: 'asc' },
      select: { key: true, value: true },
    });

    // For keys not in the database yet, include their defaults so the export
    // is a complete snapshot of the current theme state.
    const defaults = SETTING_DEFAULTS as Record<string, string>;
    const dbMap = new Map(rows.map((r) => [r.key, r.value]));
    const merged: Record<string, string> = {};
    for (const key of THEME_SETTING_KEYS) {
      merged[key] = dbMap.get(key) ?? defaults[key] ?? '';
    }

    const exportPayload = {
      _meta: {
        type: 'saasybase-theme',
        version: 1,
        exportedAt: new Date().toISOString(),
        count: Object.keys(merged).length,
      },
      settings: merged,
    };

    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'theme.export',
      targetType: 'system',
      details: { count: Object.keys(merged).length },
    });

    const json = JSON.stringify(exportPayload, null, 2);
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="theme-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to export theme settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to export theme settings' }, { status: 500 });
  }
}
