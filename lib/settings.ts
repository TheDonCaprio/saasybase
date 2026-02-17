import { prisma } from './prisma';
import { emitUnmigratedDbHealthWarningOnce, Logger } from './logger';

export type AppFormatMode = 'short' | 'datetime' | 'iso' | 'locale';

// Cache for settings to avoid database hits
const settingsCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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
  PRICING_MAX_COLUMNS: 'PRICING_MAX_COLUMNS',
  PRICING_CENTER_UNEVEN: 'PRICING_CENTER_UNEVEN',
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
  [SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]: 'one-time', // 'unlimited', 'monthly', 'one-time'
  [SETTING_KEYS.FREE_PLAN_TOKEN_NAME]: '', // empty means use default token label
  [SETTING_KEYS.MODERATOR_PERMISSIONS]: '{"users":true,"transactions":true,"purchases":true,"subscriptions":true,"support":true,"notifications":true,"blog":true,"analytics":false,"traffic":false}',
  [SETTING_KEYS.THEME_HEADER_LINKS]: '[{"label":"Pricing","href":"/pricing"},{"label":"Dashboard","href":"/dashboard"},{"label":"Admin","href":"/admin"}]',
  [SETTING_KEYS.THEME_FOOTER_LINKS]: '[{"label":"Privacy","href":"/privacy"},{"label":"Terms","href":"/terms"},{"label":"Contact","href":"/contact"}]',
  [SETTING_KEYS.BLOG_LISTING_STYLE]: 'simple',
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
  [SETTING_KEYS.PRICING_MAX_COLUMNS]: '0', // 0 means no limit (auto-fit)
  [SETTING_KEYS.PRICING_CENTER_UNEVEN]: 'false'
  ,[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_ONE_TIME]: 'true'
  ,[SETTING_KEYS.TOKENS_RESET_ON_EXPIRY_RECURRING]: 'true'
  ,[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_ONE_TIME]: 'false'
  ,[SETTING_KEYS.TOKENS_RESET_ON_RENEWAL_RECURRING]: 'false'
  ,[SETTING_KEYS.TOKENS_NATURAL_EXPIRY_GRACE_HOURS]: '24'
  ,[SETTING_KEYS.ADMIN_ACTION_NOTIFICATION_ACTIONS]: '[]'
  ,[SETTING_KEYS.ADMIN_ALERT_EMAIL_TYPES]: '["refund","new_purchase","renewal","upgrade","downgrade","payment_failed","dispute","other"]'
  ,[SETTING_KEYS.SUPPORT_EMAIL_NOTIFICATION_TYPES]: '["new_ticket_to_admin","admin_reply_to_user","user_reply_to_admin"]'
} as const;

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
    renewalType: renewalType as 'unlimited' | 'monthly' | 'one-time',
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

export async function getFreePlanRenewalType(): Promise<'unlimited' | 'monthly' | 'one-time'> {
  const value = await getSetting(SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_RENEWAL_TYPE]);
  return value as 'unlimited' | 'monthly' | 'one-time';
}

export async function getFreeTokenName(): Promise<string> {
  const customName = await getSetting(SETTING_KEYS.FREE_PLAN_TOKEN_NAME, SETTING_DEFAULTS[SETTING_KEYS.FREE_PLAN_TOKEN_NAME]);
  if (customName.trim()) {
    return customName.trim();
  }
  return getDefaultTokenLabel();
}

// Monthly token reset functionality
export async function shouldResetMonthlyTokens(user: { freeTokensLastResetAt?: Date | null }): Promise<boolean> {
  const renewalType = await getFreePlanRenewalType();
  if (renewalType !== 'monthly') {
    return false;
  }

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // If never reset, or last reset was before this month
  return !user.freeTokensLastResetAt || user.freeTokensLastResetAt < currentMonthStart;
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
  await prisma.$executeRaw`UPDATE "User" SET "freeTokenBalance" = ${freePlanSettings.tokenLimit}, "freeTokensLastResetAt" = ${freePlanSettings.renewalType === 'monthly' ? now : null} WHERE id = ${userId}`;
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
