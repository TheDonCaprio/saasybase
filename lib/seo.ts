import { getSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import {
  getConfiguredSiteUrl,
  parseSitemapCustomUrlSetting,
  resolveSeoUrl,
  type SeoSettings,
} from './seo-shared';

export async function getSeoSettings(): Promise<SeoSettings> {
  const siteUrl = getConfiguredSiteUrl();
  const [
    homeMetaTitle,
    homeMetaDescription,
    noIndexSiteRaw,
    titleSuffix,
    titleTemplate,
    homeOgTitle,
    homeOgDescription,
    homeOgImage,
    defaultOgTitle,
    defaultOgDescription,
    defaultOgImage,
    homeCanonicalUrl,
    blogMetaTitle,
    blogMetaDescription,
    noIndexBlogIndexRaw,
    noIndexBlogCategoryPagesRaw,
    customSitemapUrlsRaw,
    excludedSitemapUrlsRaw,
    googleSiteVerification,
    bingSiteVerification,
  ] = await Promise.all([
    getSetting(SETTING_KEYS.SEO_HOME_META_TITLE, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_META_TITLE]),
    getSetting(SETTING_KEYS.SEO_HOME_META_DESCRIPTION, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_META_DESCRIPTION]),
    getSetting(SETTING_KEYS.SEO_NOINDEX_SITE, SETTING_DEFAULTS[SETTING_KEYS.SEO_NOINDEX_SITE]),
    getSetting(SETTING_KEYS.SEO_TITLE_SUFFIX, SETTING_DEFAULTS[SETTING_KEYS.SEO_TITLE_SUFFIX]),
    getSetting(SETTING_KEYS.SEO_TITLE_TEMPLATE, SETTING_DEFAULTS[SETTING_KEYS.SEO_TITLE_TEMPLATE]),
    getSetting(SETTING_KEYS.SEO_HOME_OG_TITLE, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_OG_TITLE]),
    getSetting(SETTING_KEYS.SEO_HOME_OG_DESCRIPTION, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_OG_DESCRIPTION]),
    getSetting(SETTING_KEYS.SEO_HOME_OG_IMAGE, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_OG_IMAGE]),
    getSetting(SETTING_KEYS.SEO_DEFAULT_OG_TITLE, SETTING_DEFAULTS[SETTING_KEYS.SEO_DEFAULT_OG_TITLE]),
    getSetting(SETTING_KEYS.SEO_DEFAULT_OG_DESCRIPTION, SETTING_DEFAULTS[SETTING_KEYS.SEO_DEFAULT_OG_DESCRIPTION]),
    getSetting(SETTING_KEYS.SEO_DEFAULT_OG_IMAGE, SETTING_DEFAULTS[SETTING_KEYS.SEO_DEFAULT_OG_IMAGE]),
    getSetting(SETTING_KEYS.SEO_HOME_CANONICAL_URL, SETTING_DEFAULTS[SETTING_KEYS.SEO_HOME_CANONICAL_URL]),
    getSetting(SETTING_KEYS.SEO_BLOG_META_TITLE, SETTING_DEFAULTS[SETTING_KEYS.SEO_BLOG_META_TITLE]),
    getSetting(SETTING_KEYS.SEO_BLOG_META_DESCRIPTION, SETTING_DEFAULTS[SETTING_KEYS.SEO_BLOG_META_DESCRIPTION]),
    getSetting(SETTING_KEYS.SEO_NOINDEX_BLOG_INDEX, SETTING_DEFAULTS[SETTING_KEYS.SEO_NOINDEX_BLOG_INDEX]),
    getSetting(
      SETTING_KEYS.SEO_NOINDEX_BLOG_CATEGORY_PAGES,
      SETTING_DEFAULTS[SETTING_KEYS.SEO_NOINDEX_BLOG_CATEGORY_PAGES]
    ),
    getSetting(SETTING_KEYS.SEO_SITEMAP_CUSTOM_URLS, SETTING_DEFAULTS[SETTING_KEYS.SEO_SITEMAP_CUSTOM_URLS]),
    getSetting(SETTING_KEYS.SEO_SITEMAP_EXCLUDED_URLS, SETTING_DEFAULTS[SETTING_KEYS.SEO_SITEMAP_EXCLUDED_URLS]),
    getSetting(SETTING_KEYS.SEO_GOOGLE_SITE_VERIFICATION, SETTING_DEFAULTS[SETTING_KEYS.SEO_GOOGLE_SITE_VERIFICATION]),
    getSetting(SETTING_KEYS.SEO_BING_SITE_VERIFICATION, SETTING_DEFAULTS[SETTING_KEYS.SEO_BING_SITE_VERIFICATION]),
  ]);

  const customSitemapEntries = parseSitemapCustomUrlSetting(customSitemapUrlsRaw);
  const customSitemapUrls = Array.from(new Set(
    customSitemapEntries
      .map((entry) => resolveSeoUrl(entry, { siteUrl, sameOriginOnly: true }))
      .filter((entry): entry is string => Boolean(entry))
  ));
  const excludedSitemapEntries = parseSitemapCustomUrlSetting(excludedSitemapUrlsRaw);
  const excludedSitemapUrls = Array.from(new Set(
    excludedSitemapEntries
      .map((entry) => resolveSeoUrl(entry, { siteUrl, sameOriginOnly: true }))
      .filter((entry): entry is string => Boolean(entry))
  ));

  return {
    siteUrl,
    sitemapUrl: new URL('/sitemap.xml', `${siteUrl}/`).toString(),
    homeMetaTitle,
    homeMetaDescription,
    noIndexSite: noIndexSiteRaw === 'true',
    titleSuffix,
    titleTemplate,
    homeOgTitle,
    homeOgDescription,
    homeOgImage,
    resolvedHomeOgImageUrl: resolveSeoUrl(homeOgImage, { siteUrl }) ?? undefined,
    defaultOgTitle,
    defaultOgDescription,
    defaultOgImage,
    resolvedDefaultOgImageUrl: resolveSeoUrl(defaultOgImage, { siteUrl }) ?? undefined,
    homeCanonicalUrl,
    resolvedHomeCanonicalUrl: resolveSeoUrl(homeCanonicalUrl, { siteUrl, sameOriginOnly: true }) ?? siteUrl,
    blogMetaTitle,
    blogMetaDescription,
    noIndexBlogIndex: noIndexBlogIndexRaw === 'true',
    noIndexBlogCategoryPages: noIndexBlogCategoryPagesRaw === 'true',
    googleSiteVerification,
    bingSiteVerification,
    customSitemapEntries,
    customSitemapUrls,
    excludedSitemapEntries,
    excludedSitemapUrls,
  };
}