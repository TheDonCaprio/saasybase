import { prisma } from './prisma';
import { emitUnmigratedDbHealthWarningOnce, Logger } from './logger';
import {
  requiresFreePlanResetTracking,
  shouldResetFreePlanTokensAt,
  type FreePlanRenewalType,
} from './free-plan-renewal';

export type AppFormatMode =
  | 'short'
  | 'datetime'
  | 'iso'
  | 'locale'
  // admin-selectable custom formats
  | 'short-time-24'
  | 'short-year-time-24'
  | 'numeric-dmy-12'
  | 'numeric-dmy-24';

// Cache for settings to avoid redundant database hits within a single render.
// The TTL is intentionally short (5 s) so that after an admin saves new values
// the next page load always reads fresh data from the database, even when the
// save handler and the page renderer run in separate processes / workers.
const settingsCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL = 5 * 1000; // 5 seconds – just enough to deduplicate reads within one request
let settingTableMissing = false;

function isMissingSettingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('P2021') || message.includes('main.Setting') || message.includes('table `main.Setting` does not exist');
}

async function safeFindSettingKey(key: string): Promise<{ key: string } | null> {
  if (settingTableMissing) return null;
  try {
    return await prisma.setting.findUnique({ where: { key }, select: { key: true } });
  } catch (error) {
    if (isMissingSettingTableError(error)) {
      settingTableMissing = true;
      emitUnmigratedDbHealthWarningOnce('Setting');
      return null;
    }
    throw error;
  }
}

export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  if (settingTableMissing) {
    return defaultValue;
  }

  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const setting = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
    const value = setting?.value ?? defaultValue;
    settingsCache.set(key, { value, timestamp: Date.now() });
    return value;
  } catch (error) {
    if (isMissingSettingTableError(error)) {
      settingTableMissing = true;
      emitUnmigratedDbHealthWarningOnce('Setting');
      settingsCache.set(key, { value: defaultValue, timestamp: Date.now() });
      return defaultValue;
    }
    Logger.error('Error fetching setting', error);
    return defaultValue;
  }
}

export async function setSetting(key: string, value: string) {
  if (settingTableMissing) {
    settingsCache.set(key, { value, timestamp: Date.now() });
    return { key, value };
  }

  try {
    const existing = await prisma.setting.findUnique({ where: { key } });
    const result = existing
      ? await prisma.setting.update({ where: { key }, data: { value } })
      : await prisma.setting.create({ data: { key, value } });
    settingsCache.set(key, { value: result.value, timestamp: Date.now() });
    return result;
  } catch (error) {
    if (isMissingSettingTableError(error)) {
      settingTableMissing = true;
      emitUnmigratedDbHealthWarningOnce('Setting');
      settingsCache.set(key, { value, timestamp: Date.now() });
      return { key, value };
    }
    Logger.error('Error setting setting', error);
    throw error;
  }
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    result[key] = await getSetting(key);
  }
  return result;
}

/** Parse a JSON-serialised string[] setting value into a Set for O(1) lookups. */
export function parseStringListSetting(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    );
  } catch {
    return new Set();
  }
}

/**
 * Synchronous read from the in-memory settings cache.
 * Returns the last-known value (even if expired) or null if the key was never fetched.
 * Useful when an async call is not possible but a DB-backed override should be respected.
 */
export function getSettingCached(key: string): string | null {
  const cached = settingsCache.get(key);
  return cached?.value || null;
}

export const SETTING_KEYS = {
  SITE_NAME: 'SITE_NAME',
  SITE_LOGO: 'SITE_LOGO',
  SITE_LOGO_LIGHT: 'SITE_LOGO_LIGHT',
  SITE_LOGO_DARK: 'SITE_LOGO_DARK',
  SITE_LOGO_HEIGHT: 'SITE_LOGO_HEIGHT',
  SITE_FAVICON: 'SITE_FAVICON',
  SUPPORT_EMAIL: 'SUPPORT_EMAIL',
  DEFAULT_TOKEN_LABEL: 'DEFAULT_TOKEN_LABEL',
  SUPPORT_AUTO_SET_IN_PROGRESS: 'SUPPORT_AUTO_SET_IN_PROGRESS',
  ENABLE_RECURRING_PRORATION: 'ENABLE_RECURRING_PRORATION',
  DEFAULT_CURRENCY: 'DEFAULT_CURRENCY',
  ANNOUNCEMENT_MESSAGE: 'ANNOUNCEMENT_MESSAGE',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  FREE_PLAN_TOKEN_LIMIT: 'FREE_PLAN_TOKEN_LIMIT',
  FREE_PLAN_RENEWAL_TYPE: 'FREE_PLAN_RENEWAL_TYPE', 
  FREE_PLAN_TOKEN_NAME: 'FREE_PLAN_TOKEN_NAME',
  MODERATOR_PERMISSIONS: 'MODERATOR_PERMISSIONS',
  THEME_HEADER_LINKS: 'THEME_HEADER_LINKS',
  THEME_FOOTER_LINKS: 'THEME_FOOTER_LINKS',
  THEME_FOOTER_TEXT: 'THEME_FOOTER_TEXT',
  THEME_CUSTOM_CSS: 'THEME_CUSTOM_CSS',
  THEME_CUSTOM_JS: 'THEME_CUSTOM_JS',
  THEME_CUSTOM_HEAD: 'THEME_CUSTOM_HEAD',
  THEME_CUSTOM_BODY: 'THEME_CUSTOM_BODY',
  THEME_COLOR_PALETTE: 'THEME_COLOR_PALETTE',
  THEME_COLOR_PRESETS: 'THEME_COLOR_PRESETS',
  PRICING_MAX_COLUMNS: 'PRICING_MAX_COLUMNS',
  PRICING_CENTER_UNEVEN: 'PRICING_CENTER_UNEVEN',
  HEADER_STYLE: 'HEADER_STYLE',
  HEADER_HEIGHT: 'HEADER_HEIGHT',
  HEADER_STICKY_ENABLED: 'HEADER_STICKY_ENABLED',
  HEADER_STICKY_SCROLL_Y: 'HEADER_STICKY_SCROLL_Y',
  HEADER_STICKY_HEIGHT: 'HEADER_STICKY_HEIGHT',
  BLOG_LISTING_STYLE: 'BLOG_LISTING_STYLE',
  BLOG_LISTING_PAGE_SIZE: 'BLOG_LISTING_PAGE_SIZE',
  BLOG_SIDEBAR_ENABLED: 'BLOG_SIDEBAR_ENABLED',
  BLOG_SIDEBAR_ENABLED_INDEX: 'BLOG_SIDEBAR_ENABLED_INDEX',
  BLOG_SIDEBAR_ENABLED_PAGES: 'BLOG_SIDEBAR_ENABLED_PAGES',
  BLOG_SIDEBAR_ENABLED_SINGLE: 'BLOG_SIDEBAR_ENABLED_SINGLE',
  BLOG_SIDEBAR_ENABLED_ARCHIVE: 'BLOG_SIDEBAR_ENABLED_ARCHIVE',
  BLOG_SIDEBAR_SHOW_RECENT: 'BLOG_SIDEBAR_SHOW_RECENT',
  BLOG_SIDEBAR_RECENT_COUNT: 'BLOG_SIDEBAR_RECENT_COUNT',
  BLOG_SIDEBAR_CONTENT: 'BLOG_SIDEBAR_CONTENT',
  BLOG_SIDEBAR_HTML: 'BLOG_SIDEBAR_HTML',
  BLOG_SIDEBAR_WIDGET_ORDER: 'BLOG_SIDEBAR_WIDGET_ORDER'
  ,BLOG_RELATED_POSTS_ENABLED: 'BLOG_RELATED_POSTS_ENABLED'
  ,BLOG_HTML_BEFORE_FIRST_PARAGRAPH: 'BLOG_HTML_BEFORE_FIRST_PARAGRAPH'
  ,BLOG_HTML_AFTER_LAST_PARAGRAPH: 'BLOG_HTML_AFTER_LAST_PARAGRAPH'
  ,BLOG_HTML_MIDDLE_OF_POST: 'BLOG_HTML_MIDDLE_OF_POST'
  ,TOKENS_RESET_ON_EXPIRY_ONE_TIME: 'TOKENS_RESET_ON_EXPIRY_ONE_TIME'
  ,TOKENS_RESET_ON_EXPIRY_RECURRING: 'TOKENS_RESET_ON_EXPIRY_RECURRING'
  ,TOKENS_RESET_ON_RENEWAL_ONE_TIME: 'TOKENS_RESET_ON_RENEWAL_ONE_TIME'
  ,TOKENS_RESET_ON_RENEWAL_RECURRING: 'TOKENS_RESET_ON_RENEWAL_RECURRING'
  ,TOKENS_NATURAL_EXPIRY_GRACE_HOURS: 'TOKENS_NATURAL_EXPIRY_GRACE_HOURS'
  ,ADMIN_ACTION_NOTIFICATION_ACTIONS: 'ADMIN_ACTION_NOTIFICATION_ACTIONS'
  ,ADMIN_ALERT_EMAIL_TYPES: 'ADMIN_ALERT_EMAIL_TYPES'
  ,SUPPORT_EMAIL_NOTIFICATION_TYPES: 'SUPPORT_EMAIL_NOTIFICATION_TYPES'
} as const;

/**
 * Setting keys that are managed by the Admin Theme page and therefore considered
 * part of the "theme" snapshot (navigation, layout, pricing/blog presentation,
 * colors/presets, and custom code snippets).
 */
export const THEME_SETTING_KEYS = [
  SETTING_KEYS.THEME_HEADER_LINKS,
  SETTING_KEYS.THEME_FOOTER_LINKS,
  SETTING_KEYS.THEME_FOOTER_TEXT,
  SETTING_KEYS.THEME_CUSTOM_CSS,
  SETTING_KEYS.THEME_CUSTOM_JS,
  SETTING_KEYS.THEME_CUSTOM_HEAD,
  SETTING_KEYS.THEME_CUSTOM_BODY,
  SETTING_KEYS.THEME_COLOR_PALETTE,
  SETTING_KEYS.THEME_COLOR_PRESETS,
  SETTING_KEYS.HEADER_STYLE,
  SETTING_KEYS.HEADER_HEIGHT,
  SETTING_KEYS.HEADER_STICKY_ENABLED,
  SETTING_KEYS.HEADER_STICKY_SCROLL_Y,
  SETTING_KEYS.HEADER_STICKY_HEIGHT,
  SETTING_KEYS.PRICING_MAX_COLUMNS,
  SETTING_KEYS.PRICING_CENTER_UNEVEN,
  SETTING_KEYS.BLOG_LISTING_STYLE,
  SETTING_KEYS.BLOG_LISTING_PAGE_SIZE,
  SETTING_KEYS.BLOG_SIDEBAR_ENABLED,
  SETTING_KEYS.BLOG_SIDEBAR_ENABLED_INDEX,
  SETTING_KEYS.BLOG_SIDEBAR_ENABLED_PAGES,
  SETTING_KEYS.BLOG_SIDEBAR_ENABLED_SINGLE,
  SETTING_KEYS.BLOG_SIDEBAR_ENABLED_ARCHIVE,
  SETTING_KEYS.BLOG_SIDEBAR_SHOW_RECENT,
  SETTING_KEYS.BLOG_SIDEBAR_RECENT_COUNT,
  SETTING_KEYS.BLOG_SIDEBAR_CONTENT,
  SETTING_KEYS.BLOG_SIDEBAR_HTML,
  SETTING_KEYS.BLOG_SIDEBAR_WIDGET_ORDER,
  SETTING_KEYS.BLOG_RELATED_POSTS_ENABLED,
  SETTING_KEYS.BLOG_HTML_BEFORE_FIRST_PARAGRAPH,
  SETTING_KEYS.BLOG_HTML_AFTER_LAST_PARAGRAPH,
  SETTING_KEYS.BLOG_HTML_MIDDLE_OF_POST,
] as const;

export const THEME_SETTING_KEY_SET: ReadonlySet<string> = new Set<string>(THEME_SETTING_KEYS);

export type ThemeColorTokens = {
  bgPrimary: string;
  bgSecondary: string;
  panelBg: string;
  heroBg: string;
  bgTertiary: string;
  bgQuaternary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  borderPrimary: string;
  borderSecondary: string;
  accentPrimary: string;
  accentHover: string;
  headerBg: string;
  headerOpacity: number;
  headerText: string;
  headerBlur: number;
  headerBorder: string;
  headerBorderOpacity: number;
  headerBorderWidth: number;
  headerMenuFontSize: number;
  headerMenuFontWeight: number;
  fontFamily: 'system' | 'material' | 'fluent' | 'apple';
  stickyHeaderBg: string;
  stickyHeaderOpacity: number;
  stickyHeaderBlur: number;
  stickyHeaderText: string;
  stickyHeaderBorder: string;
  stickyHeaderBorderOpacity: number;
  stickyHeaderBorderWidth: number;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarOpacity: number;
  headerShadow: string;
  headerShadowBlur: number;
  headerShadowSpread: number;
  surfaceRadius: number;
  statCardAccentTop: number;
  statCardAccentLeft: number;
  panelShadow: string;
  panelShadowBlur: number;
  panelShadowSpread: number;
  cardShadow: string;
  cardShadowBlur: number;
  cardShadowSpread: number;
  tabsShadow: string;
  tabsShadowBlur: number;
  tabsShadowSpread: number;
  sidebarShadow: string;
  sidebarShadowBlur: number;
  sidebarShadowSpread: number;
  stickyHeaderShadow: string;
  stickyHeaderShadowBlur: number;
  stickyHeaderShadowSpread: number;
  pageGradientFrom: string;
  pageGradientVia: string;
  pageGradientTo: string;
  heroGradientFrom: string;
  heroGradientVia: string;
  heroGradientTo: string;
  cardGradientFrom: string;
  cardGradientVia: string;
  cardGradientTo: string;
  tabsGradientFrom: string;
  tabsGradientVia: string;
  tabsGradientTo: string;
  pageGlow: string;
  glowOpacity: number;
};

export type ThemeColorPalette = { light: ThemeColorTokens; dark: ThemeColorTokens };

export interface ThemeColorPreset {
  name: string;
  light: ThemeColorTokens;
  dark: ThemeColorTokens;
}

export const DEFAULT_THEME_COLOR_PALETTE: ThemeColorPalette = {
  light: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f9fafb',
    panelBg: '#f9fafb',
    heroBg: '#f9fafb',
    bgTertiary: '#f3f4f6',
    bgQuaternary: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textTertiary: '#6b7280',
    borderPrimary: '#d1d5db',
    borderSecondary: '#9ca3af',
    accentPrimary: '#3b82f6',
    accentHover: '#2563eb',
    headerBg: '#ffffff37',
    headerOpacity: 1,
    headerText: '#111827',
    headerBlur: 20,
    headerBorder: '#d1d5db4c',
    headerBorderOpacity: 1,
    headerBorderWidth: 1,
    headerMenuFontSize: 14,
    headerMenuFontWeight: 600,
    fontFamily: 'system',
    stickyHeaderBg: '#ffffff3e',
    stickyHeaderOpacity: 1,
    stickyHeaderBlur: 15,
    stickyHeaderText: '#111827',
    stickyHeaderBorder: '#cccfd420',
    stickyHeaderBorderOpacity: 1,
    stickyHeaderBorderWidth: 1,
    sidebarBg: '#ffffff80',
    sidebarBorder: '#ececec6c',
    sidebarOpacity: 1,
    headerShadow: '#00000062',
    headerShadowBlur: 30,
    headerShadowSpread: -27,
    surfaceRadius: 16,
    statCardAccentTop: 0,
    statCardAccentLeft: 0,
    panelShadow: '#0f172a10',
    panelShadowBlur: 18,
    panelShadowSpread: -18,
    cardShadow: '#0f172a12',
    cardShadowBlur: 24,
    cardShadowSpread: -18,
    tabsShadow: '#0f172a10',
    tabsShadowBlur: 20,
    tabsShadowSpread: -16,
    sidebarShadow: '#0f172a14',
    sidebarShadowBlur: 22,
    sidebarShadowSpread: -20,
    stickyHeaderShadow: '#9e9c9cef',
    stickyHeaderShadowBlur: 30,
    stickyHeaderShadowSpread: -23,
    pageGradientFrom: '#ffffff',
    pageGradientVia: '#d8ecfa',
    pageGradientTo: '#ffffff',
    heroGradientFrom: '#f0f9ff00',
    heroGradientVia: '#eef2ff',
    heroGradientTo: '#ffffff',
    cardGradientFrom: '#f0f9ff',
    cardGradientVia: '#eef2ff',
    cardGradientTo: '#ffffff',
    tabsGradientFrom: '#ffffff',
    tabsGradientVia: '#eef2ff',
    tabsGradientTo: '#ffffff',
    pageGlow: '#3b82f673',
    glowOpacity: 1,
  },
  dark: {
    bgPrimary: '#0a0a0a',
    bgSecondary: '#171717',
    panelBg: '#171717',
    heroBg: '#171717',
    bgTertiary: '#262626',
    bgQuaternary: '#404040',
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
    borderPrimary: '#4040407f',
    borderSecondary: '#4d4d4dc3',
    accentPrimary: '#3b82f6',
    accentHover: '#2563eb',
    headerBg: '#0a0a0a3e',
    headerOpacity: 1,
    headerText: '#f5f5f5',
    headerBlur: 12,
    headerBorder: '#31313179',
    headerBorderOpacity: 1,
    headerBorderWidth: 1,
    headerMenuFontSize: 14,
    headerMenuFontWeight: 600,
    fontFamily: 'system',
    stickyHeaderBg: '#0a0a0a35',
    stickyHeaderOpacity: 1,
    stickyHeaderBlur: 15,
    stickyHeaderText: '#f5f5f5',
    stickyHeaderBorder: '#40404000',
    stickyHeaderBorderOpacity: 1,
    stickyHeaderBorderWidth: 1,
    sidebarBg: '#1717175d',
    sidebarBorder: '#40404000',
    sidebarOpacity: 1,
    headerShadow: '#8e8e8e61',
    headerShadowBlur: 30,
    headerShadowSpread: -23,
    surfaceRadius: 16,
    statCardAccentTop: 0,
    statCardAccentLeft: 0,
    panelShadow: '#00000040',
    panelShadowBlur: 18,
    panelShadowSpread: -18,
    cardShadow: '#00000052',
    cardShadowBlur: 26,
    cardShadowSpread: -18,
    tabsShadow: '#00000042',
    tabsShadowBlur: 22,
    tabsShadowSpread: -16,
    sidebarShadow: '#0000004f',
    sidebarShadowBlur: 24,
    sidebarShadowSpread: -22,
    stickyHeaderShadow: '#6f6f6f7d',
    stickyHeaderShadowBlur: 30,
    stickyHeaderShadowSpread: -19,
    pageGradientFrom: '#171717',
    pageGradientVia: '#312e81',
    pageGradientTo: '#0a0a0a',
    heroGradientFrom: '#171717',
    heroGradientVia: '#312e81',
    heroGradientTo: '#0a0a0a',
    cardGradientFrom: '#171717',
    cardGradientVia: '#312e81',
    cardGradientTo: '#0a0a0a',
    tabsGradientFrom: '#171717',
    tabsGradientVia: '#312e81',
    tabsGradientTo: '#0a0a0a',
    pageGlow: '#6366f1c7',
    glowOpacity: 1,
  },
};

export const SETTING_DEFAULTS = {
  [SETTING_KEYS.SITE_LOGO]: '',
  [SETTING_KEYS.SITE_LOGO_LIGHT]: '',
  [SETTING_KEYS.SITE_LOGO_DARK]: '',
  [SETTING_KEYS.SITE_LOGO_HEIGHT]: '48',
  [SETTING_KEYS.SITE_FAVICON]: '/favicon.ico',
  [SETTING_KEYS.SITE_NAME]: 'SaaSyBase',
    [SETTING_KEYS.SUPPORT_EMAIL]: 'support@saasybase.com',
  [SETTING_KEYS.DEFAULT_TOKEN_LABEL]: 'tokens',
  // When true, admin replies will automatically set an OPEN ticket to IN_PROGRESS
  [SETTING_KEYS.SUPPORT_AUTO_SET_IN_PROGRESS]: 'true',
  [SETTING_KEYS.ENABLE_RECURRING_PRORATION]: 'true',
  [SETTING_KEYS.ANNOUNCEMENT_MESSAGE]: '',
  [SETTING_KEYS.MAINTENANCE_MODE]: 'false',
  [SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT]: '5',
  [SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]: 'daily', // 'unlimited', 'daily', 'monthly', 'one-time'
  [SETTING_KEYS.FREE_PLAN_TOKEN_NAME]: '', // empty means use default token label
  [SETTING_KEYS.MODERATOR_PERMISSIONS]: '{"users":true,"transactions":true,"purchases":true,"subscriptions":true,"support":true,"notifications":true,"blog":true,"analytics":false,"traffic":false}',
  [SETTING_KEYS.THEME_HEADER_LINKS]: '[{"label":"Home","href":"/"},{"label":"Dashboard","href":"/dashboard"},{"label":"Pricing","href":"/pricing"}]',
  [SETTING_KEYS.THEME_FOOTER_LINKS]: '[{"label":"Privacy","href":"/privacy"},{"label":"Terms","href":"/terms"},{"label":"Contact","href":"/contact"}]',
  [SETTING_KEYS.BLOG_LISTING_STYLE]: 'grid',
  [SETTING_KEYS.BLOG_LISTING_PAGE_SIZE]: '10',
  [SETTING_KEYS.BLOG_SIDEBAR_ENABLED]: 'false',
  [SETTING_KEYS.BLOG_SIDEBAR_ENABLED_INDEX]: 'false',
  [SETTING_KEYS.BLOG_SIDEBAR_ENABLED_PAGES]: 'false',
  [SETTING_KEYS.BLOG_SIDEBAR_ENABLED_ARCHIVE]: 'false',
  [SETTING_KEYS.BLOG_SIDEBAR_ENABLED_SINGLE]: 'false',
  [SETTING_KEYS.BLOG_SIDEBAR_SHOW_RECENT]: 'true',
  [SETTING_KEYS.BLOG_SIDEBAR_RECENT_COUNT]: '5',
  [SETTING_KEYS.BLOG_SIDEBAR_CONTENT]: '',
  [SETTING_KEYS.BLOG_SIDEBAR_HTML]: '',
  [SETTING_KEYS.BLOG_SIDEBAR_WIDGET_ORDER]: 'recent-posts,rich-content,raw-html',
  [SETTING_KEYS.BLOG_RELATED_POSTS_ENABLED]: 'false',
  [SETTING_KEYS.BLOG_HTML_BEFORE_FIRST_PARAGRAPH]: '',
  [SETTING_KEYS.BLOG_HTML_AFTER_LAST_PARAGRAPH]: '',
  [SETTING_KEYS.BLOG_HTML_MIDDLE_OF_POST]: '',
  [SETTING_KEYS.THEME_FOOTER_TEXT]: '© {{year}} {{siteName}}. All rights reserved.',
  [SETTING_KEYS.THEME_CUSTOM_CSS]: '',
  [SETTING_KEYS.THEME_CUSTOM_JS]: '',
  [SETTING_KEYS.THEME_CUSTOM_HEAD]: '',
  [SETTING_KEYS.THEME_CUSTOM_BODY]: '',
  [SETTING_KEYS.THEME_COLOR_PALETTE]: JSON.stringify(DEFAULT_THEME_COLOR_PALETTE),
  [SETTING_KEYS.THEME_COLOR_PRESETS]: '[]',
  [SETTING_KEYS.PRICING_MAX_COLUMNS]: '3',
  [SETTING_KEYS.PRICING_CENTER_UNEVEN]: 'true',
  [SETTING_KEYS.HEADER_STYLE]: 'center-nav',
  [SETTING_KEYS.HEADER_HEIGHT]: '60',
  [SETTING_KEYS.HEADER_STICKY_ENABLED]: 'true',
  [SETTING_KEYS.HEADER_STICKY_SCROLL_Y]: '100',
  [SETTING_KEYS.HEADER_STICKY_HEIGHT]: '50'
  ,[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_ONE_TIME]: 'true'
  ,[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_RECURRING]: 'true'
  ,[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_ONE_TIME]: 'false'
  ,[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_RECURRING]: 'false'
  ,[SETTING_KEYS.TOKENS_NATURAL_EXPIRY_GRACE_HOURS]: '24'
  ,[SETTING_KEYS.ADMIN_ACTION_NOTIFICATION_ACTIONS]: '[]'
  ,[SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES]: '["refund","new_purchase","renewal","upgrade","downgrade","payment_failed","dispute","other"]'
  ,[SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES]: '["new_ticket_to_admin","admin_reply_to_user","user_reply_to_admin"]'
} as const;

const THEME_HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const sanitizeThemeHex = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return THEME_HEX_RE.test(trimmed) ? trimmed.toLowerCase() : fallback;
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
  return value === 'material' || value === 'fluent' || value === 'apple' || value === 'system'
    ? value
    : fallback;
};

const mergeThemeColorTokens = (raw: unknown, fallback: ThemeColorTokens): ThemeColorTokens => {
  const rec = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const legacySurface = rec.bgSecondary;
  const pageFrom = sanitizeThemeHex(rec.pageGradientFrom, fallback.pageGradientFrom);
  const pageVia = sanitizeThemeHex(rec.pageGradientVia, fallback.pageGradientVia);
  const pageTo = sanitizeThemeHex(rec.pageGradientTo, fallback.pageGradientTo);
  const stickyBgFallback = sanitizeThemeHex(rec.headerBg, fallback.stickyHeaderBg ?? fallback.headerBg);
  const stickyTextFallback = sanitizeThemeHex(rec.textPrimary, fallback.stickyHeaderText ?? fallback.textPrimary);
  const headerTextFallback = sanitizeThemeHex(rec.textPrimary, fallback.headerText ?? fallback.textPrimary);
  const headerBorderFallback = sanitizeThemeHex(rec.borderPrimary, fallback.headerBorder ?? fallback.borderPrimary);
  const stickyBorderFallback = sanitizeThemeHex(rec.headerBorder ?? rec.borderPrimary, fallback.stickyHeaderBorder ?? fallback.headerBorder ?? fallback.borderPrimary);
  const sidebarBorderFallback = sanitizeThemeHex(rec.borderPrimary, fallback.sidebarBorder ?? fallback.borderPrimary);
  const headerShadowFallback = fallback.headerShadow ?? '#00000014';
  const panelShadowFallback = fallback.panelShadow ?? fallback.cardShadow ?? '#00000012';
  const cardShadowFallback = fallback.cardShadow ?? '#00000014';
  const tabsShadowFallback = fallback.tabsShadow ?? cardShadowFallback;
  const sidebarShadowFallback = fallback.sidebarShadow ?? panelShadowFallback ?? headerShadowFallback;
  const stickyHeaderShadowFallback = fallback.stickyHeaderShadow ?? headerShadowFallback;

  /** Bake a legacy 0-1 opacity into the hex alpha channel and reset opacity to 1. */
  const bakeOpacity = (hex: string, opacity: number): string => {
    if (opacity >= 1) return hex;
    const clean = hex.replace(/^#/, '');
    const existingA = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    const newA = Math.max(0, Math.min(1, existingA * opacity));
    const aByte = Math.round(newA * 255).toString(16).padStart(2, '0');
    return `#${clean.slice(0, 6)}${aByte}`;
  };

  const result: ThemeColorTokens = {
    bgPrimary: sanitizeThemeHex(rec.bgPrimary, fallback.bgPrimary),
    bgSecondary: sanitizeThemeHex(rec.bgSecondary, fallback.bgSecondary),
    panelBg: sanitizeThemeHex(rec.panelBg ?? legacySurface, fallback.panelBg),
    heroBg: sanitizeThemeHex(rec.heroBg ?? legacySurface, fallback.heroBg),
    bgTertiary: sanitizeThemeHex(rec.bgTertiary, fallback.bgTertiary),
    bgQuaternary: sanitizeThemeHex(rec.bgQuaternary, fallback.bgQuaternary),
    textPrimary: sanitizeThemeHex(rec.textPrimary, fallback.textPrimary),
    textSecondary: sanitizeThemeHex(rec.textSecondary, fallback.textSecondary),
    textTertiary: sanitizeThemeHex(rec.textTertiary, fallback.textTertiary),
    borderPrimary: sanitizeThemeHex(rec.borderPrimary, fallback.borderPrimary),
    borderSecondary: sanitizeThemeHex(rec.borderSecondary, fallback.borderSecondary),
    accentPrimary: sanitizeThemeHex(rec.accentPrimary, fallback.accentPrimary),
    accentHover: sanitizeThemeHex(rec.accentHover, fallback.accentHover),
    headerBg: sanitizeThemeHex(rec.headerBg, fallback.headerBg),
    headerOpacity: 1,
    headerText: sanitizeThemeHex(rec.headerText, headerTextFallback),
    headerBlur: clampInt(rec.headerBlur, 0, 40, fallback.headerBlur ?? 12),
    headerBorder: sanitizeThemeHex(rec.headerBorder, headerBorderFallback),
    headerBorderOpacity: 1,
    headerBorderWidth: clampInt(rec.headerBorderWidth, 0, 4, fallback.headerBorderWidth ?? 1),
    headerMenuFontSize: clampInt(rec.headerMenuFontSize, 10, 20, fallback.headerMenuFontSize ?? 14),
    headerMenuFontWeight: clampInt(rec.headerMenuFontWeight, 300, 800, fallback.headerMenuFontWeight ?? 400),
    fontFamily: sanitizeThemeFontFamily(rec.fontFamily, fallback.fontFamily ?? 'system'),
    stickyHeaderBg: sanitizeThemeHex(rec.stickyHeaderBg, stickyBgFallback),
    stickyHeaderOpacity: 1,
    stickyHeaderBlur: clampInt(rec.stickyHeaderBlur, 0, 40, fallback.stickyHeaderBlur ?? 14),
    stickyHeaderText: sanitizeThemeHex(rec.stickyHeaderText, stickyTextFallback),
    stickyHeaderBorder: sanitizeThemeHex(rec.stickyHeaderBorder, stickyBorderFallback),
    stickyHeaderBorderOpacity: 1,
    stickyHeaderBorderWidth: clampInt(rec.stickyHeaderBorderWidth, 0, 4, fallback.stickyHeaderBorderWidth ?? fallback.headerBorderWidth ?? 1),
    sidebarBg: sanitizeThemeHex(rec.sidebarBg, fallback.sidebarBg),
    sidebarBorder: sanitizeThemeHex(rec.sidebarBorder, sidebarBorderFallback),
    sidebarOpacity: 1,
    headerShadow: sanitizeThemeHex(rec.headerShadow, headerShadowFallback),
    headerShadowBlur: clampInt(rec.headerShadowBlur, 0, 80, fallback.headerShadowBlur ?? 30),
    headerShadowSpread: clampInt(rec.headerShadowSpread, -80, 80, fallback.headerShadowSpread ?? -22),
    surfaceRadius: clampInt(rec.surfaceRadius, 0, 32, fallback.surfaceRadius ?? 16),
    statCardAccentTop: clampInt(rec.statCardAccentTop, 0, 8, fallback.statCardAccentTop ?? 0),
    statCardAccentLeft: clampInt(rec.statCardAccentLeft, 0, 8, fallback.statCardAccentLeft ?? 0),
    panelShadow: sanitizeThemeHex(rec.panelShadow, panelShadowFallback),
    panelShadowBlur: clampInt(rec.panelShadowBlur, 0, 80, fallback.panelShadowBlur ?? fallback.cardShadowBlur ?? 18),
    panelShadowSpread: clampInt(rec.panelShadowSpread, -80, 80, fallback.panelShadowSpread ?? fallback.cardShadowSpread ?? -18),
    cardShadow: sanitizeThemeHex(rec.cardShadow, cardShadowFallback),
    cardShadowBlur: clampInt(rec.cardShadowBlur, 0, 80, fallback.cardShadowBlur ?? 24),
    cardShadowSpread: clampInt(rec.cardShadowSpread, -80, 80, fallback.cardShadowSpread ?? -18),
    tabsShadow: sanitizeThemeHex(rec.tabsShadow, tabsShadowFallback),
    tabsShadowBlur: clampInt(rec.tabsShadowBlur, 0, 80, fallback.tabsShadowBlur ?? fallback.cardShadowBlur ?? 24),
    tabsShadowSpread: clampInt(rec.tabsShadowSpread, -80, 80, fallback.tabsShadowSpread ?? fallback.cardShadowSpread ?? -18),
    sidebarShadow: sanitizeThemeHex(rec.sidebarShadow, sidebarShadowFallback),
    sidebarShadowBlur: clampInt(
      rec.sidebarShadowBlur,
      0,
      80,
      fallback.sidebarShadowBlur ?? fallback.panelShadowBlur ?? fallback.cardShadowBlur ?? 18,
    ),
    sidebarShadowSpread: clampInt(
      rec.sidebarShadowSpread,
      -80,
      80,
      fallback.sidebarShadowSpread ?? fallback.panelShadowSpread ?? fallback.cardShadowSpread ?? -18,
    ),
    stickyHeaderShadow: sanitizeThemeHex(rec.stickyHeaderShadow, stickyHeaderShadowFallback),
    stickyHeaderShadowBlur: clampInt(
      rec.stickyHeaderShadowBlur,
      0,
      80,
      fallback.stickyHeaderShadowBlur ?? fallback.headerShadowBlur ?? 30,
    ),
    stickyHeaderShadowSpread: clampInt(
      rec.stickyHeaderShadowSpread,
      -80,
      80,
      fallback.stickyHeaderShadowSpread ?? fallback.headerShadowSpread ?? -22,
    ),
    pageGradientFrom: pageFrom,
    pageGradientVia: pageVia,
    pageGradientTo: pageTo,
    heroGradientFrom: sanitizeThemeHex(rec.heroGradientFrom, pageFrom),
    heroGradientVia: sanitizeThemeHex(rec.heroGradientVia, pageVia),
    heroGradientTo: sanitizeThemeHex(rec.heroGradientTo, pageTo),
    cardGradientFrom: sanitizeThemeHex(rec.cardGradientFrom, pageFrom),
    cardGradientVia: sanitizeThemeHex(rec.cardGradientVia, pageVia),
    cardGradientTo: sanitizeThemeHex(rec.cardGradientTo, pageTo),
    tabsGradientFrom: sanitizeThemeHex(rec.tabsGradientFrom, pageFrom),
    tabsGradientVia: sanitizeThemeHex(rec.tabsGradientVia, pageVia),
    tabsGradientTo: sanitizeThemeHex(rec.tabsGradientTo, pageTo),
    pageGlow: sanitizeThemeHex(rec.pageGlow, fallback.pageGlow),
    glowOpacity: 1,
  };

  /* ── Migrate legacy opacity fields into hex alpha ─────────── */
  const legacyHeaderOpacity = clamp01(rec.headerOpacity, 1);
  const legacyHeaderBorderOpacity = clamp01(rec.headerBorderOpacity, 1);
  const legacyStickyHeaderOpacity = clamp01(rec.stickyHeaderOpacity, 1);
  const legacyStickyHeaderBorderOpacity = clamp01(rec.stickyHeaderBorderOpacity, 1);
  const legacySidebarOpacity = clamp01(rec.sidebarOpacity, 1);
  const legacyGlowOpacity = clamp01(rec.glowOpacity, 1);

  result.headerBg = bakeOpacity(result.headerBg, legacyHeaderOpacity);
  result.headerBorder = bakeOpacity(result.headerBorder, legacyHeaderBorderOpacity);
  result.stickyHeaderBg = bakeOpacity(result.stickyHeaderBg, legacyStickyHeaderOpacity);
  result.stickyHeaderBorder = bakeOpacity(result.stickyHeaderBorder, legacyStickyHeaderBorderOpacity);
  result.sidebarBg = bakeOpacity(result.sidebarBg, legacySidebarOpacity);
  result.pageGlow = bakeOpacity(result.pageGlow, legacyGlowOpacity);

  return result;
};

const MAX_THEME_COLOR_PRESETS = 25;
const MAX_THEME_PRESET_NAME_CHARS = 48;

const normalizeThemeColorPresets = (raw: string): ThemeColorPreset[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const presets: ThemeColorPreset[] = [];
    const seen = new Set<string>();

    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, MAX_THEME_PRESET_NAME_CHARS) : '';
      if (!name) continue;
      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      presets.push({
        name,
        light: mergeThemeColorTokens(rec.light, DEFAULT_THEME_COLOR_PALETTE.light),
        dark: mergeThemeColorTokens(rec.dark, DEFAULT_THEME_COLOR_PALETTE.dark),
      });

      if (presets.length >= MAX_THEME_COLOR_PRESETS) break;
    }

    return presets;
  } catch {
    return [];
  }
};

export async function getThemeColorPalette(): Promise<ThemeColorPalette> {
  const raw = await getSetting(SETTING_KEYS.THEME_COLOR_PALETTE, SETTING_DEFAULTS[SETTING_KEYS.THEME_COLOR_PALETTE]);
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rec = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>) : {};
    return {
      light: mergeThemeColorTokens(rec.light, DEFAULT_THEME_COLOR_PALETTE.light),
      dark: mergeThemeColorTokens(rec.dark, DEFAULT_THEME_COLOR_PALETTE.dark),
    };
  } catch {
    return DEFAULT_THEME_COLOR_PALETTE;
  }
}

export async function getThemeColorPresets(): Promise<ThemeColorPreset[]> {
  const raw = await getSetting(SETTING_KEYS.THEME_COLOR_PRESETS, SETTING_DEFAULTS[SETTING_KEYS.THEME_COLOR_PRESETS]);
  return normalizeThemeColorPresets(raw);
}

export interface ThemeLink {
  label: string;
  href: string;
}

export interface ThemeSettings {
  headerLinks: ThemeLink[];
  footerLinks: ThemeLink[];
  footerText: string;
  customCss: string;
  customJs: string;
}

const MAX_THEME_LINKS = 10;
const MAX_THEME_LABEL_CHARS = 64;
const MAX_THEME_HREF_CHARS = 2048;

export const DEFAULT_THEME_HEADER_LINKS: ThemeLink[] = JSON.parse(SETTING_DEFAULTS[SETTING_KEYS.THEME_HEADER_LINKS]) as ThemeLink[];
export const DEFAULT_THEME_FOOTER_LINKS: ThemeLink[] = JSON.parse(SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_LINKS]) as ThemeLink[];

const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizeThemeLinks = (raw: string, fallback: ThemeLink[]): ThemeLink[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = ensureArray(parsed);
    const normalized: ThemeLink[] = [];
    for (const item of entries) {
      if (typeof item !== 'object' || item === null) continue;
      const label = typeof (item as { label?: unknown }).label === 'string' ? (item as { label: string }).label.trim() : '';
      const href = typeof (item as { href?: unknown }).href === 'string' ? (item as { href: string }).href.trim() : '';
      if (!label || !href) continue;
      const sanitizedLabel = label.slice(0, MAX_THEME_LABEL_CHARS);
      const sanitizedHref = href.slice(0, MAX_THEME_HREF_CHARS);
      normalized.push({ label: sanitizedLabel, href: sanitizedHref });
      if (normalized.length >= MAX_THEME_LINKS) break;
    }
    if (normalized.length) {
      return normalized;
    }
  } catch (error) {
    Logger.warn('Failed to parse theme links', error);
  }
  return fallback;
};

export async function getSupportEmail(): Promise<string> {
  return getSetting(SETTING_KEYS.SUPPORT_EMAIL, SETTING_DEFAULTS[SETTING_KEYS.SUPPORT_EMAIL]);
}

export async function getSiteName(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_NAME, SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]);
}

export async function getSiteLogo(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_LOGO, SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO]);
}

export async function getSiteLogoLight(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_LOGO_LIGHT, SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_LIGHT]);
}

export async function getSiteLogoDark(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_LOGO_DARK, SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_DARK]);
}

export async function getSiteLogoHeight(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_LOGO_HEIGHT, String(SETTING_DEFAULTS[SETTING_KEYS.SITE_LOGO_HEIGHT]));
}

export async function getSiteFavicon(): Promise<string> {
  return getSetting(SETTING_KEYS.SITE_FAVICON, SETTING_DEFAULTS[SETTING_KEYS.SITE_FAVICON]);
}

export async function getAnnouncementMessage(): Promise<string> {
  return getSetting(SETTING_KEYS.ANNOUNCEMENT_MESSAGE, SETTING_DEFAULTS[SETTING_KEYS.ANNOUNCEMENT_MESSAGE]);
}

export async function getDefaultTokenLabel(): Promise<string> {
  const label = await getSetting(
    SETTING_KEYS.DEFAULT_TOKEN_LABEL,
    SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL]
  );
  const trimmed = label.trim();
  return trimmed === '' ? SETTING_DEFAULTS[SETTING_KEYS.DEFAULT_TOKEN_LABEL] : trimmed;
}

export async function getFormatSetting(): Promise<{ mode: AppFormatMode; timezone?: string }> {
  const mode = (await getSetting('format.mode', 'short')) as AppFormatMode;
  const timezone = await getSetting('format.timezone', '');
  return { mode, timezone: timezone || undefined };
}

export async function getThemeHeaderLinks(): Promise<ThemeLink[]> {
  const raw = await getSetting(SETTING_KEYS.THEME_HEADER_LINKS, SETTING_DEFAULTS[SETTING_KEYS.THEME_HEADER_LINKS]);
  return normalizeThemeLinks(raw, DEFAULT_THEME_HEADER_LINKS);
}

export async function getThemeFooterLinks(): Promise<ThemeLink[]> {
  const raw = await getSetting(SETTING_KEYS.THEME_FOOTER_LINKS, SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_LINKS]);
  return normalizeThemeLinks(raw, DEFAULT_THEME_FOOTER_LINKS);
}

export async function isRecurringProrationEnabled(): Promise<boolean> {
  const raw = await getSetting(
    SETTING_KEYS.ENABLE_RECURRING_PRORATION,
    SETTING_DEFAULTS[SETTING_KEYS.ENABLE_RECURRING_PRORATION]
  );
  return raw !== 'false';
}

export function isRecurringPlan(plan?: { autoRenew?: boolean | null }): boolean {
  return plan?.autoRenew === true;
}

export async function getThemeFooterTextRaw(): Promise<string> {
  return getSetting(SETTING_KEYS.THEME_FOOTER_TEXT, SETTING_DEFAULTS[SETTING_KEYS.THEME_FOOTER_TEXT]);
}

export async function getThemeFooterText(siteName?: string): Promise<string> {
  const raw = await getThemeFooterTextRaw();
  const year = new Date().getFullYear().toString();
  const effectiveSiteName = siteName || (await getSiteName().catch(() => SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]));
  return raw
    .replace(/\{\{year\}\}/gi, year)
    .replace(/\{\{site(name)?\}\}/gi, effectiveSiteName);
}

export async function getThemeCustomCss(): Promise<string> {
  return getSetting(SETTING_KEYS.THEME_CUSTOM_CSS, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_CSS]);
}

export async function getThemeCustomJs(): Promise<string> {
  return getSetting(SETTING_KEYS.THEME_CUSTOM_JS, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_JS]);
}

export async function getThemeCustomSnippet(): Promise<string> {
  const bodySnippet = await getSetting(SETTING_KEYS.THEME_CUSTOM_BODY, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_BODY]);
  if (bodySnippet && bodySnippet.trim().length > 0) {
    return bodySnippet;
  }
  return getThemeCustomJs();
}

export async function getThemeCustomHeadSnippet(): Promise<string> {
  return getSetting(SETTING_KEYS.THEME_CUSTOM_HEAD, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_HEAD]);
}

export async function getThemeCustomBodySnippet(): Promise<string> {
  return getSetting(SETTING_KEYS.THEME_CUSTOM_BODY, SETTING_DEFAULTS[SETTING_KEYS.THEME_CUSTOM_BODY]);
}

/**
 * Get effective format settings for a given user. User timezone overrides admin timezone.
 */
export async function getUserFormatSetting(userId?: string): Promise<{ mode: AppFormatMode; timezone?: string }>{
  const admin = await getFormatSetting();
  if (!userId) return admin;

  try {
    const userTz = await prisma.userSetting.findFirst({ where: { userId, key: 'TIMEZONE' }, select: { value: true } });
    const tz = userTz?.value || undefined;
    return { mode: admin.mode, timezone: tz || admin.timezone };
  } catch (e) {
    void e;
    // On error, return admin settings
    return admin;
  }
}

/**
 * Clear cached settings. If `key` is provided only that entry is removed,
 * otherwise the whole cache is cleared.
 */
export function clearSettingsCache(key?: string) {
  if (key) {
    settingsCache.delete(key);
  } else {
    settingsCache.clear();
  }
}

export type HeaderStyle = 'right' | 'left-nav' | 'center-nav';

export async function getHeaderLayoutSettings(): Promise<{
  style: HeaderStyle;
  height: number;
  stickyEnabled: boolean;
  stickyScrollY: number;
  stickyHeight: number;
}> {
  const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const rawStyle = await getSetting(SETTING_KEYS.HEADER_STYLE, SETTING_DEFAULTS[SETTING_KEYS.HEADER_STYLE]);
  const style: HeaderStyle = (rawStyle === 'left-nav' || rawStyle === 'center-nav' || rawStyle === 'right') ? rawStyle : 'right';

  const height = parseInt(await getSetting(SETTING_KEYS.HEADER_HEIGHT, SETTING_DEFAULTS[SETTING_KEYS.HEADER_HEIGHT]), 10);
  const stickyEnabled = await getSetting(SETTING_KEYS.HEADER_STICKY_ENABLED, SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_ENABLED]) === 'true';
  const stickyScrollY = parseInt(await getSetting(SETTING_KEYS.HEADER_STICKY_SCROLL_Y, SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_SCROLL_Y]), 10);
  const stickyHeight = parseInt(await getSetting(SETTING_KEYS.HEADER_STICKY_HEIGHT, SETTING_DEFAULTS[SETTING_KEYS.HEADER_STICKY_HEIGHT]), 10);

  return {
    style,
    height: clampInt(Number.isFinite(height) ? height : 80, 48, 160),
    stickyEnabled,
    stickyScrollY: clampInt(Number.isFinite(stickyScrollY) ? stickyScrollY : 120, 0, 2000),
    stickyHeight: clampInt(Number.isFinite(stickyHeight) ? stickyHeight : 64, 40, 160),
  };
}

/**
 * Get pricing layout settings
 */
export async function getPricingSettings(): Promise<{
  maxColumns: number;
  centerUneven: boolean;
}> {
  const maxColumns = parseInt(await getSetting(SETTING_KEYS.PRICING_MAX_COLUMNS, SETTING_DEFAULTS[SETTING_KEYS.PRICING_MAX_COLUMNS]), 10) || 0;
  const centerUneven = await getSetting(SETTING_KEYS.PRICING_CENTER_UNEVEN, SETTING_DEFAULTS[SETTING_KEYS.PRICING_CENTER_UNEVEN]) === 'true';
  
  return {
    maxColumns: Math.max(0, Math.min(maxColumns, 6)), // Clamp between 0-6
    centerUneven
  };
}

/**
 * Generate CSS grid classes based on pricing settings
 * Returns classes that properly center uneven rows using flexbox when needed
 */
export function generatePricingGridClasses(planCount: number, maxColumns: number, centerUneven: boolean): string {
  const baseClasses = 'grid gap-6';
  
  // If no max columns (0), use auto-fit with minimum 300px (responsive)
  if (maxColumns === 0) {
    return `${baseClasses} grid-cols-[repeat(auto-fit,minmax(300px,1fr))]`;
  }
  
  // Use explicit column count, but respect the max
  const effectiveColumns = Math.min(planCount, maxColumns);
  
  // Generate responsive grid classes based on effective columns
  let gridClasses = '';
  if (effectiveColumns === 1) {
    gridClasses = 'grid-cols-1';
  } else if (effectiveColumns === 2) {
    gridClasses = 'grid-cols-1 md:grid-cols-2';
  } else if (effectiveColumns === 3) {
    gridClasses = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  } else if (effectiveColumns === 4) {
    gridClasses = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
  } else if (effectiveColumns === 5) {
    gridClasses = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
  } else {
    gridClasses = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';
  }
  
  // Apply centering logic
  if (centerUneven) {
    if (planCount <= maxColumns) {
      // Case 1: Fewer or equal items than max columns - use flexbox to center all items
      return `flex flex-wrap gap-6 justify-center [&>*]:w-full [&>*]:max-w-sm md:[&>*]:w-auto md:[&>*]:min-w-[300px] md:[&>*]:flex-1`;
    } else {
      // Case 2: More items than max columns - we need grid but with centered last row
      // Use flexbox instead to handle the uneven last row centering properly
      const itemsPerRow = maxColumns;
      return `flex flex-wrap gap-6 justify-center [&>*]:w-full [&>*]:max-w-sm 
              ${itemsPerRow === 2 ? 'md:[&>*]:w-[calc(50%-0.75rem)]' : ''}
              ${itemsPerRow === 3 ? 'lg:[&>*]:w-[calc(33.333%-1rem)]' : ''}
              ${itemsPerRow === 4 ? 'lg:[&>*]:w-[calc(25%-1.125rem)]' : ''}
              ${itemsPerRow === 5 ? 'xl:[&>*]:w-[calc(20%-1.2rem)]' : ''}
              ${itemsPerRow === 6 ? 'xl:[&>*]:w-[calc(16.667%-1.25rem)]' : ''}
              [&>*]:min-w-[300px]`.replace(/\s+/g, ' ').trim();
    }
  }
  
  // No centering - use regular grid
  return `${baseClasses} ${gridClasses}`;
}

// Free plan configuration helpers
export async function getFreePlanSettings() {
  const [tokenLimit, renewalType, tokenName] = await Promise.all([
    getSetting(SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT]),
    getSetting(SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]),
    getSetting(SETTING_KEYS.FREE_PLAN_TOKEN_NAME, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_NAME])
  ]);

  return {
    tokenLimit: parseInt(tokenLimit, 10) || 0,
    renewalType: renewalType as FreePlanRenewalType,
    tokenName: tokenName.trim() || (await getDefaultTokenLabel())
  };
}

// Operational controls for paid-token behavior
export async function shouldResetPaidTokensOnExpiryForPlanAutoRenew(autoRenew?: boolean | null): Promise<boolean> {
  if (autoRenew) {
    const raw = await getSetting(SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_RECURRING, SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_RECURRING]);
    return raw === 'true';
  }
  const raw = await getSetting(SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_ONE_TIME, SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_ONE_TIME]);
  return raw === 'true';
}

export async function shouldResetPaidTokensOnRenewalForPlanAutoRenew(autoRenew?: boolean | null): Promise<boolean> {
  if (autoRenew) {
    const raw = await getSetting(SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_RECURRING, SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_RECURRING]);
    return raw === 'true';
  }
  const raw = await getSetting(SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_ONE_TIME, SETTING_DEFAULTS[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_ONE_TIME]);
  return raw === 'true';
}

export async function getPaidTokensNaturalExpiryGraceHours(): Promise<number> {
  const raw = await getSetting(
    SETTING_KEYS.TOKENS_NATURAL_EXPIRY_GRACE_HOURS,
    SETTING_DEFAULTS[SETTING_KEYS.TOKENS_NATURAL_EXPIRY_GRACE_HOURS]
  );

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return Number.parseInt(SETTING_DEFAULTS[SETTING_KEYS.TOKENS_NATURAL_EXPIRY_GRACE_HOURS], 10) || 24;
  }
  return parsed;
}

/**
 * Decide whether paid tokens should be cleared for any expired ACTIVE subscriptions
 * for the given user. This inspects the expired subscriptions' plan types and
 * applies the configured operation-control settings.
 */
export async function shouldResetPaidTokensOnExpiryForUser(userId: string): Promise<boolean> {
  try {
    const subs = await prisma.subscription.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
      include: { plan: { select: { autoRenew: true } } }
    });
    if (!subs || subs.length === 0) return false;
    for (const s of subs) {
      const auto = s.plan?.autoRenew === true;
      if (await shouldResetPaidTokensOnExpiryForPlanAutoRenew(auto)) return true;
    }
    return false;
  } catch {
    // On error, default to conservative behavior: reset tokens to avoid leaving paid access
    return true;
  }
}

export async function getFreeTokenLimit(): Promise<number> {
  const value = await getSetting(SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_LIMIT]);
  return parseInt(value, 10) || 0;
}

export async function getFreePlanRenewalType(): Promise<FreePlanRenewalType> {
  const value = await getSetting(SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]);
  return value as FreePlanRenewalType;
}

export async function getFreeTokenName(): Promise<string> {
  const customName = await getSetting(SETTING_KEYS.FREE_PLAN_TOKEN_NAME, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_NAME]);
  if (customName.trim()) {
    return customName.trim();
  }
  return getDefaultTokenLabel();
}

// Free-plan token reset functionality
export async function shouldResetMonthlyTokens(user: { freeTokensLastResetAt?: Date | null }): Promise<boolean> {
  const renewalType = await getFreePlanRenewalType();
  return shouldResetFreePlanTokensAt({
    renewalType,
    freeTokensLastResetAt: user.freeTokensLastResetAt ?? null,
  });
}

export async function resetUserTokensIfNeeded(userId: string): Promise<boolean> {
  const { prisma } = await import('./prisma');
  
  // Get user and check if they need a token reset
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      id: true, 
      freeTokenBalance: true,
      freeTokensLastResetAt: true,
      subscriptions: {
        where: {
          status: 'ACTIVE',
          expiresAt: { gt: new Date() }
        },
        select: { id: true }
      }
    }
  });

  if (!user) {
    return false;
  }

  // Narrow the returned user shape for local checks (avoid `any`)
  const u = user as { subscriptions?: { id: string }[] | null; freeTokensLastResetAt?: Date | null };

  // Don't reset for users with active subscriptions (they have paid plans)
  if (Array.isArray(u.subscriptions) && u.subscriptions.length > 0) {
    return false;
  }

  // Check if reset is needed (pass only the expected subset shape)
  const needsReset = await shouldResetMonthlyTokens({ freeTokensLastResetAt: u.freeTokensLastResetAt });
  if (!needsReset) {
    return false;
  }

  // Get free plan configuration
  const freePlanSettings = await getFreePlanSettings();
  const now = new Date();

  // Reset tokens
  // Use a raw SQL update here because the generated Prisma client in this
  // environment may not yet include the `freeTokenBalance`/`freeTokensLastResetAt`
  // fields until `prisma generate` is run. This avoids type errors while still
  // performing a safe DB update.
  await prisma.$executeRaw`UPDATE "User" SET "freeTokenBalance" = ${freePlanSettings.tokenLimit}, "freeTokensLastResetAt" = ${now} WHERE id = ${userId}`;

  return true;
}

export async function initializeNewUserTokens(userId: string): Promise<void> {
  const { prisma } = await import('./prisma');
  
  // Get free plan settings
  const freePlanSettings = await getFreePlanSettings();
  const now = new Date();

  // Set initial token balance based on free plan configuration
  // Use raw SQL update to avoid depending on generated client types during a staged migration
  await prisma.$executeRaw`UPDATE "User" SET "freeTokenBalance" = ${freePlanSettings.tokenLimit}, "freeTokensLastResetAt" = ${requiresFreePlanResetTracking(freePlanSettings.renewalType) ? now : null} WHERE id = ${userId}`;
}

export async function getBlogListingStyle(): Promise<string> {
  return getSetting(SETTING_KEYS.BLOG_LISTING_STYLE, SETTING_DEFAULTS[SETTING_KEYS.BLOG_LISTING_STYLE]);
}

export async function getRelatedPostsEnabled(): Promise<boolean> {
  const raw = await getSetting(SETTING_KEYS.BLOG_RELATED_POSTS_ENABLED, SETTING_DEFAULTS[SETTING_KEYS.BLOG_RELATED_POSTS_ENABLED]);
  return raw === 'true';
}

export async function getBlogHtmlSnippets(): Promise<{ beforeFirst: string; middle: string; afterLast: string }> {
  const [beforeFirst, middle, afterLast] = await Promise.all([
    getSetting(SETTING_KEYS.BLOG_HTML_BEFORE_FIRST_PARAGRAPH, SETTING_DEFAULTS[SETTING_KEYS.BLOG_HTML_BEFORE_FIRST_PARAGRAPH]),
    getSetting(SETTING_KEYS.BLOG_HTML_MIDDLE_OF_POST, SETTING_DEFAULTS[SETTING_KEYS.BLOG_HTML_MIDDLE_OF_POST]),
    getSetting(SETTING_KEYS.BLOG_HTML_AFTER_LAST_PARAGRAPH, SETTING_DEFAULTS[SETTING_KEYS.BLOG_HTML_AFTER_LAST_PARAGRAPH])
  ]);

  return { beforeFirst, middle, afterLast };
}

export async function getBlogSidebarSettings(): Promise<{
  enabled: boolean; // legacy - maps to enabledIndex for backward compatibility
  enabledIndex: boolean;
  enabledSingle: boolean;
  enabledPages: boolean;
  enabledArchive: boolean;
  showRecent: boolean;
  recentCount: number;
  content: string;
  html: string;
  widgetOrder: string[];
}> {
  const [
    enabled,
    enabledIndex,
    enabledArchiveRaw,
    enabledSingle,
    enabledPagesRaw,
    showRecent,
    recentCount,
    content,
    html,
    widgetOrder,
    pagesSettingRow,
    archiveSettingRow
  ] = await Promise.all([
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_ENABLED, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_ENABLED]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_INDEX, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_ENABLED_INDEX]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_ARCHIVE, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_ENABLED_ARCHIVE]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_SINGLE, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_ENABLED_SINGLE]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_PAGES, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_ENABLED_PAGES]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_SHOW_RECENT, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_SHOW_RECENT]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_RECENT_COUNT, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_RECENT_COUNT]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_CONTENT, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_CONTENT]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_HTML, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_HTML]),
    getSetting(SETTING_KEYS.BLOG_SIDEBAR_WIDGET_ORDER, SETTING_DEFAULTS[SETTING_KEYS.BLOG_SIDEBAR_WIDGET_ORDER]),
    safeFindSettingKey(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_PAGES),
    safeFindSettingKey(SETTING_KEYS.BLOG_SIDEBAR_ENABLED_ARCHIVE)
  ]);

  const idx = enabledIndex === 'true';
  const single = enabledSingle === 'true';
  const legacyFallback = enabled === 'true' || idx;
  const hasExplicitPagesSetting = !!pagesSettingRow;
  const hasExplicitArchiveSetting = !!archiveSettingRow;

  const pages = hasExplicitPagesSetting ? (enabledPagesRaw === 'true') : legacyFallback;
  const archive = hasExplicitArchiveSetting ? (enabledArchiveRaw === 'true') : legacyFallback;

  return {
    // legacy `enabled` mirrors the index setting for backward compatibility
    enabled: legacyFallback,
    enabledIndex: idx,
    enabledSingle: single,
    enabledPages: pages,
    enabledArchive: archive,
    showRecent: showRecent === 'true',
    recentCount: Math.max(1, Math.min(20, parseInt(recentCount, 10) || 5)),
    content,
    html,
    widgetOrder: widgetOrder.split(',').filter(w => w.trim()).map(w => w.trim())
  };
}

export async function getBlogListingPageSize(): Promise<number> {
  const raw = await getSetting(SETTING_KEYS.BLOG_LISTING_PAGE_SIZE, SETTING_DEFAULTS[SETTING_KEYS.BLOG_LISTING_PAGE_SIZE]);
  const n = Math.max(1, Math.min(50, parseInt(raw, 10) || 10));
  return n;
}
