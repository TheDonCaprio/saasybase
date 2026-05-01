const LOCAL_DEFAULT_SITE_URL = 'http://localhost:3000';

function normalizeConfiguredSiteUrl(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

function getFallbackConfiguredSiteUrl(): string {
  return normalizeConfiguredSiteUrl(process.env.NEXT_PUBLIC_APP_URL)
    ?? normalizeConfiguredSiteUrl(process.env.NEXTAUTH_URL)
    ?? normalizeConfiguredSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ?? normalizeConfiguredSiteUrl(process.env.VERCEL_URL)
    ?? LOCAL_DEFAULT_SITE_URL;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getConfiguredSiteUrl(): string {
  return getFallbackConfiguredSiteUrl();
}

export function resolveSeoUrl(
  raw: string | null | undefined,
  options: { siteUrl?: string; sameOriginOnly?: boolean } = {}
): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;

  const siteUrl = normalizeConfiguredSiteUrl(options.siteUrl) ?? getFallbackConfiguredSiteUrl();
  const siteOrigin = new URL(siteUrl).origin;

  try {
    const resolved = trimmed.startsWith('/') ? new URL(trimmed, `${siteUrl}/`) : new URL(trimmed);
    if (options.sameOriginOnly && resolved.origin !== siteOrigin) {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export function parseSitemapCustomUrlSetting(raw: string | null | undefined): string[] {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueStrings(
      parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  } catch {
    return uniqueStrings(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
  }
}

export function buildSeoTitleTemplate(options: {
  siteName: string;
  customSuffix?: string | null;
  customTemplate?: string | null;
}): string {
  const siteName = options.siteName.trim();
  const template = typeof options.customTemplate === 'string' ? options.customTemplate.trim() : '';
  if (template.includes('%s')) {
    return template;
  }

  const suffix = typeof options.customSuffix === 'string' ? options.customSuffix.trim() : '';
  if (suffix) {
    return `%s | ${suffix}`;
  }

  return `%s | ${siteName}`;
}

export function serializeSitemapCustomUrls(entries: string[]): string {
  return JSON.stringify(uniqueStrings(entries.map((entry) => entry.trim()).filter(Boolean)));
}

export interface SeoSettings {
  siteUrl: string;
  sitemapUrl: string;
  homeMetaTitle: string;
  homeMetaDescription: string;
  noIndexSite: boolean;
  titleSuffix: string;
  titleTemplate: string;
  homeOgTitle: string;
  homeOgDescription: string;
  homeOgImage: string;
  resolvedHomeOgImageUrl?: string;
  defaultOgTitle: string;
  defaultOgDescription: string;
  defaultOgImage: string;
  resolvedDefaultOgImageUrl?: string;
  homeCanonicalUrl: string;
  resolvedHomeCanonicalUrl?: string;
  blogMetaTitle: string;
  blogMetaDescription: string;
  noIndexBlogIndex: boolean;
  noIndexBlogCategoryPages: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
  customSitemapEntries: string[];
  customSitemapUrls: string[];
  excludedSitemapEntries: string[];
  excludedSitemapUrls: string[];
}