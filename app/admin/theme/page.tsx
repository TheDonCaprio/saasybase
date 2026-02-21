import React from 'react';
export const dynamic = 'force-dynamic';
import { requireAdminAuth } from '../../../lib/route-guards';
import { toError } from '../../../lib/runtime-guards';
import {
  getThemeHeaderLinks,
  getThemeFooterLinks,
  getThemeFooterTextRaw,
  getThemeCustomCss,
  getThemeCustomHeadSnippet,
  getThemeCustomBodySnippet,
  getThemeCustomSnippet,
  getSiteName,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  getPricingSettings,
  getBlogListingStyle,
  getBlogListingPageSize,
  getBlogSidebarSettings,
  getRelatedPostsEnabled
  ,getBlogHtmlSnippets
} from '../../../lib/settings';
import { ThemeSettingsTabs } from '../../../components/admin/theme/ThemeSettingsTabs';
import { buildDashboardMetadata } from '../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Theme',
    description: 'Curate how visitors experience your brand across navigation, footers, and custom snippets without leaving the admin console.',
    audience: 'admin',
  });
}

export default async function AdminThemePage() {
  await requireAdminAuth('/admin/theme');

  try {
    await requireAdminAuth('/admin/theme');
  } catch (err: unknown) {
    const e = toError(err);
    console.warn('Admin theme: requireAdmin check failed or redirected', e?.message);
  }

  const [siteName, headerLinks, footerLinks, footerText, customCss, customHead, customBody, legacyBody, pricingSettings, blogListingStyle, blogListingPageSize, blogSidebarSettings, relatedPostsEnabled, blogHtmlSnippets] = await Promise.all([
    getSiteName().catch(() => process.env.NEXT_PUBLIC_SITE_NAME || SETTING_DEFAULTS[SETTING_KEYS.SITE_NAME]),
    getThemeHeaderLinks(),
    getThemeFooterLinks(),
    getThemeFooterTextRaw(),
    getThemeCustomCss(),
    getThemeCustomHeadSnippet(),
    getThemeCustomBodySnippet(),
    getThemeCustomSnippet(),
    getPricingSettings(),
    getBlogListingStyle(),
    getBlogListingPageSize(),
    getBlogSidebarSettings(),
    getRelatedPostsEnabled()
    ,getBlogHtmlSnippets()
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white p-6 shadow-sm dark:border-violet-500/30 dark:from-violet-500/15 dark:via-fuchsia-500/10 dark:to-transparent dark:shadow-[0_0_24px_rgba(139,92,246,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-600 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100">
              <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse dark:bg-violet-300" />
              Theme designer
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-neutral-50">Theme & Navigation</h1>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-white/70 px-4 py-3 text-sm text-slate-600 shadow-sm backdrop-blur-sm dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-neutral-100 dark:shadow-inner">
            <p className="text-xs uppercase tracking-wide text-violet-500 dark:text-violet-200/80">Live preview</p>
            <p className="mt-1 text-sm">Changes apply immediately after saving.</p>
          </div>
        </div>
      </div>

      <ThemeSettingsTabs
        initialHeaderLinks={headerLinks}
        initialFooterLinks={footerLinks}
        initialFooterText={footerText}
        initialCustomCss={customCss}
        initialCustomHead={customHead}
        initialCustomBody={customBody || legacyBody}
        initialPricingSettings={pricingSettings}
        initialBlogListingStyle={blogListingStyle}
        initialBlogListingPageSize={blogListingPageSize}
        initialBlogSidebarSettings={blogSidebarSettings}
        initialRelatedPostsEnabled={relatedPostsEnabled}
        initialBlogHtmlBeforeFirst={blogHtmlSnippets.beforeFirst}
        initialBlogHtmlMiddle={blogHtmlSnippets.middle}
        initialBlogHtmlAfterLast={blogHtmlSnippets.afterLast}
      />
    </div>
  );
}
