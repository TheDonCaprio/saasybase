import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
  DEFAULT_THEME_COLOR_PALETTE,
  type ThemeColorPalette,
  type ThemeColorTokens,
  getThemeHeaderLinks,
  getThemeFooterLinks,
  getThemeFooterTextRaw,
  getThemeCustomCss,
  getThemeCustomHeadSnippet,
  getThemeCustomBodySnippet,
  getThemeCustomSnippet,
  getThemeColorPalette,
  setSetting,
  clearSettingsCache
} from '../../../../lib/settings';
import { asRecord, toError } from '../../../../lib/runtime-guards';
import {
  sanitizeCustomCode,
  validateThemeCustomCss,
  validateThemeCustomMarkup,
} from '../../../../lib/theme-custom-code';

const MAX_LINKS = 10;

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

async function getThemePayload() {
  const [headerLinks, footerLinks, footerText, customCss, customHead, customBody, legacySnippet, colorPalette] = await Promise.all([
    getThemeHeaderLinks(),
    getThemeFooterLinks(),
    getThemeFooterTextRaw(),
    getThemeCustomCss(),
    getThemeCustomHeadSnippet(),
    getThemeCustomBodySnippet(),
    getThemeCustomSnippet(),
    getThemeColorPalette()
  ]);

  return {
    headerLinks,
    footerLinks,
    footerText,
    customCss,
    customHead,
    customBody,
    legacySnippet,
    colorPalette
  };
}

const THEME_HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const sanitizeHex = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  return THEME_HEX_RE.test(v) ? v.toLowerCase() : fallback;
};

const clamp01 = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

const sanitizeThemeFontFamily = (
  value: unknown,
  fallback: ThemeColorTokens['fontFamily'],
): ThemeColorTokens['fontFamily'] => {
  return (
    value === 'material' ||
    value === 'fluent' ||
    value === 'apple' ||
    value === 'system' ||
    value === 'carbon' ||
    value === 'polaris' ||
    value === 'ant' ||
    value === 'spectrum' ||
    value === 'geist'
  )
    ? value
    : fallback;
};

/** Bake a legacy 0-1 opacity value into the hex alpha channel. */
const bakeOpacity = (hex: string, opacity: number): string => {
  if (opacity >= 1) return hex;
  const clean = hex.replace(/^#/, '');
  const existingA = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  const newA = Math.max(0, Math.min(1, existingA * opacity));
  const aByte = Math.round(newA * 255).toString(16).padStart(2, '0');
  return `#${clean.slice(0, 6)}${aByte}`;
};

const migrateModeOpacity = (
  modeIn: Record<string, unknown>,
  result: ThemeColorTokens,
): ThemeColorTokens => {
  const out = { ...result };
  out.headerBg = bakeOpacity(out.headerBg, clamp01(modeIn.headerOpacity, 1));
  out.headerBorder = bakeOpacity(out.headerBorder, clamp01(modeIn.headerBorderOpacity, 1));
  out.stickyHeaderBg = bakeOpacity(out.stickyHeaderBg, clamp01(modeIn.stickyHeaderOpacity, 1));
  out.stickyHeaderBorder = bakeOpacity(out.stickyHeaderBorder, clamp01(modeIn.stickyHeaderBorderOpacity, 1));
  out.sidebarBg = bakeOpacity(out.sidebarBg, clamp01(modeIn.sidebarOpacity, 1));
  out.pageGlow = bakeOpacity(out.pageGlow, clamp01(modeIn.glowOpacity, 1));
  out.headerOpacity = 1;
  out.headerBorderOpacity = 1;
  out.stickyHeaderOpacity = 1;
  out.stickyHeaderBorderOpacity = 1;
  out.sidebarOpacity = 1;
  out.glowOpacity = 1;
  return out;
};

const sanitizePalette = (input: unknown): ThemeColorPalette => {
  const rec = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
  const lightIn = (rec.light && typeof rec.light === 'object') ? (rec.light as Record<string, unknown>) : {};
  const darkIn = (rec.dark && typeof rec.dark === 'object') ? (rec.dark as Record<string, unknown>) : {};

  const l = DEFAULT_THEME_COLOR_PALETTE.light;
  const d = DEFAULT_THEME_COLOR_PALETTE.dark;

  const lightPageFrom = sanitizeHex(lightIn.pageGradientFrom, l.pageGradientFrom);
  const lightPageVia = sanitizeHex(lightIn.pageGradientVia, l.pageGradientVia);
  const lightPageTo = sanitizeHex(lightIn.pageGradientTo, l.pageGradientTo);

  const darkPageFrom = sanitizeHex(darkIn.pageGradientFrom, d.pageGradientFrom);
  const darkPageVia = sanitizeHex(darkIn.pageGradientVia, d.pageGradientVia);
  const darkPageTo = sanitizeHex(darkIn.pageGradientTo, d.pageGradientTo);

  const lightStickyBgFallback = sanitizeHex(lightIn.headerBg, l.stickyHeaderBg ?? l.headerBg);
  const lightStickyTextFallback = sanitizeHex(lightIn.textPrimary, l.stickyHeaderText ?? l.textPrimary);
  const darkStickyBgFallback = sanitizeHex(darkIn.headerBg, d.stickyHeaderBg ?? d.headerBg);
  const darkStickyTextFallback = sanitizeHex(darkIn.textPrimary, d.stickyHeaderText ?? d.textPrimary);

  const lightHeaderTextFallback = sanitizeHex(lightIn.textPrimary, l.headerText ?? l.textPrimary);
  const darkHeaderTextFallback = sanitizeHex(darkIn.textPrimary, d.headerText ?? d.textPrimary);

  const lightHeaderBorderFallback = sanitizeHex(lightIn.borderPrimary, l.headerBorder ?? l.borderPrimary);
  const darkHeaderBorderFallback = sanitizeHex(darkIn.borderPrimary, d.headerBorder ?? d.borderPrimary);

  const lightSidebarBorderFallback = sanitizeHex(lightIn.borderPrimary, l.sidebarBorder ?? l.borderPrimary);
  const darkSidebarBorderFallback = sanitizeHex(darkIn.borderPrimary, d.sidebarBorder ?? d.borderPrimary);

  const lightHeaderShadowFallback = l.headerShadow ?? '#00000014';
  const darkHeaderShadowFallback = d.headerShadow ?? '#00000014';
  const lightPanelShadowFallback = l.panelShadow ?? l.cardShadow ?? '#00000012';
  const darkPanelShadowFallback = d.panelShadow ?? d.cardShadow ?? '#00000012';
  const lightCardShadowFallback = l.cardShadow ?? '#00000014';
  const darkCardShadowFallback = d.cardShadow ?? '#00000014';
  const lightTabsShadowFallback = l.tabsShadow ?? lightCardShadowFallback;
  const darkTabsShadowFallback = d.tabsShadow ?? darkCardShadowFallback;
  const lightSidebarShadowFallback = l.sidebarShadow ?? lightPanelShadowFallback ?? lightHeaderShadowFallback;
  const darkSidebarShadowFallback = d.sidebarShadow ?? darkPanelShadowFallback ?? darkHeaderShadowFallback;
  const lightStickyHeaderShadowFallback = l.stickyHeaderShadow ?? lightHeaderShadowFallback;
  const darkStickyHeaderShadowFallback = d.stickyHeaderShadow ?? darkHeaderShadowFallback;

  const lightStickyBorderFallback = sanitizeHex(
    lightIn.headerBorder ?? lightIn.borderPrimary,
    l.stickyHeaderBorder ?? l.headerBorder ?? l.borderPrimary
  );
  const darkStickyBorderFallback = sanitizeHex(
    darkIn.headerBorder ?? darkIn.borderPrimary,
    d.stickyHeaderBorder ?? d.headerBorder ?? d.borderPrimary
  );

  const lightResult: ThemeColorTokens = {
      bgPrimary: sanitizeHex(lightIn.bgPrimary, l.bgPrimary),
      bgSecondary: sanitizeHex(lightIn.bgSecondary, l.bgSecondary),
      panelBg: sanitizeHex(lightIn.panelBg ?? lightIn.bgSecondary, l.panelBg),
      heroBg: sanitizeHex(lightIn.heroBg ?? lightIn.bgSecondary, l.heroBg),
      bgTertiary: sanitizeHex(lightIn.bgTertiary, l.bgTertiary),
      bgQuaternary: sanitizeHex(lightIn.bgQuaternary, l.bgQuaternary),
      textPrimary: sanitizeHex(lightIn.textPrimary, l.textPrimary),
      textSecondary: sanitizeHex(lightIn.textSecondary, l.textSecondary),
      textTertiary: sanitizeHex(lightIn.textTertiary, l.textTertiary),
      borderPrimary: sanitizeHex(lightIn.borderPrimary, l.borderPrimary),
      borderSecondary: sanitizeHex(lightIn.borderSecondary, l.borderSecondary),
      accentPrimary: sanitizeHex(lightIn.accentPrimary, l.accentPrimary),
      accentHover: sanitizeHex(lightIn.accentHover, l.accentHover),
      headerBg: sanitizeHex(lightIn.headerBg, l.headerBg),
      headerOpacity: 1,
      headerText: sanitizeHex(lightIn.headerText, lightHeaderTextFallback),
      headerBlur: clampInt(lightIn.headerBlur, 0, 40, l.headerBlur ?? 12),
      headerBorder: sanitizeHex(lightIn.headerBorder, lightHeaderBorderFallback),
      headerBorderOpacity: 1,
      headerBorderWidth: clampInt(lightIn.headerBorderWidth, 0, 4, l.headerBorderWidth ?? 1),
      headerMenuFontSize: clampInt(lightIn.headerMenuFontSize, 10, 20, l.headerMenuFontSize ?? 14),
      headerMenuFontWeight: clampInt(lightIn.headerMenuFontWeight, 300, 800, l.headerMenuFontWeight ?? 400),
      fontFamily: sanitizeThemeFontFamily(lightIn.fontFamily, l.fontFamily ?? 'system'),
      stickyHeaderBg: sanitizeHex(lightIn.stickyHeaderBg, lightStickyBgFallback),
      stickyHeaderOpacity: 1,
      stickyHeaderBlur: clampInt(lightIn.stickyHeaderBlur, 0, 40, l.stickyHeaderBlur ?? 14),
      stickyHeaderText: sanitizeHex(lightIn.stickyHeaderText, lightStickyTextFallback),
      stickyHeaderBorder: sanitizeHex(lightIn.stickyHeaderBorder, lightStickyBorderFallback),
      stickyHeaderBorderOpacity: 1,
      stickyHeaderBorderWidth: clampInt(lightIn.stickyHeaderBorderWidth, 0, 4, l.stickyHeaderBorderWidth ?? l.headerBorderWidth ?? 1),
      sidebarBg: sanitizeHex(lightIn.sidebarBg, l.sidebarBg),
      sidebarOpacity: 1,
      sidebarBorder: sanitizeHex(lightIn.sidebarBorder, lightSidebarBorderFallback),
      headerShadow: sanitizeHex(lightIn.headerShadow, lightHeaderShadowFallback),
      headerShadowBlur: clampInt(lightIn.headerShadowBlur, 0, 80, l.headerShadowBlur ?? 30),
      headerShadowSpread: clampInt(lightIn.headerShadowSpread, -80, 80, l.headerShadowSpread ?? -22),
      surfaceRadius: clampInt(lightIn.surfaceRadius, 0, 32, l.surfaceRadius ?? 16),
      statCardAccentTop: clampInt(lightIn.statCardAccentTop, 0, 8, l.statCardAccentTop ?? 0),
      statCardAccentLeft: clampInt(lightIn.statCardAccentLeft, 0, 8, l.statCardAccentLeft ?? 0),
      panelShadow: sanitizeHex(lightIn.panelShadow, lightPanelShadowFallback),
      panelShadowBlur: clampInt(lightIn.panelShadowBlur, 0, 80, l.panelShadowBlur ?? l.cardShadowBlur ?? 18),
      panelShadowSpread: clampInt(lightIn.panelShadowSpread, -80, 80, l.panelShadowSpread ?? l.cardShadowSpread ?? -18),
      cardShadow: sanitizeHex(lightIn.cardShadow, lightCardShadowFallback),
      cardShadowBlur: clampInt(lightIn.cardShadowBlur, 0, 80, l.cardShadowBlur ?? 24),
      cardShadowSpread: clampInt(lightIn.cardShadowSpread, -80, 80, l.cardShadowSpread ?? -18),
      tabsShadow: sanitizeHex(lightIn.tabsShadow, lightTabsShadowFallback),
      tabsShadowBlur: clampInt(lightIn.tabsShadowBlur, 0, 80, l.tabsShadowBlur ?? l.cardShadowBlur ?? 24),
      tabsShadowSpread: clampInt(lightIn.tabsShadowSpread, -80, 80, l.tabsShadowSpread ?? l.cardShadowSpread ?? -18),
      sidebarShadow: sanitizeHex(lightIn.sidebarShadow, lightSidebarShadowFallback),
      sidebarShadowBlur: clampInt(
        lightIn.sidebarShadowBlur,
        0,
        80,
        l.sidebarShadowBlur ?? l.panelShadowBlur ?? l.cardShadowBlur ?? 18,
      ),
      sidebarShadowSpread: clampInt(
        lightIn.sidebarShadowSpread,
        -80,
        80,
        l.sidebarShadowSpread ?? l.panelShadowSpread ?? l.cardShadowSpread ?? -18,
      ),
      stickyHeaderShadow: sanitizeHex(lightIn.stickyHeaderShadow, lightStickyHeaderShadowFallback),
      stickyHeaderShadowBlur: clampInt(
        lightIn.stickyHeaderShadowBlur,
        0,
        80,
        l.stickyHeaderShadowBlur ?? l.headerShadowBlur ?? 30,
      ),
      stickyHeaderShadowSpread: clampInt(
        lightIn.stickyHeaderShadowSpread,
        -80,
        80,
        l.stickyHeaderShadowSpread ?? l.headerShadowSpread ?? -22,
      ),
      pageGradientFrom: lightPageFrom,
      pageGradientVia: lightPageVia,
      pageGradientTo: lightPageTo,
      heroGradientFrom: sanitizeHex(lightIn.heroGradientFrom, lightPageFrom),
      heroGradientVia: sanitizeHex(lightIn.heroGradientVia, lightPageVia),
      heroGradientTo: sanitizeHex(lightIn.heroGradientTo, lightPageTo),
      cardGradientFrom: sanitizeHex(lightIn.cardGradientFrom, lightPageFrom),
      cardGradientVia: sanitizeHex(lightIn.cardGradientVia, lightPageVia),
      cardGradientTo: sanitizeHex(lightIn.cardGradientTo, lightPageTo),
      tabsGradientFrom: sanitizeHex(lightIn.tabsGradientFrom, lightPageFrom),
      tabsGradientVia: sanitizeHex(lightIn.tabsGradientVia, lightPageVia),
      tabsGradientTo: sanitizeHex(lightIn.tabsGradientTo, lightPageTo),
      pageGlow: sanitizeHex(lightIn.pageGlow, l.pageGlow),
      glowOpacity: 1,
  };

  const darkResult: ThemeColorTokens = {
      bgPrimary: sanitizeHex(darkIn.bgPrimary, d.bgPrimary),
      bgSecondary: sanitizeHex(darkIn.bgSecondary, d.bgSecondary),
      panelBg: sanitizeHex(darkIn.panelBg ?? darkIn.bgSecondary, d.panelBg),
      heroBg: sanitizeHex(darkIn.heroBg ?? darkIn.bgSecondary, d.heroBg),
      bgTertiary: sanitizeHex(darkIn.bgTertiary, d.bgTertiary),
      bgQuaternary: sanitizeHex(darkIn.bgQuaternary, d.bgQuaternary),
      textPrimary: sanitizeHex(darkIn.textPrimary, d.textPrimary),
      textSecondary: sanitizeHex(darkIn.textSecondary, d.textSecondary),
      textTertiary: sanitizeHex(darkIn.textTertiary, d.textTertiary),
      borderPrimary: sanitizeHex(darkIn.borderPrimary, d.borderPrimary),
      borderSecondary: sanitizeHex(darkIn.borderSecondary, d.borderSecondary),
      accentPrimary: sanitizeHex(darkIn.accentPrimary, d.accentPrimary),
      accentHover: sanitizeHex(darkIn.accentHover, d.accentHover),
      headerBg: sanitizeHex(darkIn.headerBg, d.headerBg),
      headerOpacity: 1,
      headerText: sanitizeHex(darkIn.headerText, darkHeaderTextFallback),
      headerBlur: clampInt(darkIn.headerBlur, 0, 40, d.headerBlur ?? 12),
      headerBorder: sanitizeHex(darkIn.headerBorder, darkHeaderBorderFallback),
      headerBorderOpacity: 1,
      headerBorderWidth: clampInt(darkIn.headerBorderWidth, 0, 4, d.headerBorderWidth ?? 1),
      headerMenuFontSize: clampInt(darkIn.headerMenuFontSize, 10, 20, d.headerMenuFontSize ?? 14),
      headerMenuFontWeight: clampInt(darkIn.headerMenuFontWeight, 300, 800, d.headerMenuFontWeight ?? 400),
      fontFamily: sanitizeThemeFontFamily(darkIn.fontFamily, d.fontFamily ?? 'system'),
      stickyHeaderBg: sanitizeHex(darkIn.stickyHeaderBg, darkStickyBgFallback),
      stickyHeaderOpacity: 1,
      stickyHeaderBlur: clampInt(darkIn.stickyHeaderBlur, 0, 40, d.stickyHeaderBlur ?? 14),
      stickyHeaderText: sanitizeHex(darkIn.stickyHeaderText, darkStickyTextFallback),
      stickyHeaderBorder: sanitizeHex(darkIn.stickyHeaderBorder, darkStickyBorderFallback),
      stickyHeaderBorderOpacity: 1,
      stickyHeaderBorderWidth: clampInt(darkIn.stickyHeaderBorderWidth, 0, 4, d.stickyHeaderBorderWidth ?? d.headerBorderWidth ?? 1),
      sidebarBg: sanitizeHex(darkIn.sidebarBg, d.sidebarBg),
      sidebarOpacity: 1,
      sidebarBorder: sanitizeHex(darkIn.sidebarBorder, darkSidebarBorderFallback),
      headerShadow: sanitizeHex(darkIn.headerShadow, darkHeaderShadowFallback),
      headerShadowBlur: clampInt(darkIn.headerShadowBlur, 0, 80, d.headerShadowBlur ?? 30),
      headerShadowSpread: clampInt(darkIn.headerShadowSpread, -80, 80, d.headerShadowSpread ?? -22),
      surfaceRadius: clampInt(darkIn.surfaceRadius, 0, 32, d.surfaceRadius ?? 16),
      statCardAccentTop: clampInt(darkIn.statCardAccentTop, 0, 8, d.statCardAccentTop ?? 0),
      statCardAccentLeft: clampInt(darkIn.statCardAccentLeft, 0, 8, d.statCardAccentLeft ?? 0),
      panelShadow: sanitizeHex(darkIn.panelShadow, darkPanelShadowFallback),
      panelShadowBlur: clampInt(darkIn.panelShadowBlur, 0, 80, d.panelShadowBlur ?? d.cardShadowBlur ?? 18),
      panelShadowSpread: clampInt(darkIn.panelShadowSpread, -80, 80, d.panelShadowSpread ?? d.cardShadowSpread ?? -18),
      cardShadow: sanitizeHex(darkIn.cardShadow, darkCardShadowFallback),
      cardShadowBlur: clampInt(darkIn.cardShadowBlur, 0, 80, d.cardShadowBlur ?? 24),
      cardShadowSpread: clampInt(darkIn.cardShadowSpread, -80, 80, d.cardShadowSpread ?? -18),
      tabsShadow: sanitizeHex(darkIn.tabsShadow, darkTabsShadowFallback),
      tabsShadowBlur: clampInt(darkIn.tabsShadowBlur, 0, 80, d.tabsShadowBlur ?? d.cardShadowBlur ?? 24),
      tabsShadowSpread: clampInt(darkIn.tabsShadowSpread, -80, 80, d.tabsShadowSpread ?? d.cardShadowSpread ?? -18),
      sidebarShadow: sanitizeHex(darkIn.sidebarShadow, darkSidebarShadowFallback),
      sidebarShadowBlur: clampInt(
        darkIn.sidebarShadowBlur,
        0,
        80,
        d.sidebarShadowBlur ?? d.panelShadowBlur ?? d.cardShadowBlur ?? 18,
      ),
      sidebarShadowSpread: clampInt(
        darkIn.sidebarShadowSpread,
        -80,
        80,
        d.sidebarShadowSpread ?? d.panelShadowSpread ?? d.cardShadowSpread ?? -18,
      ),
      stickyHeaderShadow: sanitizeHex(darkIn.stickyHeaderShadow, darkStickyHeaderShadowFallback),
      stickyHeaderShadowBlur: clampInt(
        darkIn.stickyHeaderShadowBlur,
        0,
        80,
        d.stickyHeaderShadowBlur ?? d.headerShadowBlur ?? 30,
      ),
      stickyHeaderShadowSpread: clampInt(
        darkIn.stickyHeaderShadowSpread,
        -80,
        80,
        d.stickyHeaderShadowSpread ?? d.headerShadowSpread ?? -22,
      ),
      pageGradientFrom: darkPageFrom,
      pageGradientVia: darkPageVia,
      pageGradientTo: darkPageTo,
      heroGradientFrom: sanitizeHex(darkIn.heroGradientFrom, darkPageFrom),
      heroGradientVia: sanitizeHex(darkIn.heroGradientVia, darkPageVia),
      heroGradientTo: sanitizeHex(darkIn.heroGradientTo, darkPageTo),
      cardGradientFrom: sanitizeHex(darkIn.cardGradientFrom, darkPageFrom),
      cardGradientVia: sanitizeHex(darkIn.cardGradientVia, darkPageVia),
      cardGradientTo: sanitizeHex(darkIn.cardGradientTo, darkPageTo),
      tabsGradientFrom: sanitizeHex(darkIn.tabsGradientFrom, darkPageFrom),
      tabsGradientVia: sanitizeHex(darkIn.tabsGradientVia, darkPageVia),
      tabsGradientTo: sanitizeHex(darkIn.tabsGradientTo, darkPageTo),
      pageGlow: sanitizeHex(darkIn.pageGlow, d.pageGlow),
      glowOpacity: 1,
  };

  return {
    light: migrateModeOpacity(lightIn, lightResult),
    dark: migrateModeOpacity(darkIn, darkResult),
  };
};

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
        setSetting(SETTING_KEYS.THEME_CUSTOM_JS, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_JS]),
        setSetting(SETTING_KEYS.THEME_COLOR_PALETTE, SETTING_DEFAULTS[SETTING_KEYS.THEME_COLOR_PALETTE])
      ]);
      clearSettingsCache();
      revalidatePath('/', 'layout');
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

    const cssValidationError = validateThemeCustomCss(customCss);
    if (cssValidationError) {
      return NextResponse.json({ error: cssValidationError }, { status: 400 });
    }

    const headValidationError = validateThemeCustomMarkup('head', customHead);
    if (headValidationError) {
      return NextResponse.json({ error: headValidationError }, { status: 400 });
    }

    const bodyValidationError = validateThemeCustomMarkup('body', customBody);
    if (bodyValidationError) {
      return NextResponse.json({ error: bodyValidationError }, { status: 400 });
    }

    const colorPalette = sanitizePalette(body?.colorPalette);

    await Promise.all([
      setSetting(SETTING_KEYS.THEME_HEADER_LINKS, JSON.stringify(headerLinks)),
      setSetting(SETTING_KEYS.THEME_FOOTER_LINKS, JSON.stringify(footerLinks)),
      setSetting(SETTING_KEYS.THEME_FOOTER_TEXT, footerText),
      setSetting(SETTING_KEYS.THEME_CUSTOM_CSS, customCss),
      setSetting(SETTING_KEYS.THEME_CUSTOM_HEAD, customHead),
      setSetting(SETTING_KEYS.THEME_CUSTOM_BODY, customBody),
      setSetting(SETTING_KEYS.THEME_CUSTOM_JS, customBody),
      setSetting(SETTING_KEYS.THEME_COLOR_PALETTE, JSON.stringify(colorPalette))
    ]);
    clearSettingsCache();
    // Purge the Next.js Full Route Cache so the root layout re-renders
    // with the updated theme values on the very next page load.
    revalidatePath('/', 'layout');

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
