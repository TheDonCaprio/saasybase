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
 * Allowlist of setting keys accepted during theme import.
 * Keys outside this set are silently ignored to prevent overwriting
 * non-theme settings (e.g. SITE_NAME, payment config, etc.).
 */
const ALLOWED_THEME_KEYS = THEME_SETTING_KEY_SET;

/**
 * POST /api/admin/theme/import
 *
 * Import theme settings from a JSON file previously exported via /api/admin/theme/export.
 * Expects `{ _meta: { type: 'saasybase-theme', version: 1 }, settings: { key: value, ... } }`.
 */
export async function POST(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-theme:import', { limit: 5, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin theme import', { actorId, error: rl.error });
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
    if (!meta || meta.type !== 'saasybase-theme' || meta.version !== 1) {
      return NextResponse.json(
        { error: 'Invalid export file. Expected a theme export with _meta.type = "saasybase-theme" and _meta.version = 1.' },
        { status: 400 }
      );
    }

    const settingsRaw = asRecord(body.settings);
    if (!settingsRaw || Object.keys(settingsRaw).length === 0) {
      return NextResponse.json({ error: 'No settings found in the import file.' }, { status: 400 });
    }

    // Filter to only allowed theme keys
    const entries: Array<{ key: string; value: string }> = [];
    let skipped = 0;
    for (const [k, v] of Object.entries(settingsRaw)) {
      const key = (typeof k === 'string' ? k : '').trim();
      if (!key) continue;
      if (!ALLOWED_THEME_KEYS.has(key)) {
        skipped++;
        continue;
      }
      entries.push({ key, value: String(v ?? '') });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid theme settings found in the import file.' }, { status: 400 });
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

    Logger.info('Admin theme settings imported', { actorId, count: results.length, skipped });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'theme.import',
      targetType: 'system',
      details: { count: results.length, skipped, keys: entries.map((e) => e.key) },
    });

    return NextResponse.json({ imported: results.length, skipped });
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to import theme settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message || 'Failed to import theme settings' }, { status: 500 });
  }
}
