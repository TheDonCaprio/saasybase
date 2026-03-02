import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../../lib/auth';
import { clearSettingsCache, THEME_SETTING_KEY_SET } from '../../../../../lib/settings';
import { prisma } from '../../../../../lib/prisma';
import { Logger } from '../../../../../lib/logger';
import { asRecord, toError } from '../../../../../lib/runtime-guards';
import { adminRateLimit } from '../../../../../lib/rateLimit';
import { recordAdminAction } from '../../../../../lib/admin-actions';

/**
 * POST /api/admin/settings/import
 *
 * Import settings from a JSON file previously exported via the export route.
 * Expects `{ _meta: { type: 'saasybase-settings', version: 1 }, settings: { key: value, ... } }`.
 */
const MAX_IMPORT_SETTINGS = 2000;

export async function POST(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-settings:import', { limit: 5, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin settings import', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } });
    }

    const rawBody: unknown = await req.json();
    const body = asRecord(rawBody);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Validate the _meta envelope
    const meta = asRecord(body._meta);
    if (!meta || meta.type !== 'saasybase-settings' || meta.version !== 1) {
      return NextResponse.json(
        { error: 'Invalid export file. Expected a settings export with _meta.type = "saasybase-settings" and _meta.version = 1.' },
        { status: 400 }
      );
    }

    const settingsRaw = asRecord(body.settings);
    if (!settingsRaw || Object.keys(settingsRaw).length === 0) {
      return NextResponse.json({ error: 'No settings found in the import file.' }, { status: 400 });
    }

    // Build validated key-value pairs (both key and value must be strings)
    const entries: Array<{ key: string; value: string }> = [];
    let skippedTheme = 0;
    for (const [k, v] of Object.entries(settingsRaw)) {
      if (typeof k !== 'string' || !k.trim()) continue;
      const key = k.trim();
      if (THEME_SETTING_KEY_SET.has(key)) {
        skippedTheme++;
        continue;
      }
      entries.push({ key, value: String(v ?? '') });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid settings entries found.' }, { status: 400 });
    }

    if (entries.length > MAX_IMPORT_SETTINGS) {
      return NextResponse.json(
        { error: `Too many settings in import file (${entries.length}). Max allowed is ${MAX_IMPORT_SETTINGS}.` },
        { status: 400 }
      );
    }

    const results = await prisma.$transaction(
      entries.map((e) =>
        prisma.setting.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: { key: e.key, value: e.value },
          select: { key: true, value: true },
        })
      )
    );

    clearSettingsCache();
    revalidatePath('/', 'layout');

    Logger.info('Admin settings imported', { actorId, count: results.length });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'settings.import',
      targetType: 'system',
      details: { count: results.length, skippedTheme, keys: entries.map((e) => e.key) },
    });

    return NextResponse.json({ imported: results.length, skippedTheme });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to import settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message || 'Failed to import settings' }, { status: 500 });
  }
}
