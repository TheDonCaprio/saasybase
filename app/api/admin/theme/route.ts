import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, toAuthGuardErrorResponse } from '../../../../lib/auth';
import { recordAdminAction } from '../../../../lib/admin-actions';
import { adminRateLimit } from '../../../../lib/rateLimit';
import { Logger } from '../../../../lib/logger';
import {
  SETTING_KEYS,
  SETTING_DEFAULTS,
  ThemeLink,
  DEFAULT_THEME_HEADER_LINKS,
  DEFAULT_THEME_FOOTER_LINKS,
  getThemeHeaderLinks,
  getThemeFooterLinks,
  getThemeFooterTextRaw,
  getThemeCustomCss,
  getThemeCustomHeadSnippet,
  getThemeCustomBodySnippet,
  getThemeCustomSnippet,
  setSetting,
  clearSettingsCache
} from '../../../../lib/settings';
import { asRecord, toError } from '../../../../lib/runtime-guards';

const MAX_LINKS = 10;
const MAX_CUSTOM_CODE_CHARS = 10_000;

const isSafeHref = (href: string) => /^(https?:\/\/|\/)/i.test(href.trim());

const sanitizeLinks = (input: unknown, fallback: ThemeLink[]): ThemeLink[] => {
  const result: ThemeLink[] = [];
  if (!Array.isArray(input)) return fallback;

  for (const candidate of input) {
    if (typeof candidate !== 'object' || candidate === null) continue;

    const label = typeof (candidate as { label?: unknown }).label === 'string'
      ? (candidate as { label: string }).label.trim()
      : '';
    const href = typeof (candidate as { href?: unknown }).href === 'string'
      ? (candidate as { href: string }).href.trim()
      : '';

    if (!label || !href) continue;
    if (!isSafeHref(href)) continue;

    const normalized: ThemeLink = {
      label: label.slice(0, 64),
      href: href.slice(0, 2048)
    };

    result.push(normalized);
    if (result.length >= MAX_LINKS) break;
  }

  return result;
};

const sanitizeCustomCode = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_CUSTOM_CODE_CHARS);
};

async function getThemePayload() {
  const [headerLinks, footerLinks, footerText, customCss, customHead, customBody, legacySnippet] = await Promise.all([
    getThemeHeaderLinks(),
    getThemeFooterLinks(),
    getThemeFooterTextRaw(),
    getThemeCustomCss(),
    getThemeCustomHeadSnippet(),
    getThemeCustomBodySnippet(),
    getThemeCustomSnippet()
  ]);

  return {
    headerLinks,
    footerLinks,
    footerText,
    customCss,
    customHead,
    customBody,
    legacySnippet
  };
}

export async function GET(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-theme:get', { limit: 120, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin theme GET', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
      );
    }

  const payload = await getThemePayload();
    const res = NextResponse.json(payload);
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    res.headers.set('X-RateLimit-Limit', '120');
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to fetch admin theme settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: 'Failed to load theme settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actorId = await requireAdmin();
    const rl = await adminRateLimit(actorId, req, 'admin-theme:update', { limit: 40, windowMs: 120_000 });
    if (!rl.success && !rl.allowed) {
      Logger.error('Rate limiter unavailable for admin theme PUT', { actorId, error: rl.error });
      return NextResponse.json({ error: 'Service temporarily unavailable. Please retry shortly.' }, { status: 503 });
    }
    if (!rl.allowed) {
      const retryAfterSeconds = Math.max(0, Math.ceil((rl.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': retryAfterSeconds.toString() } }
      );
    }

    const rawBody: unknown = await req.json();
    const body = asRecord(rawBody);

    if (body?.reset === true) {
      await Promise.all([
        setSetting(SETTING_KEYS.THEME_HEADER_LINKS, SETTING_DEFAULTS[SETTING_KEYS.THEME_HEADER_LINKS]),
        setSetting(SETTING_KEYS.THEME_FOOTER_LINKS, SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_LINKS]),
        setSetting(SETTING_KEYS.THEME_FOOTER_TEXT, SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_TEXT]),
        setSetting(SETTING_KEYS.THEME_CUSTOM_CSS, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_CSS]),
        setSetting(SETTING_KEYS.THEME_CUSTOM_HEAD, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_HEAD]),
        setSetting(SETTING_KEYS.THEME_CUSTOM_BODY, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_BODY]),
        setSetting(SETTING_KEYS.THEME_CUSTOM_JS, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_JS])
      ]);
      clearSettingsCache();
      Logger.info('Admin reset theme settings to defaults', { actorId });
      await recordAdminAction({
        actorId,
        actorRole: 'ADMIN',
        action: 'theme.reset',
        targetType: 'system',
        details: null,
      });
      const payload = await getThemePayload();
      const res = NextResponse.json(payload);
      if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
      res.headers.set('X-RateLimit-Limit', '40');
      if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
      return res;
    }

    const headerLinks = sanitizeLinks(body?.headerLinks, DEFAULT_THEME_HEADER_LINKS);
    const footerLinks = sanitizeLinks(body?.footerLinks, DEFAULT_THEME_FOOTER_LINKS);
    const footerText = typeof body?.footerText === 'string'
      ? (body.footerText.trim().length ? body.footerText.trim().slice(0, 2048) : SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_TEXT])
      : SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_TEXT];
    const customCss = sanitizeCustomCode(body?.customCss ?? '');
    const rawHeadSnippet = body?.customHead ?? '';
    const rawBodySnippet = body?.customBody ?? body?.customCode ?? body?.customJs ?? '';
    const customHead = sanitizeCustomCode(rawHeadSnippet);
    const customBody = sanitizeCustomCode(rawBodySnippet);

    await Promise.all([
      setSetting(SETTING_KEYS.THEME_HEADER_LINKS, JSON.stringify(headerLinks)),
      setSetting(SETTING_KEYS.THEME_FOOTER_LINKS, JSON.stringify(footerLinks)),
      setSetting(SETTING_KEYS.THEME_FOOTER_TEXT, footerText),
      setSetting(SETTING_KEYS.THEME_CUSTOM_CSS, customCss),
      setSetting(SETTING_KEYS.THEME_CUSTOM_HEAD, customHead),
      setSetting(SETTING_KEYS.THEME_CUSTOM_BODY, customBody),
      setSetting(SETTING_KEYS.THEME_CUSTOM_JS, customBody)
    ]);
    clearSettingsCache();

    Logger.info('Admin updated theme settings', {
      actorId,
      headerLinkCount: headerLinks.length,
      footerLinkCount: footerLinks.length,
      headSnippetLength: customHead.length,
      bodySnippetLength: customBody.length
    });
    await recordAdminAction({
      actorId,
      actorRole: 'ADMIN',
      action: 'theme.update',
      targetType: 'system',
      details: {
        headerLinkCount: headerLinks.length,
        footerLinkCount: footerLinks.length,
        hasCustomCss: customCss.length > 0,
        hasCustomHead: customHead.length > 0,
        hasCustomBody: customBody.length > 0,
      },
    });

    const payload = await getThemePayload();
    const res = NextResponse.json(payload);
    if (rl.remaining !== undefined) res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    res.headers.set('X-RateLimit-Limit', '40');
    if (rl.reset) res.headers.set('X-RateLimit-Reset', String(rl.reset));
    return res;
  } catch (error: unknown) {
    const authResponse = toAuthGuardErrorResponse(error);
    if (authResponse) return authResponse;

    const err = toError(error);
    Logger.error('Failed to update admin theme settings', { error: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message || 'Failed to update theme settings' }, { status: 500 });
  }
}
