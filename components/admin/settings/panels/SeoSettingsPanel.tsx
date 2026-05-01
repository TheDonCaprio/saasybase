"use client";

import { useState } from 'react';
import { showToast } from '../../../ui/Toast';
import { resolveSeoUrl, serializeSitemapCustomUrls, type SeoSettings } from '../../../../lib/seo-shared';

const SEO_FIELD_LIMITS = {
  metaTitle: 60,
  metaDescription: 160,
  titleSuffix: 120,
  titleTemplate: 200,
  ogTitle: 95,
  ogDescription: 200,
  url: 2048,
  verificationToken: 255,
  sitemapCustomUrls: 5000,
} as const;

function clampField(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function getLengthLabel(value: string, maxLength: number): string {
  return `${value.length}/${maxLength}`;
}

interface SeoSettingsPanelProps {
  initialSettings: SeoSettings;
}

export function SeoSettingsPanel({ initialSettings }: SeoSettingsPanelProps) {
  const [homeMetaTitle, setHomeMetaTitle] = useState(initialSettings.homeMetaTitle);
  const [homeMetaDescription, setHomeMetaDescription] = useState(initialSettings.homeMetaDescription);
  const [noIndexSite, setNoIndexSite] = useState(initialSettings.noIndexSite);
  const [titleSuffix, setTitleSuffix] = useState(initialSettings.titleSuffix);
  const [titleTemplate, setTitleTemplate] = useState(initialSettings.titleTemplate);
  const [homeOgTitle, setHomeOgTitle] = useState(initialSettings.homeOgTitle);
  const [homeOgDescription, setHomeOgDescription] = useState(initialSettings.homeOgDescription);
  const [homeOgImage, setHomeOgImage] = useState(initialSettings.homeOgImage);
  const [defaultOgTitle, setDefaultOgTitle] = useState(initialSettings.defaultOgTitle);
  const [defaultOgDescription, setDefaultOgDescription] = useState(initialSettings.defaultOgDescription);
  const [defaultOgImage, setDefaultOgImage] = useState(initialSettings.defaultOgImage);
  const [homeCanonicalUrl, setHomeCanonicalUrl] = useState(initialSettings.homeCanonicalUrl);
  const [blogMetaTitle, setBlogMetaTitle] = useState(initialSettings.blogMetaTitle);
  const [blogMetaDescription, setBlogMetaDescription] = useState(initialSettings.blogMetaDescription);
  const [noIndexBlogIndex, setNoIndexBlogIndex] = useState(initialSettings.noIndexBlogIndex);
  const [noIndexBlogCategoryPages, setNoIndexBlogCategoryPages] = useState(initialSettings.noIndexBlogCategoryPages);
  const [customSitemapEntries, setCustomSitemapEntries] = useState(initialSettings.customSitemapEntries.join('\n'));
  const [excludedSitemapEntries, setExcludedSitemapEntries] = useState(initialSettings.excludedSitemapEntries.join('\n'));
  const [googleSiteVerification, setGoogleSiteVerification] = useState(initialSettings.googleSiteVerification);
  const [bingSiteVerification, setBingSiteVerification] = useState(initialSettings.bingSiteVerification);
  const [saving, setSaving] = useState(false);

  const resolvedPreviewUrl = resolveSeoUrl(homeCanonicalUrl, { siteUrl: initialSettings.siteUrl, sameOriginOnly: true }) || initialSettings.siteUrl;
  const previewTitle = homeMetaTitle.trim() || 'Homepage title preview';
  const previewDescription = homeMetaDescription.trim() || 'Your homepage description will appear here once you save SEO settings.';
  const previewTitleTemplate = titleTemplate.trim().includes('%s')
    ? titleTemplate.trim().replace('%s', previewTitle)
    : (titleSuffix.trim() ? `${previewTitle} | ${titleSuffix.trim()}` : `${previewTitle} | ${initialSettings.siteUrl.replace(/^https?:\/\//, '')}`);

  const validateOptionalUrl = (value: string, label: string, sameOriginOnly = false): boolean => {
    if (!value.trim()) return true;
    if (resolveSeoUrl(value, { siteUrl: initialSettings.siteUrl, sameOriginOnly })) return true;
    showToast(`${label} must be a valid ${sameOriginOnly ? 'same-site ' : ''}absolute URL or a path starting with /.`, 'error');
    return false;
  };

  const saveSettings = async () => {
    if (saving) return;

    if (!validateOptionalUrl(homeCanonicalUrl, 'Home canonical URL', true)) return;
    if (!validateOptionalUrl(homeOgImage, 'Home social image')) return;
    if (!validateOptionalUrl(defaultOgImage, 'Default social image')) return;

    const customEntries = customSitemapEntries
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const excludedEntries = excludedSitemapEntries
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of customEntries) {
      if (!resolveSeoUrl(entry, { siteUrl: initialSettings.siteUrl, sameOriginOnly: true })) {
        showToast('Custom sitemap URLs must be same-site absolute URLs or paths starting with /.', 'error');
        return;
      }
    }

    for (const entry of excludedEntries) {
      if (!resolveSeoUrl(entry, { siteUrl: initialSettings.siteUrl, sameOriginOnly: true })) {
        showToast('Sitemap exclusions must be same-site absolute URLs or paths starting with /.', 'error');
        return;
      }
    }

    if (titleTemplate.trim() && !titleTemplate.includes('%s')) {
      showToast('Sitewide title template must include %s where the page title should appear.', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [
            { key: 'SEO_HOME_META_TITLE', value: homeMetaTitle.trim() },
            { key: 'SEO_HOME_META_DESCRIPTION', value: homeMetaDescription.trim() },
            { key: 'SEO_NOINDEX_SITE', value: noIndexSite ? 'true' : 'false' },
            { key: 'SEO_TITLE_SUFFIX', value: titleSuffix.trim() },
            { key: 'SEO_TITLE_TEMPLATE', value: titleTemplate.trim() },
            { key: 'SEO_HOME_OG_TITLE', value: homeOgTitle.trim() },
            { key: 'SEO_HOME_OG_DESCRIPTION', value: homeOgDescription.trim() },
            { key: 'SEO_HOME_OG_IMAGE', value: homeOgImage.trim() },
            { key: 'SEO_DEFAULT_OG_TITLE', value: defaultOgTitle.trim() },
            { key: 'SEO_DEFAULT_OG_DESCRIPTION', value: defaultOgDescription.trim() },
            { key: 'SEO_DEFAULT_OG_IMAGE', value: defaultOgImage.trim() },
            { key: 'SEO_HOME_CANONICAL_URL', value: homeCanonicalUrl.trim() },
            { key: 'SEO_BLOG_META_TITLE', value: blogMetaTitle.trim() },
            { key: 'SEO_BLOG_META_DESCRIPTION', value: blogMetaDescription.trim() },
            { key: 'SEO_NOINDEX_BLOG_INDEX', value: noIndexBlogIndex ? 'true' : 'false' },
            { key: 'SEO_NOINDEX_BLOG_CATEGORY_PAGES', value: noIndexBlogCategoryPages ? 'true' : 'false' },
            { key: 'SEO_SITEMAP_CUSTOM_URLS', value: serializeSitemapCustomUrls(customEntries) },
            { key: 'SEO_SITEMAP_EXCLUDED_URLS', value: serializeSitemapCustomUrls(excludedEntries) },
            { key: 'SEO_GOOGLE_SITE_VERIFICATION', value: googleSiteVerification.trim() },
            { key: 'SEO_BING_SITE_VERIFICATION', value: bingSiteVerification.trim() },
          ],
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to save SEO settings');
      }

      showToast('SEO settings updated', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save SEO settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--theme-surface-radius)] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">SEO tab scope</p>
        <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">This tab manages homepage metadata, blog listing metadata, sitemap output, verification tags, and global social fallbacks. CMS pages and blog posts still use their own per-page SEO fields, and some public routes can still define route-specific metadata.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Homepage search preview</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">Controls the title, description, canonical URL, and social preview for the root landing page.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950/70">
              <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">{resolvedPreviewUrl}</p>
              <p className="mt-1 line-clamp-2 text-lg leading-6 text-blue-700 dark:text-blue-400">{previewTitleTemplate}</p>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-neutral-400">{previewDescription}</p>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home meta title</span>
              <input value={homeMetaTitle} onChange={(event) => setHomeMetaTitle(clampField(event.target.value, SEO_FIELD_LIMITS.metaTitle))} maxLength={SEO_FIELD_LIMITS.metaTitle} placeholder="My product | Fast SaaS workflows" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Keep it under 60 characters for cleaner search results. {getLengthLabel(homeMetaTitle, SEO_FIELD_LIMITS.metaTitle)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home meta description</span>
              <textarea value={homeMetaDescription} onChange={(event) => setHomeMetaDescription(clampField(event.target.value, SEO_FIELD_LIMITS.metaDescription))} maxLength={SEO_FIELD_LIMITS.metaDescription} rows={4} placeholder="Concise summary for search engines and social previews." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Aim for 140 to 160 characters. {getLengthLabel(homeMetaDescription, SEO_FIELD_LIMITS.metaDescription)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Sitewide title suffix</span>
              <input value={titleSuffix} onChange={(event) => setTitleSuffix(clampField(event.target.value, SEO_FIELD_LIMITS.titleSuffix))} maxLength={SEO_FIELD_LIMITS.titleSuffix} placeholder="Example SaaS" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Used when no custom sitewide template is set. {getLengthLabel(titleSuffix, SEO_FIELD_LIMITS.titleSuffix)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Sitewide title template</span>
              <input value={titleTemplate} onChange={(event) => setTitleTemplate(clampField(event.target.value, SEO_FIELD_LIMITS.titleTemplate))} maxLength={SEO_FIELD_LIMITS.titleTemplate} placeholder="%s | Example SaaS" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Include %s where the page title should appear. {getLengthLabel(titleTemplate, SEO_FIELD_LIMITS.titleTemplate)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home canonical URL</span>
              <input value={homeCanonicalUrl} onChange={(event) => setHomeCanonicalUrl(clampField(event.target.value, SEO_FIELD_LIMITS.url))} maxLength={SEO_FIELD_LIMITS.url} placeholder="/ or https://yourdomain.com/" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Use a single canonical URL for the homepage. {getLengthLabel(homeCanonicalUrl, SEO_FIELD_LIMITS.url)}</span>
            </label>
          </div>
        </section>

        <section className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Social sharing</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">Optional overrides for Open Graph and Twitter cards on the homepage.</p>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home OG title</span>
              <input value={homeOgTitle} onChange={(event) => setHomeOgTitle(clampField(event.target.value, SEO_FIELD_LIMITS.ogTitle))} maxLength={SEO_FIELD_LIMITS.ogTitle} placeholder="Shown when the homepage is shared" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Social titles can run a bit longer than search titles. {getLengthLabel(homeOgTitle, SEO_FIELD_LIMITS.ogTitle)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home OG description</span>
              <textarea value={homeOgDescription} onChange={(event) => setHomeOgDescription(clampField(event.target.value, SEO_FIELD_LIMITS.ogDescription))} maxLength={SEO_FIELD_LIMITS.ogDescription} rows={3} placeholder="Optional social-specific description." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Keep this concise for link previews. {getLengthLabel(homeOgDescription, SEO_FIELD_LIMITS.ogDescription)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Home social image</span>
              <input value={homeOgImage} onChange={(event) => setHomeOgImage(clampField(event.target.value, SEO_FIELD_LIMITS.url))} maxLength={SEO_FIELD_LIMITS.url} placeholder="https://yourdomain.com/og/home.jpg or /og/home.jpg" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Absolute URL or root-relative path. {getLengthLabel(homeOgImage, SEO_FIELD_LIMITS.url)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Default OG title</span>
              <input value={defaultOgTitle} onChange={(event) => setDefaultOgTitle(clampField(event.target.value, SEO_FIELD_LIMITS.ogTitle))} maxLength={SEO_FIELD_LIMITS.ogTitle} placeholder="Used when a public route has no dedicated social title" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Fallback social title for marketing and system routes without explicit OG copy. {getLengthLabel(defaultOgTitle, SEO_FIELD_LIMITS.ogTitle)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Default OG description</span>
              <textarea value={defaultOgDescription} onChange={(event) => setDefaultOgDescription(clampField(event.target.value, SEO_FIELD_LIMITS.ogDescription))} maxLength={SEO_FIELD_LIMITS.ogDescription} rows={3} placeholder="Used when a public route has no dedicated social description" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Fallback social description for non-CMS public routes. {getLengthLabel(defaultOgDescription, SEO_FIELD_LIMITS.ogDescription)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Default social image</span>
              <input value={defaultOgImage} onChange={(event) => setDefaultOgImage(clampField(event.target.value, SEO_FIELD_LIMITS.url))} maxLength={SEO_FIELD_LIMITS.url} placeholder="Used as a fallback on static and CMS pages without an explicit OG image" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Fallback image used when a route does not define its own. {getLengthLabel(defaultOgImage, SEO_FIELD_LIMITS.url)}</span>
            </label>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Blog SEO</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">Applies to the main blog listing. Individual posts and CMS pages still use their own per-page SEO fields.</p>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Blog index meta title</span>
              <input value={blogMetaTitle} onChange={(event) => setBlogMetaTitle(clampField(event.target.value, SEO_FIELD_LIMITS.metaTitle))} maxLength={SEO_FIELD_LIMITS.metaTitle} placeholder="Blog | Your site name" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Search titles should stay tight. {getLengthLabel(blogMetaTitle, SEO_FIELD_LIMITS.metaTitle)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Blog index meta description</span>
              <textarea value={blogMetaDescription} onChange={(event) => setBlogMetaDescription(clampField(event.target.value, SEO_FIELD_LIMITS.metaDescription))} maxLength={SEO_FIELD_LIMITS.metaDescription} rows={3} placeholder="What search engines should show for /blog." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Aim for 140 to 160 characters. {getLengthLabel(blogMetaDescription, SEO_FIELD_LIMITS.metaDescription)}</span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950/50">
              <input type="checkbox" checked={noIndexBlogIndex} onChange={(event) => setNoIndexBlogIndex(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span>
                <span className="block font-medium text-slate-800 dark:text-neutral-100">No-index blog listing</span>
                <span className="mt-1 block text-xs text-slate-600 dark:text-neutral-400">Use this when you want the blog archive hidden from search while keeping individual posts accessible.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950/50">
              <input type="checkbox" checked={noIndexBlogCategoryPages} onChange={(event) => setNoIndexBlogCategoryPages(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span>
                <span className="block font-medium text-slate-800 dark:text-neutral-100">No-index blog category pages</span>
                <span className="mt-1 block text-xs text-slate-600 dark:text-neutral-400">Enabled by default so thin archive pages do not compete with the main blog index or individual posts.</span>
              </span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Google site verification token</span>
              <input value={googleSiteVerification} onChange={(event) => setGoogleSiteVerification(clampField(event.target.value, SEO_FIELD_LIMITS.verificationToken))} maxLength={SEO_FIELD_LIMITS.verificationToken} placeholder="google-site-verification token from Search Console" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Paste only the token value, not the full meta tag. {getLengthLabel(googleSiteVerification, SEO_FIELD_LIMITS.verificationToken)}</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Bing site verification token</span>
              <input value={bingSiteVerification} onChange={(event) => setBingSiteVerification(clampField(event.target.value, SEO_FIELD_LIMITS.verificationToken))} maxLength={SEO_FIELD_LIMITS.verificationToken} placeholder="msvalidate.01 token from Bing Webmaster Tools" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
              <span className="block text-xs text-slate-500 dark:text-neutral-400">Paste only the token value, not the full meta tag. {getLengthLabel(bingSiteVerification, SEO_FIELD_LIMITS.verificationToken)}</span>
            </label>
          </div>
        </section>

        <section className="rounded-[var(--theme-surface-radius)] border border-slate-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Sitemap</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-neutral-400">The generated sitemap includes the homepage, published blog posts, published site pages, and the custom URLs listed below.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950/50">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-400">Sitemap URL</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900 dark:text-neutral-100">{initialSettings.sitemapUrl}</p>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Custom sitemap URLs</span>
              <textarea value={customSitemapEntries} onChange={(event) => setCustomSitemapEntries(clampField(event.target.value, SEO_FIELD_LIMITS.sitemapCustomUrls))} maxLength={SEO_FIELD_LIMITS.sitemapCustomUrls} rows={8} placeholder={'/pricing/enterprise\n/docs/getting-started'} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
            </label>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Add one URL per line. Use same-site absolute URLs or root-relative paths beginning with /. {getLengthLabel(customSitemapEntries, SEO_FIELD_LIMITS.sitemapCustomUrls)}</p>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-neutral-200">Sitemap exclusions</span>
              <textarea value={excludedSitemapEntries} onChange={(event) => setExcludedSitemapEntries(clampField(event.target.value, SEO_FIELD_LIMITS.sitemapCustomUrls))} maxLength={SEO_FIELD_LIMITS.sitemapCustomUrls} rows={6} placeholder={'/blog\n/privacy'} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
            </label>
            <p className="text-xs text-slate-500 dark:text-neutral-400">Exclude exact public URLs from the generated sitemap. Use same-site absolute URLs or root-relative paths. {getLengthLabel(excludedSitemapEntries, SEO_FIELD_LIMITS.sitemapCustomUrls)}</p>
            <label className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-sm dark:border-rose-900/70 dark:bg-rose-950/30">
              <input type="checkbox" checked={noIndexSite} onChange={(event) => setNoIndexSite(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              <span>
                <span className="block font-medium text-rose-900 dark:text-rose-100">No-index the whole site</span>
                <span className="mt-1 block text-xs text-rose-800/90 dark:text-rose-100/85">Warning: this asks search engines to remove the entire site from Google and other search results. Use only for private launches, staging, or temporary takedowns.</span>
              </span>
            </label>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={saveSettings} disabled={saving} className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Saving…' : 'Save SEO settings'}
        </button>
        <p className="text-xs text-slate-500 dark:text-neutral-400">Changes apply to metadata, robots, and sitemap output after the next route revalidation.</p>
      </div>
    </div>
  );
}