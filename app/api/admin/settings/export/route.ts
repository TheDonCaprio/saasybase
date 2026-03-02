import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { SETTING_DEFAULTS, THEME_SETTING_KEY_SET } from '../../../../../lib/settings';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { toError } from '../../../../../lib/runtime-guards';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { recordAdminAction } from '../../../../../lib/admin-actions';

/**
 * GET /api/admin/settings/export
 *
 * Export all settings as a JSON file.
 * Returns a downloadable JSON file with all settings from the database.
 */
export async function GET(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-settings:export', { limit: 10, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin settings export', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, value: true },
    });

    const dbSettings = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    // Export known defaults + DB overrides so "settings" is complete even if
    // some keys were never persisted, but exclude Theme-managed keys.
    const mergedSettings = { ...SETTING_DEFAULTS, ...dbSettings } as Record<string, string>;
    const filteredSettings = Object.fromEntries(
      Object.entries(mergedSettings).filter(([key]) => !THEME_SETTING_KEY_SET.has(key))
    ) as Record<string, string>;
    const themeExcludedCount = Object.keys(mergedSettings).length - Object.keys(filteredSettings).length;

    const exportPayload = {
      _meta: {
        type: 'saasybase-settings',
        version: 1,
        exportedAt: new Date().toISOString(),
        count: Object.keys(filteredSettings).length,
        dbCount: settings.length,
        includesDefaults: true,
        excludesTheme: true,
        themeExcludedCount,
      },
      settings: filteredSettings,
    };

    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'settings.export',
      targetType: 'system',
      details: {
        count: Object.keys(filteredSettings).length,
        dbCount: settings.length,
        themeExcludedCount,
      },
    });

    const json = JSON.stringify(exportPayload, null, 2);
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="settings-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to export settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to export settings' }, { status: 500 });
  }
}
